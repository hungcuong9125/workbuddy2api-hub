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
  const attrs = { 'data-ui-language': instanceLanguage };
  const text = { nodeType: 3, data: '网关设置', parentNode: null };
  const root = {
    nodeType: 1,
    tagName: 'HTML',
    childNodes: [text],
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
    getAttribute(name) { return attrs[name] || null; },
    setAttribute(name, value) { attrs[name] = String(value); },
  };
  text.parentNode = root;
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
  const context = { window, document, localStorage, URLSearchParams };
  vm.runInNewContext(script, context, { filename: 'dashboard-i18n.js' });
  return { window, attrs, text };
}

const vi = boot('vi');
assert.strictEqual(vi.window.WB_I18N.current(), 'vi');
assert.strictEqual(vi.attrs.lang, 'vi');
assert.strictEqual(vi.window.WB_I18N.translateVi('网关设置'), 'Cài đặt cổng kết nối');
assert.strictEqual(vi.window.WB_I18N.translateVi('全部模型合计 (Total)'), 'Tất cả mô hình (Tổng)');
vi.window.WB_I18N.set('vi');
assert.strictEqual(vi.text.data, 'Cài đặt cổng kết nối');

const overridden = boot('zh', '?lang=vi');
assert.strictEqual(overridden.window.WB_I18N.current(), 'vi', 'URL override can select Vietnamese');
assert.strictEqual(overridden.window.WB_I18N.translateVi('每日 Token 限额'), 'Hạn mức Token hằng ngày');
overridden.window.WB_I18N.set('zh');
assert.strictEqual(overridden.attrs.lang, 'zh-CN');

console.log('PASS=6 FAIL=0');
