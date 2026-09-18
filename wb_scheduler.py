"""wb_scheduler.py —— 后台定时调度器 (Scheduler)

负责常驻后台自动执行：
1. Token 保活 (Keepalive)：定期检查 Token 剩余寿命，不足 2 小时自动调用 Refresh Token。
2. 每日签到 (Daily Checkin)：每日定时为所有国内版账号自动签到领积分。
3. 猫猫旅行与日常结算 (Cat Travel & Welfare)：自动派出猫猫旅行或领取归来奖励。
4. 状态持久化与看板展示：暴露状态、执行记录、支持手动立即触发与开关切换。
"""
import threading
import time
import wb_tasks
from wb_tasks import do_cat_travel


class Scheduler:
    def __init__(self, pool):
        self.pool = pool
        # 对齐 Sliverkiss/workbuddy2api 官方默认排程 (CST 24小时制)
        self.checkin_hours = [9, 21]     # 每日 09:00、21:00 签到
        self.travel_hours = [9, 21]      # 每日 09:00 派出、21:00 领奖闭环
        self.keepalive_hours = [22]      # 每日 22:00 集中 Token 保活检查
        self.cat_hours = [1]             # 每日 01:00 夜猫子专属任务
        self.all_hours = sorted(list(set(self.checkin_hours + self.travel_hours + self.keepalive_hours + self.cat_hours)))
        self.enabled = True
        self._stop_event = threading.Event()
        self._thread = None
        self.last_run_time = None
        self.next_run_time = None
        self.logs = []
        # Guards against overlapping runs: trigger_now() spawns a thread per
        # click, and a manual trigger can also land on top of the hourly job.
        self._run_lock = threading.Lock()
        self._calc_next_fire()
        # Surface task-level failures (dead endpoints, upstream shape changes)
        # in the same log the panel shows.
        wb_tasks.set_logger(self.log)

    def log(self, msg):
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        entry = f"[{ts}] {msg}"
        self.logs.append(entry)
        if len(self.logs) > 60:
            self.logs = self.logs[-60:]
        try:
            import wb_proxy
            wb_proxy.add_log_entry(f"[调度器] {msg}", tag="scheduler")
        except Exception:
            pass

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        self.log("Bộ lịch định kỳ nền đã khởi động")

    def stop(self):
        self._stop_event.set()
        self.log("Bộ lịch định kỳ nền đã tạm dừng")

    def _run_loop(self):
        # 启动后先休眠 10 秒等待主服务就绪，然后执行初次检查
        time.sleep(10)
        try:
            self._execute_cycle("khởi tạo kiểm tra lần đầu khi khởi động")
        except Exception as exc:
            self.log(f"Lỗi kiểm tra lần đầu: {exc}")

        while not self._stop_event.is_set():
            self._calc_next_fire()
            # 每 30 秒检查一次当前整点
            now = time.localtime()
            cur_hour = now.tm_hour
            cur_min = now.tm_min
            if self.enabled:
                # 到达设定的整点前 1 分钟内触发
                if cur_min == 0 and cur_hour in self.all_hours:
                    reason = f"trúng lịch giờ chẵn ({cur_hour}:00)"
                    try:
                        self._execute_cycle(reason)
                    except Exception as exc:
                        self.log(f"Lỗi thực thi lịch trình: {exc}")
                    time.sleep(65) # 避开当前这一分钟重复触发
            self._stop_event.wait(30)

    def _calc_next_fire(self):
        now = time.localtime()
        cur_h = now.tm_hour
        next_h = None
        for h in self.all_hours:
            if h > cur_h or (h == cur_h and now.tm_min == 0 and now.tm_sec < 10):
                next_h = h
                break
        if next_h is not None:
            # 今天
            t_struct = time.struct_time((now.tm_year, now.tm_mon, now.tm_mday, next_h, 0, 0, 0, 0, -1))
        else:
            # 明天第一个小时
            t_tomorrow = time.time() + 86400
            now_tom = time.localtime(t_tomorrow)
            first_h = self.all_hours[0]
            t_struct = time.struct_time((now_tom.tm_year, now_tom.tm_mon, now_tom.tm_mday, first_h, 0, 0, 0, 0, -1))
        self.next_run_time = time.strftime("%Y-%m-%d %H:%M:%S", t_struct)

    def trigger_now(self):
        """手动立即触发一次调度检查。"""
        if self._run_lock.locked():
            return {"ok": False, "msg": "Đang có lượt kiểm tra đang chạy, vui lòng chờ"}
        threading.Thread(target=self._execute_cycle, args=("kích hoạt thủ công ngay",), daemon=True).start()
        return {"ok": True, "msg": "Đã kích hoạt thực thi lịch nền"}

    def _execute_cycle(self, trigger_reason="kiểm tra định kỳ"):
        if not self._run_lock.acquire(blocking=False):
            self.log(f"Bỏ qua lượt kiểm tra này ({trigger_reason}): lượt trước vẫn đang chạy")
            return
        try:
            self._run_cycle(trigger_reason)
        finally:
            self._run_lock.release()

    def _run_cycle(self, trigger_reason="kiểm tra định kỳ"):
        self.last_run_time = time.strftime("%Y-%m-%d %H:%M:%S")
        self.log(f"Bắt đầu thực thi nhiệm vụ ({trigger_reason})...")
        if not self.pool or not self.pool.accounts:
            self.log("Tạm thời không có tài khoản hoạt động, bỏ qua lượt kiểm tra này")
            return

        refreshed_count = 0
        checkin_count = 0
        travel_count = 0

        for acc in list(self.pool.accounts):
            uid8 = acc.uid[:8] if acc.uid else "?"
            # 1. 检查 Token 剩余寿命 (小于 2 小时自动刷新保活)
            exp = acc.expires_at or 0
            if exp and (exp - time.time()) < 7200:
                self.log(f"Tài khoản [{uid8}] Token sắp hết hạn, thực hiện làm mới bảo lưu chủ động...")
                if acc.refresh():
                    refreshed_count += 1
                    self.log(f"✓ Tài khoản [{uid8}] làm mới bảo lưu Token tự động thành công")
                else:
                    self.log(f"! Tài khoản [{uid8}] làm mới bảo lưu Token thất bại: {acc.last_error}")

            # 2. 如果是国内版账号，检查每日签到与猫猫旅行
            if acc.realm == "cn":
                if acc.can_checkin():
                    self.log(f"Phát hiện tài khoản Trong Nước [{uid8}] chưa điểm danh hôm nay, thực hiện điểm danh tự động...")
                    res = acc.checkin()
                    if res.get("ok"):
                        checkin_count += 1
                        self.log(f"✓ Tài khoản [{uid8}] điểm danh tự động thành công: {res.get('msg')}")
                    else:
                        self.log(f"! Tài khoản [{uid8}] điểm danh tự động chưa thành công: {res.get('error') or res.get('msg')}")
                    time.sleep(1.0)

                # 检查猫猫旅行
                tr = do_cat_travel(acc)
                if tr.get("action") in ("claim", "depart"):
                    travel_count += 1
                    self.log(f"🐱 Tài khoản [{uid8}] xử lý mèo hàng ngày: {tr.get('msg')}")
                time.sleep(1.0)

                if time.localtime().tm_hour in self.cat_hours:
                    night = wb_tasks.run_night_growth(acc)
                    for line in night.get("logs", []):
                        self.log(f"🌙 {line}")
                    time.sleep(1.0)

        self.log(f"Hoàn tất kiểm tra: Token bảo lưu {refreshed_count}, điểm danh hàng ngày {checkin_count}, mèo hàng ngày {travel_count}")

    def status(self):
        return {
            "enabled": self.enabled,
            "mode": "整点排程 (09:00/21:00 签到旅行 · 22:00 保活 · 01:00 夜猫)",
            "mode_cn": "整点排程 (09:00/21:00 签到旅行 · 22:00 保活 · 01:00 夜猫)",
            "mode_intl": "Token tài khoản tự động bảo lưu & thông tin thường trú (kiểm tra tập trung 22:00 hàng ngày)",
            "last_run_time": self.last_run_time or "尚未运行",
            "next_run_time": self.next_run_time or "待调度",
            "logs": self.logs[-20:],
        }
