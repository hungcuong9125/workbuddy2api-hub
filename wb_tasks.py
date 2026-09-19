"""wb_tasks.py —— 国内版成长任务与日常福利全自动完成引擎

包含功能：
1. 成长任务查询、批量接取 (accept)、构造事件上报点亮 (report)、领奖入账 (claim)。
2. 连续打卡 (streak) 与能量 (energy) 余额查询。
3. 猫猫旅行 (buddy travel) 状态查询、自动派出与自动领奖。
4. 严格遵守 >= 1.0s 防风控间隔，并使用 wb_fingerprint 的稳定设备指纹。
"""
import json
import re
import time
import urllib.error
import urllib.request

from wb_accounts import open_url

CHAT_BASE = "https://copilot.tencent.com"
BILL_BASE = "https://www.codebuddy.cn"
WEB_BASE = "https://www.workbuddy.cn"
DESKTOP_UA = "WorkBuddy/5.5.6 WorkBuddy/5.5.6 CLI/2.137.1"
WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"


_log = lambda msg: None


def set_logger(fn):
    """Route task diagnostics to the caller's logger.

    The growth endpoints swallow their errors so one dead endpoint cannot
    abort a whole cycle. Without a logger those failures are invisible, and an
    upstream change looks identical to "no tasks today".
    """
    global _log
    _log = fn or (lambda msg: None)

TASK_SPECS = {
    "create_canvas": {"kind": "canvas", "target": 1, "reward": 300, "name": "创建设计任务"},
    "template_5": {"kind": "template", "target": 5, "reward": 200, "name": "模板创建任务"},
    "expert_5": {"kind": "expert", "target": 5, "reward": 200, "name": "使用专家助手"},
    "Expert_team_use_3": {"kind": "team", "target": 3, "reward": 150, "name": "使用专家团队"},
    "skill_1": {"kind": "skill", "target": 1, "reward": 100, "name": "体验技能"},
    "automation_1": {"kind": "automation", "target": 1, "reward": 100, "name": "创建自动化任务"},
    "playbook_prompt": {"kind": "playbook", "target": 1, "reward": 100, "name": "灵感案例使用"},
    "Expert_lighthouse": {"kind": "lighthouse", "target": 1, "reward": 100, "name": "轻量云专家使用"},
    "Buddy_App": {"kind": "buddy5", "target": 1, "reward": 100, "name": "进入 Buddy 应用"},
    "Buddy_App_QQ": {"kind": "buddy5", "target": 1, "reward": 100, "name": "企鹅教师助手"},
    "Hp_Appearance": {"kind": "skin", "target": 1, "reward": 100, "name": "应用主题外观"},
    "chat_5": {"kind": "chat", "target": 5, "reward": 100, "name": "发起 5 次对话"},
    "Model_chat_GLM5.2": {"kind": "glmchat", "target": 1, "reward": 100, "name": "体验 GLM-5.2"},
    "black_cat": {"kind": "cat", "target": 3, "reward": 100, "name": "夜猫子任务 (23:00-08:00)"},
    "RichMeow_Chat": {"kind": "richmeow", "target": 1, "reward": 100, "name": "桌面对话事件链"},
    "Library_read": {"kind": "library", "target": 1, "reward": 100, "name": "浏览资料库"},
    "first_buddy": {"kind": "buddy_first", "target": 1, "reward": 0, "name": "领养首只猫猫"},
    "Expert_Philanthropy": {"unforgeable": True, "reason": "真实捐款动作", "reward": 0, "name": "公益爱心捐赠"},
}

# ---------------------------------------------------------------------------
# 逆向修复常量 (2026-09 实测校准)
# ---------------------------------------------------------------------------
# 这些任务上游只认桌面客户端的真实行为信号 (jump_url 均为 workbuddy:// 深链,
# 需要真实点击进入对应页面)。伪造 /v2/report 事件会被忽略或落到 heartbeat,
# 进度永远是 0/1, claim 必然返回 400 "task not completed"。诚实地跳过并给出深链。
DESKTOP_ONLY_TASKS = {
    "RichMeow_Chat": "在桌面端发起 1 次对话",
    "Library_read": "在桌面端打开「资料库」并读完介绍文档",
    "Buddy_App": "在桌面端左上角「发现应用」进入任意一个 Buddy 应用",
    "Buddy_App_QQ": "在桌面端「发现应用」进入「企鹅教师助手」",
}

# 夜猫子任务只在 23:00-08:00 上报才计数, 且每天 1 次、累计 3 天。
NIGHT_TASK_CODES = {"black_cat"}

def in_night_window():
    h = time.localtime().tm_hour
    return h >= 23 or h < 8

# 专家/团队事件必须彼此不同: 桌面端 appendGrowthEvent 按 (eventCode, id) 去重,
# 上游同样只按不同 id 累加进度 —— 重复发同一个 id 进度永远不动。
# 下列 id 已在 2026-09 实测中验证可推进任务进度。
EXPERT_ID_POOL = [
    ("ex_PZw8Gu81HfN4", "运维工程师"), ("ex_ROsDtJbzADFV", "产品经理"),
    ("ex_SMUnl0nJbPix", "UI设计师"), ("ex_ZTR062oVBOCW", "数据分析师"),
    ("ex_a3sSSFBy8qaC", "后端架构师"), ("ex_aG1kvKbq8lPx", "文案策划"),
    ("ex_al1vxtUOYQ10", "测试专家"), ("ex_cZfiyuET9UQP", "安全顾问"),
    ("ex_eggOvQuVP0hq", "算法工程师"), ("ex_hSwsQjkSKnkX", "前端工程师"),
    ("ex_mMbwwmFA9n9P", "项目管理专家"), ("ex_uAQE5POfk7Zh", "增长运营专家"),
    ("ex_uZzSAScSy7FZ", "行业研究员"), ("ex_LHywGrZOtG7G", "数据分析师"),
    ("ex_NX5C8GBciVed", "测试架构师"), ("ex_DdCsaoq4AtcO", "云端运维专家"),
    ("ex_KzqKQguubrNQ", "内容创作专家"), ("ex_2cvvUZQhDyeJ", "腾讯轻量云专家"),
]
# 团队 id 来自官方专家清单 expert_center.json (expertType=team, 共 53 个),
# 前 3 个已在 2026-09 实测验证可推进 Expert_team_use_3。
TEAM_ID_POOL = [
    ("CloudOpsTeam", "运维专家团队"), ("CloudContentTeam", "内容专家团队"),
    ("CloudDevTeam", "研发专家团队"), ("ProductStrategyTeam", "产品战略团队"),
    ("MarketingCampaignTeam", "营销活动团队"), ("SalesBattleTeam", "销售作战团队"),
    ("DesignEngineTeam", "设计引擎团队"), ("HrOperationsTeam", "人力运营团队"),
]


def fetch_growth_tasks(account):
    """查询成长任务列表及当前状态。"""
    url = CHAT_BASE + "/v2/activity/growth/tasks"
    req = urllib.request.Request(url, headers=account.headers("chat"))
    try:
        with open_url(req, timeout=15, proxy=account.proxy) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw_tasks = (data.get("data") or {}).get("tasks") or []
            tasks = []
            for t in raw_tasks:
                code = t.get("task_code") or ""
                spec = TASK_SPECS.get(code, {})
                prog = t.get("progress") or {}
                tasks.append({
                    "task_code": code,
                    "name": t.get("title") or spec.get("name") or code,
                    "description": t.get("description") or t.get("task_desc") or "",
                    "jump_url": t.get("jump_url") or "",
                    "status": t.get("accept_status") or "not_accepted",
                    "current": prog.get("current", 0),
                    "target": prog.get("target", spec.get("target", 1)),
                    "reward_credit": t.get("reward_credit") or spec.get("reward", 0),
                    "reward_energy": t.get("reward_energy", 0),
                    "unforgeable": bool(spec.get("unforgeable")),
                    "reason": spec.get("reason", ""),
                })
            return tasks
    except Exception as exc:
        return []


def fetch_growth_summary(account):
    """查询连续打卡、猫猫旅行与能量余额。"""
    headers = account.headers("chat")
    out = {"energy": 0, "streak_days": 0, "travel": {"state": "unknown"}}
    # 1. 能量
    try:
        req = urllib.request.Request(CHAT_BASE + "/v2/activity/growth/energy", headers=headers)
        with open_url(req, timeout=10, proxy=account.proxy) as resp:
            d = json.loads(resp.read().decode("utf-8"))
            out["energy"] = (d.get("data") or {}).get("balance", 0)
    except Exception as exc:
        _log(f"growth/energy query failed: {exc}")
    # 2. 连续打卡
    try:
        req = urllib.request.Request(CHAT_BASE + "/activity/growth/streak", headers=headers)
        with open_url(req, timeout=10, proxy=account.proxy) as resp:
            d = json.loads(resp.read().decode("utf-8"))
            st = (d.get("data") or {}).get("streak") or {}
            out["streak_days"] = st.get("days", 0)
    except Exception as exc:
        _log(f"growth/streak query failed: {exc}")
    # 3. 猫猫旅行
    try:
        req = urllib.request.Request(CHAT_BASE + "/activity/growth/buddy/travel/status", headers=headers)
        with open_url(req, timeout=10, proxy=account.proxy) as resp:
            d = json.loads(resp.read().decode("utf-8"))
            out["travel"] = d.get("data") or {}
    except Exception as exc:
        _log(f"buddy/travel/status query failed: {exc}")
    return out


def accept_tasks(account, codes, chunk=20):
    """批量接取任务。

    上游按批返回 results, 单个任务可能 status=accepted / already_accepted /
    其它失败原因。过去这里只返回 bool 且吞掉异常, 接取失败时上层完全看不见,
    于是后续上报的事件全部作用在未接取的任务上 —— 进度永远 0, 领奖必然
    "task not completed", 表现就是"接取了一堆但一个都没点亮"。
    现在返回 {"ok": bool, "accepted": [...], "failed": [...], "msg": str}。
    """
    out = {"ok": True, "accepted": [], "failed": [], "msg": ""}
    if not codes:
        return out
    url = CHAT_BASE + "/v2/activity/growth/tasks/accept"
    for i in range(0, len(codes), max(1, chunk)):
        part = codes[i:i + max(1, chunk)]
        body = json.dumps({"task_codes": part}).encode("utf-8")
        req = urllib.request.Request(url, data=body, method="POST",
                                     headers=account.headers("chat"))
        try:
            with open_url(req, timeout=15, proxy=account.proxy) as resp:
                d = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read(300).decode("utf-8", "replace")
            except Exception:
                pass
            out["ok"] = False
            out["msg"] = "HTTP %s: %s" % (exc.code, detail[:200])
            out["failed"].extend(part)
            _log(f"accept batch failed: {out['msg']}")
            continue
        except Exception as exc:
            out["ok"] = False
            out["msg"] = str(exc)[:200]
            out["failed"].extend(part)
            _log(f"accept batch failed: {exc}")
            continue
        if d.get("code") != 0:
            out["ok"] = False
            out["msg"] = d.get("msg") or ("code=%s" % d.get("code"))
            out["failed"].extend(part)
            _log(f"accept rejected: {out['msg']}")
            continue
        results = (d.get("data") or {}).get("results") or []
        seen = set()
        for item in results:
            code = item.get("task_code")
            st = str(item.get("status") or "")
            seen.add(code)
            if st in ("accepted", "already_accepted"):
                out["accepted"].append(code)
            else:
                out["failed"].append(code)
                _log(f"task {code} accept status={st}")
        for code in part:
            if code not in seen:
                out["failed"].append(code)
    return out


def claim_task(account, code):
    """领取任务奖励。支持 copilot.tencent.com -> www.workbuddy.cn 自动降级。"""
    url = f"{CHAT_BASE}/activity/growth/tasks/{code}/claim"
    req = urllib.request.Request(url, data=b"{}", method="POST", headers=account.headers("chat"))
    try:
        with open_url(req, timeout=15, proxy=account.proxy) as resp:
            d = json.loads(resp.read().decode("utf-8"))
            if d.get("code") == 0:
                data = d.get("data") or {}
                return {"ok": True, "credit": data.get("credit", 0), "energy": data.get("energy", 0)}
            # 200 + 非0码 (典型: 400 task not completed —— 进度还没落账就来领奖)
            _log(f"task {code} claim rejected: {d.get('msg')}")
            return {"ok": False, "credit": 0, "energy": 0, "msg": d.get("msg") or f"code={d.get('code')}"}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace") if exc.fp else ""
        err_msg = f"HTTP {exc.code}"
        try:
            err_msg = json.loads(body).get("msg") or err_msg
        except Exception:
            pass
        if exc.code == 400:
            # 降级到 web 域领奖
            web_url = f"{WEB_BASE}/activity/growth/tasks/{code}/claim"
            web_hdrs = {
                "Authorization": "Bearer " + account.access_token,
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/json",
                "Origin": WEB_BASE,
                "Referer": f"{WEB_BASE}/profile/growth-center",
                "x-client-platform": "web",
                "User-Agent": WEB_UA,
                "X-User-Id": account.uid,
                "X-Domain": WEB_BASE,
            }
            try:
                req_web = urllib.request.Request(web_url, data=b"{}", method="POST", headers=web_hdrs)
                with open_url(req_web, timeout=15, proxy=account.proxy) as resp:
                    d = json.loads(resp.read().decode("utf-8"))
                    if d.get("code") == 0:
                        data = d.get("data") or {}
                        return {"ok": True, "credit": data.get("credit", 0), "energy": data.get("energy", 0)}
                    _log(f"task {code} web claim rejected: code={d.get('code')} msg={d.get('msg')}")
                    return {"ok": False, "credit": 0, "energy": 0, "msg": d.get("msg") or err_msg}
            except Exception as exc2:
                _log(f"task {code} web claim failed: {exc2}")
        _log(f"task {code} claim failed: {err_msg}")
        return {"ok": False, "credit": 0, "energy": 0, "msg": err_msg}
    except Exception as exc:
        _log(f"task {code} claim failed: {exc}")
    return {"ok": False, "credit": 0, "energy": 0}


def build_event(account, kind, idx=0, expert=None):
    """构造指定类型的真实规范事件数据。

    expert: (expert_id, expert_name) —— 专家/团队类事件必须每次使用不同的 id,
    上游按 (eventCode, id) 去重, 重复 id 不会推进任务进度。
    """
    now = int(time.time() * 1000)
    cid = f"wb-task-{now}-{idx}"
    rid = f"{cid}-req"
    uid = account.uid

    if kind == "canvas":
        return {"eventCode": "wbx_design_canvas_task_create", "timestamp": now,
                "reportDelay": 0, "conversationId": cid, "requestId": rid,
                "source": "summon_keyword", "isCustomModel": False, "name": "",
                "inputLength": 12, "id": f"wbx-canvas-{now}", "cost": 0,
                "isSuccessful": True, "userId": uid}
    if kind == "template":
        return {"eventCode": "agent_task_created_with_template", "timestamp": now,
                "reportDelay": 0, "isCustomModel": True, "id": str(idx),
                "name": "幻灯片", "requestId": rid, "conversationId": cid, "userId": uid}
    if kind in ("expert", "team", "lighthouse"):
        etype = "team" if kind == "team" else "agent"
        if expert:
            ex_id, name = expert
        elif kind == "lighthouse":
            ex_id, name = "ex_2cvvUZQhDyeJ", "腾讯轻量云专家"
        elif kind == "team":
            ex_id, name = "CloudOpsTeam", "运维专家团队"
        else:
            ex_id, name = "ContentCreator", "内容创作专家"
        return {"eventCode": "expert_actual_use", "timestamp": now, "reportDelay": 0,
                "mode": "CLOUD", "id": ex_id, "name": name, "expertTitle": name,
                "type": "02-Engineering", "expertType": etype, "source": "builtin",
                "version": "1.0.2", "cost": 0, "characterCount": 12, "conversationId": cid,
                "requestId": rid, "messageId": rid, "requestModelId": "deepseek-v4-flash",
                "requestModelName": "DeepSeek V4 Flash", "userId": uid}
    if kind == "skill":
        return {"eventCode": "skill_info", "timestamp": now, "reportDelay": 0,
                "skillId": "skill_2096525080079265792", "name": "pptx", "userId": uid}
    if kind == "automation":
        return {"eventCode": "automated_task_create_suc", "timestamp": now, "reportDelay": 0,
                "name": "每周工作整理", "type": "cron", "source": "manually",
                "modelId": "deepseek-v4-flash", "modelIsThinking": False,
                "conversationId": cid, "requestId": rid,
                "schedule": {"type": "recurring", "rrule": "FREQ=WEEKLY;BYDAY=FR;BYHOUR=9;BYMINUTE=0"},
                "prompt": "每周五自动整理本周工作", "userId": uid}
    if kind == "playbook":
        return {"eventCode": "playbook_prompt_send", "timestamp": now, "reportDelay": 0,
                "id": "worker-ledger-freedom-dashboard", "name": "打工人小账本",
                "type": "other", "promptLength": 10, "isOfficial": 1,
                "source": "discover", "conversationId": cid, "requestId": rid, "userId": uid}
    if kind == "skin":
        return {"eventCode": "appearance_skin_apply", "timestamp": now, "reportDelay": 0,
                "action": "apply", "source": "settings_close", "id": "theme-tkmw7j",
                "vipLevel": "free", "series": "craft", "type": "unknown",
                "name": "和平精英激战金秋", "userId": uid}
    if kind in ("chat", "glmchat", "cat"):
        m_id = "glm-5.2" if kind in ("glmchat", "cat") else "deepseek-v4-flash"
        m_nm = "GLM-5.2" if kind in ("glmchat", "cat") else "DeepSeek V4 Flash"
        mode = "night" if kind == "cat" else "craft"
        return {"eventCode": "chat_request_send", "timestamp": now, "reportDelay": 0,
                "mode": mode, "conversationId": cid, "requestId": rid,
                "inputLength": 12, "requestModelId": m_id, "requestModelName": m_nm,
                "isPlan": False, "agentName": "default", "agentType": "conversation",
                "userId": uid}
    return {"eventCode": "heartbeat", "timestamp": now, "userId": uid}


def report_events(account, events, base=None):
    """向上游上报事件数组。

    默认发 copilot.tencent.com (chat 侧) —— 与桌面客户端真实上报地址一致
    (桌面 NetLog: POST https://copilot.tencent.com/v2/report), 2026-09 实测
    该侧事件会实时推进成长任务进度。
    """
    if base is None:
        base = CHAT_BASE
    url = base + "/v2/report"
    headers = account.headers("billing" if base == BILL_BASE else "chat")
    body = json.dumps(events).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers=headers)
    try:
        with open_url(req, timeout=15, proxy=account.proxy) as resp:
            d = json.loads(resp.read().decode("utf-8"))
            return d.get("code") == 0
    except Exception:
        return False


def do_cat_travel(account):
    """检查并执行猫猫旅行 (领奖 / 派出)。"""
    headers = account.headers("chat")
    # 1. 查询状态
    try:
        req = urllib.request.Request(CHAT_BASE + "/activity/growth/buddy/travel/status", headers=headers)
        with open_url(req, timeout=10, proxy=account.proxy) as resp:
            d = json.loads(resp.read().decode("utf-8"))
            st = d.get("data") or {}
    except Exception as exc:
        return {"ok": False, "msg": f"Truy vấn trạng thái du lịch thất bại: {exc}"}

    state = st.get("state")
    if state == "arrived":
        # 领奖 (官方前端: POST travel/claim body {})
        req_cl = urllib.request.Request(CHAT_BASE + "/activity/growth/buddy/travel/claim", data=b"{}", method="POST", headers=headers)
        try:
            with open_url(req_cl, timeout=10, proxy=account.proxy) as resp:
                c_res = json.loads(resp.read().decode("utf-8"))
                credit = (c_res.get("data") or {}).get("reward_credit", 0)
                account.fetch_credits()
                return {"ok": True, "action": "claim", "credit": credit, "msg": f"Du lịch trở về nhận thưởng thành công! Nhận được {credit} điểm"}
        except Exception as e:
            return {"ok": False, "msg": f"Nhận thưởng thất bại: {e}"}

    if state == "idle":
        if st.get("daily_limit_reached"):
            return {"ok": True, "action": "idle", "msg": "Mèo đã hoàn thành du lịch hôm nay, làm mới lúc 00:00 ngày mai"}
        lid = None
        try:
            req_cfg = urllib.request.Request(CHAT_BASE + "/activity/growth/buddy/travel/config", headers=headers)
            with open_url(req_cfg, timeout=10, proxy=account.proxy) as resp:
                cfg = json.loads(resp.read().decode("utf-8"))
                locs = (cfg.get("data") or {}).get("locations") or []
            if locs:
                lid = locs[0].get("id")
        except Exception as exc:
            _log(f"buddy/travel/config query failed: {exc}")
        if lid is None:
            lid = 1
        dep_body = json.dumps({"location_id": lid}).encode("utf-8")
        req_dep = urllib.request.Request(CHAT_BASE + "/activity/growth/buddy/travel/depart", data=dep_body, method="POST", headers=headers)
        try:
            with open_url(req_dep, timeout=10, proxy=account.proxy) as resp:
                dep_res = json.loads(resp.read().decode("utf-8"))
                if dep_res.get("code") == 0:
                    loc = ((dep_res.get("data") or {}).get("location") or {}).get("name") or ""
                    return {"ok": True, "action": "depart", "msg": f"Mèo đã lên đường đến「{loc}」, dự kiến vài giờ sau trở về!"}
                return {"ok": False, "msg": f"Phái đi du lịch bị từ chối: {dep_res.get('msg')}"}
        except Exception as e:
            return {"ok": False, "msg": f"Phái đi du lịch thất bại: {e}"}

    if state == "traveling":
        return {"ok": True, "action": "traveling", "msg": "Mèo đang trên đường du lịch, vui lòng quay lại sau!"}

    return {"ok": True, "action": state, "msg": f"Trạng thái hiện tại: {state}"}


def run_growth_tasks(account, gap=1.0):
    """完整执行批量成长任务点亮与领奖。"""
    if account.realm != "cn":
        return {"ok": False, "msg": "Bản Quốc Tế không áp dụng trung tâm nhiệm vụ phát triển Trong Nước", "logs": []}

    logs = []
    logs.append(f"Bắt đầu chạy tự động hóa nhiệm vụ phát triển cho tài khoản {account.nickname or account.uid[:8]}...")
    tasks = fetch_growth_tasks(account)
    if not tasks:
        logs.append("Không lấy được danh sách nhiệm vụ, vui lòng kiểm tra mạng hoặc trạng thái tài khoản")
        return {"ok": False, "logs": logs, "earned_credit": 0}

    # 1. 批量接取未接任务
    unaccepted = [t["task_code"] for t in tasks if t["status"] == "not_accepted" and not t.get("unforgeable")]
    if unaccepted:
        logs.append(f"Phát hiện {len(unaccepted)} nhiệm vụ chờ nhận, đang nhận hàng loạt...")
        acc = accept_tasks(account, unaccepted)
        if acc.get("failed"):
            logs.append(f"! Nhận không thành công {len(acc['failed'])} nhiệm vụ: {', '.join(acc['failed'][:5])}"
                        + (" ..." if len(acc["failed"]) > 5 else "")
                        + (f" ({acc['msg']})" if acc.get("msg") else ""))
        if acc.get("accepted"):
            logs.append(f"✓ Đã nhận {len(acc['accepted'])} nhiệm vụ")
        time.sleep(gap)
        tasks = fetch_growth_tasks(account)
        # 复核一次: 上游偶尔会瞬时拒绝整个批次, 复查后仍处于未接取的再补一次,
        # 否则后面所有上报都作用在未接取的任务上 —— 进度全是 0。
        still = [t["task_code"] for t in tasks if t["status"] == "not_accepted"]
        if still:
            logs.append(f"Vẫn còn {len(still)} nhiệm vụ chưa được nhận, thử nhận lại một lần...")
            retry = accept_tasks(account, still)
            if retry.get("accepted"):
                logs.append(f"✓ Nhận lại thành công {len(retry['accepted'])} nhiệm vụ")
            time.sleep(gap)
            tasks = fetch_growth_tasks(account)
        if not tasks:
            logs.append("! Sau khi nhận nhiệm vụ không lấy được danh sách nhiệm vụ, vòng này dừng giữa chừng")
            return {"ok": False, "logs": logs, "earned_credit": 0}
        still_pending = [t["task_code"] for t in tasks if t["status"] == "not_accepted"]
        if still_pending:
            logs.append(f"! Vẫn còn {len(still_pending)} nhiệm vụ ở trạng thái chưa được nhận, "
                        f"báo cáo sự kiện cho nhiệm vụ chưa nhận sẽ không tính tiến độ, vòng này bỏ qua các nhiệm vụ đó")

    total_earned = 0
    # 2. 处理每个任务
    for t in tasks:
        code = t["task_code"]
        spec = TASK_SPECS.get(code)
        if not spec or spec.get("unforgeable"):
            continue

        status = t["status"]
        cur = t.get("current", 0)
        tgt = t.get("target", 1)

        if status == "claimed":
            continue

        # 已完成的任务先领奖 —— 桌面端/夜间任务也可能被真实操作完成
        # (例如用户自己在桌面端用了一次, 或夜里调度器点亮了), 这类任务必须
        # 先结算, 不能因为"只能靠真实操作"就直接跳过丢掉奖励。
        if status == "completed" or cur >= tgt:
            res = claim_task(account, code)
            if res.get("ok"):
                cr = res.get("credit", 0)
                total_earned += cr
                logs.append(f"✓ Nhiệm vụ [{spec['name']}] nhận thưởng thành công: +{cr} điểm")
            else:
                logs.append(f"! Nhiệm vụ [{spec['name']}] nhận thưởng thất bại: {res.get('msg') or 'không rõ nguyên nhân'}")
            time.sleep(gap)
            continue

        # 只认桌面端真实行为的任务: 伪造事件不会推进进度, 诚实跳过并给出深链。
        if code in DESKTOP_ONLY_TASKS:
            jump = t.get("jump_url") or "workbuddy://chat"
            logs.append(f"⏭ Nhiệm vụ [{spec['name']}] cần thao tác thật để hoàn thành: {DESKTOP_ONLY_TASKS[code]}"
                        f" (deep link {jump}), bỏ qua giả lập sự kiện")
            continue

        # 夜猫子任务只在 23:00-08:00 计数 (每日 01:00 调度器也会自动执行)
        if code in NIGHT_TASK_CODES and not in_night_window():
            logs.append(f"🌙 Nhiệm vụ [{spec['name']}] chỉ tính điểm khi báo cáo trong 23:00-08:00, hiện không trong khung giờ, bỏ qua"
                        f" (mỗi ngày 01:00 bộ lịch tự động thực hiện, tích lũy 3 ngày)")
            continue

        if status == "not_accepted":
            # Nhận nhiệm vụ không thành công mà vẫn báo cáo là vô ích: upstream chỉ
            # cộng tiến độ cho nhiệm vụ đã nhận.
            logs.append(f"⏭ Nhiệm vụ [{spec['name']}] vẫn chưa được nhận, bỏ qua (cần xử lý lỗi nhận nhiệm vụ trước)")
            continue

        # 3. 需点亮上报 —— 专家/团队事件必须使用互不相同的 id, 否则上游按
        #    (eventCode, id) 去重, 进度永远不动。
        need = max(1, tgt - cur)
        kind = spec.get("kind")
        logs.append(f"Đang thắp sáng nhiệm vụ [{spec['name']}] (cần báo cáo {need} lần)...")
        report_ok = True
        id_pool = None
        if kind in ("expert", "team"):
            id_pool = TEAM_ID_POOL if kind == "team" else EXPERT_ID_POOL
        for i in range(need):
            expert = None
            if id_pool:
                pid, pnm = id_pool[(cur + i) % len(id_pool)]
                expert = (pid, pnm)
            ev = build_event(account, kind, idx=i, expert=expert)
            if not report_events(account, [ev]):
                report_ok = False
            if i < need - 1:
                time.sleep(gap)
        if not report_ok:
            logs.append(f"! Nhiệm vụ [{spec['name']}] một số sự kiện báo cáo thất bại (upstream từ chối), tiếp tục thử nhận thưởng")
        time.sleep(1.5)

        # 等上游把进度落账再领奖。进度通常 1-3 秒就可见, 因此先快查几次;
        # 只有确实在动才继续等, 免得每个卡住的任务都空等 20 秒 (整轮要几分钟)。
        prog = cur
        for attempt in range(6):
            fresh = next((x for x in fetch_growth_tasks(account) if x["task_code"] == code), None)
            if fresh:
                prog = fresh.get("current", 0)
                if prog >= tgt or fresh.get("status") in ("completed", "claimed"):
                    break
                if prog > cur:
                    # 已经在涨了, 值得多等一会儿
                    time.sleep(2.5)
                    continue
            if attempt < 2:
                time.sleep(1.5)
            else:
                break
        if prog < tgt:
            logs.append(f"? Nhiệm vụ [{spec['name']}] đã báo cáo nhưng tiến độ {prog}/{tgt} chưa đạt, nhận thưởng dời sang lần chạy sau")
            time.sleep(gap)
            continue

        # 领奖
        res = claim_task(account, code)
        if res.get("ok"):
            cr = res.get("credit", 0)
            total_earned += cr
            logs.append(f"✓ Nhiệm vụ [{spec['name']}] thắp sáng và nhận thưởng thành công: +{cr} điểm")
        else:
            logs.append(f"? Nhiệm vụ [{spec['name']}] đã báo cáo thắp sáng (tiến độ {prog}/{tgt}), nhận thưởng sẽ được quyết toán sau: {res.get('msg') or 'không rõ nguyên nhân'}")
        time.sleep(gap)

    # 4. 顺手检查猫猫旅行
    tr_res = do_cat_travel(account)
    if tr_res.get("msg"):
        logs.append(f"Mèo hàng ngày: {tr_res.get('msg')}")
        if tr_res.get("credit"):
            total_earned += tr_res.get("credit", 0)

    # 5. 刷新积分余额
    account.fetch_credits()
    logs.append(f"🎉 Hoàn tất tất cả! Lần này tích lũy thêm vào tài khoản: +{total_earned} điểm, tổng số dư hiện tại: {account.credits.get('remain', 0)} điểm")
    return {"ok": True, "logs": logs, "earned_credit": total_earned, "credits": account.credits}


def run_night_growth(account):
    """夜猫子任务 (black_cat): 每日 23:00-08:00 上报 1 次 GLM-5.2 夜间对话事件,
    每天计 1 次、累计 3 天后可领奖。白天调用会诚实跳过。"""
    if account.realm != "cn":
        return {"ok": False, "msg": "Bản Quốc Tế không áp dụng trung tâm nhiệm vụ phát triển Trong Nước", "logs": [], "earned_credit": 0}
    logs = []
    name = account.nickname or account.uid[:8]
    if not in_night_window():
        return {"ok": True, "earned_credit": 0, "logs": [
            f"[{name}] hiện không trong khung giờ đêm 23:00-08:00, nhiệm vụ mèo đêm bỏ qua (mỗi ngày 01:00 tự động thực hiện)"]}
    tasks = fetch_growth_tasks(account)
    t = next((x for x in tasks if x["task_code"] == "black_cat"), None)
    if not t:
        return {"ok": False, "earned_credit": 0, "logs": [f"[{name}] không lấy được danh sách nhiệm vụ mèo đêm"]}
    if t["status"] == "claimed":
        return {"ok": True, "earned_credit": 0, "logs": [f"[{name}] nhiệm vụ mèo đêm đã nhận thưởng"]}
    cur, tgt = t.get("current", 0), t.get("target", 3)
    if cur >= tgt:
        res = claim_task(account, "black_cat")
        cr = res.get("credit", 0) if res.get("ok") else 0
        account.fetch_credits()
        logs.append(f"[{name}] nhiệm vụ mèo đêm đạt chuẩn, nhận thưởng {'✓ +' + str(cr) + ' điểm' if res.get('ok') else '! Thất bại: ' + (res.get('msg') or '')}")
        return {"ok": res.get("ok", False), "earned_credit": cr, "logs": logs}
    ev = build_event(account, "cat", idx=0)
    ok = report_events(account, [ev])
    logs.append(f"[{name}] báo cáo sự kiện trò chuyện đêm GLM-5.2: {'thành công' if ok else 'thất bại'} (tiến độ {cur}/{tgt})")
    fresh = None
    for _ in range(4):
        time.sleep(4)
        fresh = next((x for x in fetch_growth_tasks(account) if x["task_code"] == "black_cat"), None)
        if fresh and fresh.get("current", 0) > cur:
            break
    new_cur = fresh.get("current", cur) if fresh else cur
    if new_cur >= tgt:
        res = claim_task(account, "black_cat")
        cr = res.get("credit", 0) if res.get("ok") else 0
        logs.append(f"[{name}] nhiệm vụ mèo đêm hoàn thành {new_cur}/{tgt}, nhận thưởng {'✓ +' + str(cr) + ' điểm' if res.get('ok') else '! Thất bại: ' + (res.get('msg') or '')}")
    elif new_cur > cur:
        logs.append(f"[{name}] tối nay +1 ({new_cur}/{tgt}), tối mai tiếp tục, tích lũy đủ 3 ngày sẽ nhận được thưởng")
    else:
        logs.append(f"[{name}] đã báo cáo nhưng tiến độ chưa thay đổi ({new_cur}/{tgt}), tối mai bộ lịch sẽ tiếp tục tích lũy")
    account.fetch_credits()
    earned = 0
    for line in logs:
        m = re.search(r"\+(\d+) điểm", line)
        if m:
            earned = int(m.group(1))
    return {"ok": True, "earned_credit": earned, "logs": logs}
