// The language switch is an inline dashboard script. Run that real script in a
// tiny fake document so both the saved default and text-node translation are
// exercised without a browser dependency.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const script = scripts.find(s => s.includes('var VI_DICT = {'));
assert.ok(script, 'dashboard Vietnamese language script exists');

function boot(instanceLanguage, query = '') {
  let observer = null;
  const attrs = { 'data-ui-language': instanceLanguage };
  const text = { nodeType: 3, data: '网关设置', parentNode: null };
  const labelAttrs = { 'data-label': '原因', 'data-tip': '面板手动停用，该账号不参与轮询' };
  const label = {
    nodeType: 1,
    tagName: 'TD',
    childNodes: [],
    parentNode: null,
    hasAttributes() { return true; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(labelAttrs, name); },
    getAttribute(name) { return labelAttrs[name] || null; },
    setAttribute(name, value) { labelAttrs[name] = String(value); },
  };
  const root = {
    nodeType: 1,
    tagName: 'HTML',
    childNodes: [text, label],
    hasAttributes() { return true; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
    getAttribute(name) { return attrs[name] || null; },
    setAttribute(name, value) { attrs[name] = String(value); },
  };
  text.parentNode = root;
  label.parentNode = root;
  const document = {
    documentElement: root,
    readyState: 'loading',
    addEventListener() { },
    getElementById() { return null; },
  };
  const localStorage = {
    getItem() { return null; },
    setItem() { },
  };
  const window = {
    location: { search: query },
    confirm() { return true; },
    alert() { },
  };
  class Observer {
    constructor(callback) { this.callback = callback; observer = this; }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { }
  }
  const context = {
    window, document, localStorage, URLSearchParams,
    MutationObserver: Observer
  };
  vm.runInNewContext(script, context, { filename: 'dashboard-i18n.js' });
  return {
    window, attrs, text, label, labelAttrs, root,
    get observer() { return observer; }
  };
}

const vi = boot('vi');
assert.strictEqual(vi.window.WB_I18N.current(), 'vi');
assert.strictEqual(vi.attrs.lang, 'vi');
assert.strictEqual(vi.window.WB_I18N.translateVi('网关设置'), 'Cài đặt cổng kết nối');
assert.strictEqual(vi.window.WB_I18N.translateVi('全部模型合计 (Total)'), 'Tất cả mô hình (Tổng)');
vi.window.WB_I18N.set('vi');
assert.strictEqual(vi.text.data, 'Cài đặt cổng kết nối');
assert.strictEqual(vi.labelAttrs['data-label'], 'Lý do');
assert.strictEqual(vi.labelAttrs['data-tip'],
  'Tài khoản bị tắt thủ công trên bảng điều khiển, không tham gia luân phiên.');
assert.ok(vi.observer.options.attributeFilter.includes('data-tip'));
const dynamicText = {
  nodeType: 3,
  data: '面板手动停用，该账号不参与轮询',
  parentNode: vi.root,
};
vi.observer.callback([{ type: 'childList', addedNodes: [dynamicText] }]);
assert.strictEqual(dynamicText.data,
  'Tài khoản bị tắt thủ công trên bảng điều khiển, không tham gia luân phiên.');
vi.labelAttrs['data-label'] = '恢复时间';
vi.observer.callback([{ type: 'attributes', target: vi.label }]);
assert.strictEqual(vi.labelAttrs['data-label'], 'Thời gian khôi phục');

const screenshotStrings = [
  ['本页导航', 'Điều hướng trang'],
  ['↑ 回到顶部', '↑ Về đầu trang'],
  ['版本', 'Phiên bản'],
  ['范围', 'Phạm vi'],
  ['类型', 'Loại'],
  ['原因', 'Lý do'],
  ['恢复时间', 'Thời gian khôi phục'],
  ['启用', 'Bật'],
  ['停用', 'Tắt'],
  ['测试', 'Kiểm tra'],
  ['刷新凭证', 'Làm mới thông tin đăng nhập'],
  ['同步昵称', 'Đồng bộ biệt danh'],
  ['本地停用', 'Tắt cục bộ'],
  ['—（需手动启用）', '— (Cần bật thủ công)'],
  ['无调用', 'Không có request'],
  ['启动参数', 'Tham số khởi chạy'],
  ['未归属', 'Chưa phân bổ'],
  ['（切换前）', '(Trước khi nâng cấp)'],
  ['(2 把)', '(2 API Key)'],
  ['平均耗时', 'Thời gian trung bình'],
  ['平均首字延迟', 'Độ trễ token đầu tiên trung bình'],
  ['首个 token 的平均等待时间', 'Thời gian chờ trung bình đến token đầu tiên'],
  ['Input', 'Input'],
  ['Output', 'Output'],
  ['Thinking', 'Thinking'],
  ['上次:', 'Lần trước:'],
  ['下次:', 'Lần tiếp theo:'],
  ['尚未运行', 'Chưa chạy'],
  ['待调度', 'Đang chờ lịch'],
  ['整点排程 (09:00/21:00 签到旅行 · 22:00 保活 · 01:00 夜猫)',
    'Lịch theo giờ cố định (09:00/21:00 điểm danh và du lịch · 22:00 duy trì Token · 01:00 nhiệm vụ đêm)'],
  ['(不指定模型)', '(Không chỉ định mô hình)'],
  ['(未指定)', '(Chưa chỉ định)'],
  ['全局 API Key', 'API Key chung'],
  ['OpenAI 兼容', 'Tương thích OpenAI'],
  ['检测中...', 'Đang kiểm tra...'],
  ['应用时间:', 'Thời gian áp dụng:'],
  ['模型:', 'Mô hình:'],
  ['输入 · 输出 · 思考', 'Input · Output · Thinking'],
  ['请求次数', 'Số request'],
  ['消耗总 Token', 'Tổng Token đã dùng'],
  ['调用的模型分布 (请求数 · 消耗)', 'Phân bố mô hình đã gọi (số request · mức dùng)'],
  ['客户端检测完成', 'Đã kiểm tra ứng dụng'],
  ['暂未获取到客户端列表，点右上角「刷新」重新检测。',
    'Chưa lấy được danh sách ứng dụng. Nhấn “Làm mới” ở góc trên bên phải để kiểm tra lại.'],
  ['没有积分扣减记录', 'Không có bản ghi trừ điểm'],
  ['今日', 'Hôm nay'],
  ['未检测到', 'Chưa phát hiện'],
  ['名称', 'Tên'],
  ['代理地址', 'Địa chỉ proxy'],
  ['绑定账号', 'Tài khoản đã gắn'],
  ['操作', 'Thao tác'],
  ['「绑定账号」只统计已启用账号；停用账号会自动释放槽位，重新启用后需重新绑定。在网关页账号表的「出口」下拉中调整绑定。名称留空时按出口自动显示「国家 类型」，点「测试」会补全出口信息并据此命名。',
    '“Tài khoản đã gắn” chỉ tính các tài khoản đang bật; khi tắt tài khoản, hệ thống tự giải phóng slot. Sau khi bật lại, bạn cần gắn lại. Điều chỉnh liên kết trong danh sách tài khoản trên trang Cổng, tại menu “Cổng ra”. Nếu để trống tên, hệ thống tự đặt theo “Quốc gia · Loại”; nhấn “Kiểm tra” để lấy thông tin cổng và đặt tên theo đó.'],
  ['(全局生效)', '(Áp dụng toàn cục)'],
  ['(全部关闭)', '(Đóng tất cả)'],
  ['WorkBuddy 网关', 'WorkBuddy'],
  ['推理强度', 'Mức độ thinking'],
  ['模式', 'Chế độ'],
  ['结果', 'Kết quả'],
  ['耗时', 'Thời gian'],
  ['首字', 'Token đầu'],
  ['速度', 'Tốc độ'],
  ['请求成功率', 'Request thành công'],
  ['Request成功率', 'Request thành công'],
  ['请求成功率（国际版）', 'Request thành công (Quốc Tế)'],
  ['网关调用量（国际版）', 'Lượt gọi cổng (Quốc Tế)'],
  ['流式', 'Truyền trực tuyến'],
  ['非流式', 'Không truyền trực tuyến'],
  ['跟随', 'Theo'],
  ['跟随 · 混合', 'Theo · kết hợp'],
  ['未定价模型', 'Mô hình chưa có giá'],
  ['展开查看每个模型当前生效的策略', 'Mở rộng để xem chính sách đang áp dụng cho từng mô hình'],
  ['(已启用)', '(Đã bật)'],
  ['每 5 分钟', 'Mỗi 5 phút'],
  ['全局 7', 'Toàn cục 7'],
  ['3 次', '3 lượt'],
  ['到期', 'hết hạn'],
];
for (const [source, expected] of screenshotStrings) {
  assert.strictEqual(vi.window.WB_I18N.translateVi(source), expected, source);
}
const generatedScreenshotStrings = [
  ['运行中 · 整点排程 (09:00/21:00 签到旅行 · 22:00 保活 · 01:00 夜猫)',
    'Đang chạy · Lịch theo giờ cố định (09:00/21:00 điểm danh và du lịch · 22:00 duy trì Token · 01:00 nhiệm vụ đêm)'],
  ['上次: 2026-03-01 09:00:00 · 下次: 2026-03-01 21:00:00',
    'Lần trước: 2026-03-01 09:00:00 · Lần tiếp theo: 2026-03-01 21:00:00'],
  ['(已检测到 2 个)', '(Đã phát hiện 2 ứng dụng)'],
  ['输入 1 / 输出 2 / 思考 3', 'Input 1 / Output 2 / Thinking 3'],
  ['总 Token 0 · 扣减积分 0 · 桶 3600s',
    'Tổng Token 0 · Điểm bị trừ 0 · Chu kỳ 3600s'],
  ['(第 1 页 / 共 18,478 条)', '(Trang 1 / tổng 18,478 mục)'],
  ['未定价模型：4 个需要人工关注（无对应 3）（变体未命中 1）；另有 5 个虚拟别名不参与统计',
    'Mô hình chưa có giá: 4 cần được kiểm tra thủ công (không có mục khớp 3) (biến thể chưa khớp 1); ngoài ra có 5 bí danh ảo không được tính vào thống kê'],
];
for (const [source, expected] of generatedScreenshotStrings) {
  assert.strictEqual(vi.window.WB_I18N.translateVi(source), expected, source);
}
const mixedLanguageStrings = [
  '面板手动停用，该账号不参与轮询',
  '多个账号按会话粘性 + 轮询使用；某个账号被上游拒绝时自动切到下一个',
  '出站身份：WB = WorkBuddy 独立桌面客户端（默认），VSC = 官方 VSCode 插件，CLI = 官方 CodeBuddy CLI；三者对应不同的出站指纹与配额通道。',
  'Key 维度只从本次升级之后开始记录：更早的请求没有这个字段，会一直留在「(切换前)」里且不会再增长。',
  '上游连续失败触发熔断，本窗口内不接单；账号与凭证本身没问题，2h05m后自动恢复',
  '按 OpenRouter 上同名模型的价格，把每条请求的 token 折算成人民币，供面板的「OpenRouter 价估算」列与「API 等价花费」卡片使用。',
  '；关闭后不再向 OpenRouter 取价，也不再折算任何金额，相关列、卡片与取价控件一并隐藏（只留这个开关）。',
  '：那段请求按之后第一次取到的价折算并标',
  '网关每隔这段时间去 OpenRouter 取一次价：每个模型每份不同的价格存成一条',
  '（内容相同就复用同一条，不重复写），并声明「现在生效的是哪一条」。每条请求按它发生时生效的那一条计价，所以之后调价不会改写之前的数字；请求只记它引用的是哪条策略，不内嵌整份价格。取价时还没有价的模型，用之后第一次取到的价补算并标',
  '。没人引用、又已经不作数的策略会被清掉（每个模型至少留一条，刚取到的那批不动）。取价间隔以',
  '计，默认 5 分钟；填 0 表示不自动刷新（仍可用「立即取价」手动取一次）。',
  '网关实时目录里新增的模型，上游新上架的名字无需改代码就会进入下一轮取价；两次取价之间就被调用的新模型，第一笔请求即按内存里的目录',
  '按需补价',
];
for (const source of mixedLanguageStrings) {
  assert.doesNotMatch(vi.window.WB_I18N.translateVi(source), /[\u3400-\u9fff]/, source);
}


// 面板各页（账号 / 数据看板 / 设置 / 更新 / 运行日志）截图里仍然残留中文的
// 文案：逐条锁定，防止以后回退。
const localizedScreenshotStrings = [
  ["签到与活跃记录",
    "Điểm danh và nhật ký hoạt động"],
  ["显示条数:",
    "Số hàng hiển thị:"],
  ["共 376 条记录",
    "Tổng 376 bản ghi"],
  ["上一页",
    "Trang trước"],
  ["上下文窗口",
    "Cửa sổ ngữ cảnh"],
  ["能力",
    "Năng lực"],
  ["当前范围没有请求数据",
    "Không có dữ liệu request trong phạm vi hiện tại"],
  ["各账号用量透视与模型消耗分布 (6 个账号)",
    "Phân tích mức dùng theo từng tài khoản và phân bổ tiêu thụ theo mô hình (6 tài khoản)"],
  ["支持查看各账号的总消耗及调用的每个具体模型细分占比",
    "Xem tổng mức tiêu thụ của từng tài khoản và tỷ trọng chi tiết của từng mô hình cụ thể đã gọi"],
  ["收起",
    "Thu gọn"],
  ["模型性能指标与用量一览",
    "Tổng quan chỉ số hiệu năng và mức dùng mô hình"],
  ["当前版本暂无模型请求或性能数据",
    "Phiên bản hiện tại chưa có request mô hình hoặc dữ liệu hiệu năng"],
  ["生成速度：平均每秒吐字数 (tok/s)",
    "Tốc độ sinh: số token trung bình mỗi giây (tok/s)"],
  ["思考 Token：DeepSeek/R1 等推理模型的思考量",
    "Thinking Token: lượng thinking của các mô hình suy luận như DeepSeek/R1"],
  ["总 Token 占比进度条",
    "Thanh tiến trình tỷ trọng Tổng Token"],
  ["融合首字延迟 (TTFT)、生成速度、耗时与 Token 统计 · 含国际版与国内版全部渠道",
    "Kết hợp độ trễ token đầu (TTFT), tốc độ sinh, thời gian và thống kê Token · gồm toàn bộ kênh Quốc Tế và Trong Nước"],
  ["全部账号 | 全部模型",
    "Tất cả tài khoản | Tất cả mô hình"],
  ["每 5 秒自动刷新 · 数据来自本机反代 /app/usage/usage.jsonl",
    "Tự động làm mới mỗi 5 giây · dữ liệu từ proxy ngược trên máy /app/usage/usage.jsonl"],
  ["自动切换出站身份 (已启用)",
    "Tự động chuyển danh tính gửi đi (Đã bật)"],
  ["注意：切换后的身分会被保存，重启后继续沿用，不会自动回到 WB。",
    "Lưu ý: danh tính sau khi chuyển sẽ được lưu và tiếp tục dùng sau khi khởi động lại, không tự quay về WB."],
  ["启用自动切换",
    "Bật tự động chuyển"],
  ["国际版每日活跃打卡 (已启用)",
    "Điểm danh hoạt động hằng ngày Quốc Tế (Đã bật)"],
  ["国际版账号每日打卡时，除桌面端身分的轻量对话外，再走一次网页通道的会话。默认开启。",
    "Khi tài khoản Quốc Tế điểm danh hằng ngày, ngoài hội thoại nhẹ bằng danh tính ứng dụng trên máy tính, hệ thống chạy thêm một phiên qua kênh web. Mặc định bật."],
  ["走网页通道",
    "Đi qua kênh web"],
  ["活跃使用的模型",
    "Mô hình dùng cho hoạt động"],
  ["默认模型（deepseek-v4.1-flash，免费）",
    "Mô hình mặc định(deepseek-v4.1-flash, miễn phí)"],
  ["(默认)",
    "(Mặc định)"],
  ["本地网络工具 (直通)",
    "Công cụ mạng cục bộ (Truyền thẳng)"],
  ["由网关代跑",
    "Cổng chạy thay"],
  ["剩余用量优先调度 (未启用)",
    "Ưu tiên điều phối theo lượng dùng còn lại (Chưa bật)"],
  ["启用优先调度",
    "Bật ưu tiên điều phối"],
  ["出口级瞬时失败退避 (未启用)",
    "Giảm tải tức thời theo cổng ra (Chưa bật)"],
  ["启用出口级退避",
    "Bật giảm tải theo cổng ra"],
  ["用量聚合保留窗口",
    "Cửa sổ giữ dữ liệu tổng hợp mức dùng"],
  ["小时层",
    "Lớp giờ"],
  ["小时",
    "giờ"],
  ["日桶",
    "Bucket ngày"],
  ["天",
    "ngày"],
  ["上游响应头超时",
    "Hết thời gian chờ header phản hồi từ thượng nguồn"],
  ["秒",
    "giây"],
  ["日志落库",
    "Ghi nhật ký vào DB"],
  ["启用日志落库",
    "Bật ghi nhật ký vào DB"],
  ["最多保留条数（留空 = 不限）",
    "Số bản ghi giữ tối đa (để trống = không giới hạn)"],
  ["不限",
    "Không giới hạn"],
  ["最多保留天数（留空 = 不限）",
    "Số ngày giữ tối đa (để trống = không giới hạn)"],
  ["日志库大小上限 MB（留空 = 不限）",
    "Giới hạn dung lượng DB nhật ký MB (để trống = không giới hạn)"],
  ["更新 (尚未检查)",
    "Cập nhật (Chưa kiểm tra)"],
  ["立即检查更新",
    "Kiểm tra cập nhật ngay"],
  ["安装更新",
    "Cài đặt cập nhật"],
  ["当前版本",
    "Phiên bản hiện tại"],
  ["最新版本",
    "Phiên bản mới nhất"],
  ["上次检查",
    "Lần kiểm tra trước"],
  ["每天自动检查更新",
    "Tự động kiểm tra cập nhật hằng ngày"],
  ["默认关闭。开启后最多每 24 小时检查一次，只检查、不安装。",
    "Mặc định tắt. Khi bật, kiểm tra tối đa mỗi 24 giờ một lần, chỉ kiểm tra, không cài đặt."],
  ["运行信息",
    "Thông tin vận hành"],
  ["账号存储目录",
    "Thư mục lưu tài khoản"],
  ["用量日志目录",
    "Thư mục nhật ký mức dùng"],
  ["设置文件",
    "Tệp cài đặt"],
  ["刷新",
    "Làm mới"],
  ["退出面板登录",
    "Thoát đăng nhập bảng điều khiển"],
  ["网关运行日志",
    "Nhật ký vận hành cổng"],
  ["共 376 条 · 2 错误",
    "Tổng 376 mục · 2 lỗi"],
  ["实时监听中",
    "Đang lắng nghe thời gian thực"],
  ["自动滚屏: 开",
    "Tự cuộn: Bật"],
  ["复制",
    "Sao chép"],
  ["导出",
    "Xuất"],
  ["清空",
    "Xóa hết"],
  ["全部级别",
    "Tất cả mức"],
  ["全部模块",
    "Tất cả mô-đun"],
  ["任务福利",
    "Phúc lợi nhiệm vụ"],
  ["调度器",
    "Bộ điều phối"],
  ["账号",
    "Tài khoản"],
  ["智能体",
    "Agent"],
  ["定价",
    "Định giá"],
  ["模型",
    "Mô hình"],
  ["鉴权",
    "Xác thực"],
  ["设置",
    "Cài Đặt"],
  ["系统",
    "Hệ thống"],
  ["过滤关键字 (如 deepseek, 11-128, 401, error)...",
    "Lọc từ khóa (ví dụ deepseek, 11-128, 401, error)..."]
];
for (const [source, expected] of localizedScreenshotStrings) {
  assert.strictEqual(vi.window.WB_I18N.translateVi(source), expected, source);
}

const overridden = boot('zh', '?lang=vi');
assert.strictEqual(overridden.window.WB_I18N.current(), 'vi', 'URL override can select Vietnamese');
assert.strictEqual(overridden.window.WB_I18N.translateVi('每日 Token 限额'), 'Hạn mức Token hằng ngày');
overridden.window.WB_I18N.set('zh');
assert.strictEqual(overridden.attrs.lang, 'zh-CN');

console.log('Vietnamese i18n screenshot-string assertions passed');
