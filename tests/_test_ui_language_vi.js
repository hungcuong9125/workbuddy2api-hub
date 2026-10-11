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
  const labelAttrs = {'data-label': '原因', 'data-tip': '面板手动停用，该账号不参与轮询'};
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
    addEventListener() {},
    getElementById() { return null; },
  };
  const localStorage = {
    getItem() { return null; },
    setItem() {},
  };
  const window = {
    location: { search: query },
    confirm() { return true; },
    alert() {},
  };
  class Observer {
    constructor(callback) { this.callback = callback; observer = this; }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() {}
  }
  const context = { window, document, localStorage, URLSearchParams,
                    MutationObserver: Observer };
  vm.runInNewContext(script, context, { filename: 'dashboard-i18n.js' });
  return { window, attrs, text, label, labelAttrs, root,
           get observer() { return observer; } };
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
vi.observer.callback([{type: 'childList', addedNodes: [dynamicText]}]);
assert.strictEqual(dynamicText.data,
  'Tài khoản bị tắt thủ công trên bảng điều khiển, không tham gia luân phiên.');
vi.labelAttrs['data-label'] = '恢复时间';
vi.observer.callback([{type: 'attributes', target: vi.label}]);
assert.strictEqual(vi.labelAttrs['data-label'], 'Thời gian khôi phục');

const screenshotStrings = [
  ['本页导航', 'Điều hướng trang này'],
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
  ['无调用', 'Không có yêu cầu'],
  ['启动参数', 'Tham số khởi chạy'],
  ['未归属', 'Chưa phân bổ'],
  ['（切换前）', '(Trước khi nâng cấp)'],
  ['(2 把)', '(2 API Key)'],
];
for(const [source, expected] of screenshotStrings){
  assert.strictEqual(vi.window.WB_I18N.translateVi(source), expected, source);
}
const mixedLanguageStrings = [
  '面板手动停用，该账号不参与轮询',
  '多个账号按会话粘性 + 轮询使用；某个账号被上游拒绝时自动切到下一个',
  '出站身份：WB = WorkBuddy 独立桌面客户端（默认），VSC = 官方 VSCode 插件，CLI = 官方 CodeBuddy CLI；三者对应不同的出站指纹与配额通道。',
  'Key 维度只从本次升级之后开始记录：更早的请求没有这个字段，会一直留在「(切换前)」里且不会再增长。',
  '上游连续失败触发熔断，本窗口内不接单；账号与凭证本身没问题，2h05m后自动恢复',
];
for(const source of mixedLanguageStrings){
  assert.doesNotMatch(vi.window.WB_I18N.translateVi(source), /[\u3400-\u9fff]/, source);
}

const overridden = boot('zh', '?lang=vi');
assert.strictEqual(overridden.window.WB_I18N.current(), 'vi', 'URL override can select Vietnamese');
assert.strictEqual(overridden.window.WB_I18N.translateVi('每日 Token 限额'), 'Hạn mức Token hằng ngày');
overridden.window.WB_I18N.set('zh');
assert.strictEqual(overridden.attrs.lang, 'zh-CN');

console.log('Vietnamese i18n screenshot-string assertions passed');
