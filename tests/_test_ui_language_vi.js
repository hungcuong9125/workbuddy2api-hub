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
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(labelAttrs, name); },
    getAttribute(name) { return labelAttrs[name] || null; },
    setAttribute(name, value) { labelAttrs[name] = String(value); },
  };
  const root = {
    nodeType: 1,
    tagName: 'HTML',
    childNodes: [text, label],
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

const overridden = boot('zh', '?lang=vi');
assert.strictEqual(overridden.window.WB_I18N.current(), 'vi', 'URL override can select Vietnamese');
assert.strictEqual(overridden.window.WB_I18N.translateVi('每日 Token 限额'), 'Hạn mức Token hằng ngày');
overridden.window.WB_I18N.set('zh');
assert.strictEqual(overridden.attrs.lang, 'zh-CN');

console.log('Vietnamese i18n screenshot-string assertions passed');
