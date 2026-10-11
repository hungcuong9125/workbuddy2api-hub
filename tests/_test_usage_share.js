/* Pin what the analytics matrix's 用量占比 column is a share *of*, and which
 * row each share belongs to.
 *
 * The column used to divide every row by the largest row, so the biggest
 * model always read 100% and everything else was a fraction of it - a
 * relative ranking wearing the label of a share. The contract asserted here
 * is the plain one: each row's own tokens over the total in the summary row,
 * which is also the number the table itself prints as the total.
 *
 * The shares are read per row, keyed by the model that row is about, instead
 * of as an array of cells in render order. The array proved the numbers were
 * present in that sequence and nothing more: swap two model labels and it is
 * unchanged, so a row-association regression survived it. Reading the model
 * cell and the share cell out of the same <tr> is what makes a mismatch a
 * mismatch.
 *
 * Only <tr>, data-label and each cell's visible text are assumed. The bar is
 * found by the width it carries rather than by its class or attribute order,
 * and the printed number is whatever the cell shows once its tags are gone, so
 * a presentation-only change is not reported as a regression.
 *
 * The dashboard is loaded from the file next to this test, so the assertions
 * run against the shipped code, not a copy of it.
 *
 * Requires node (no other dependency); the rest of the suite is Python only.
 *
 *   node _test_usage_share.js
 */
const {dashboardScript} = require('./_dashboard_source.js');
const code = dashboardScript();

// One shared fake DOM for every dashboard suite: tests/_dom_stub.js.
const dom = require('./_dom_stub.js');
dom.installDom({
  fetch: () => Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({})}),
});

var api;
try {
  api = new Function(code + `
    ; return {
        renderPerfMatrix,
        setFilters: (a, m) => { matrixAcctFilter = a; matrixModelFilter = m; },
      };`)();
} catch (e) {
  console.log('LOAD ERROR:', e.message);
  process.exit(1);
}

const S = (n) => ({ avg: n, p50: n, samples: 1 });
const dsRow = (tot, p, c) => ({ requests: 1, total_tokens: tot, prompt_tokens: p, completion_tokens: c, reasoning_tokens: 0, cached_tokens: 0 });
const perfRow = { errors: 0, ttft_ms: S(400), tokens_per_sec: S(100), wall_ms: S(1200), cache_hit_pct: { avg: 0, samples: 0 } };

/* Three chat models whose shares of the total are 50 / 30 / 20 - deliberately
 * not 100 / 60 / 40, which is what dividing by the largest row produced. */
const ROWS = { 'model-big': 5000, 'model-mid': 3000, 'model-small': 2000 };

function buildUsage(extra, total){
  const rows = Object.assign({}, ROWS, extra || {});
  const by_model = {};
  const by_model_realm = {};
  const by_model_acct = {};
  Object.keys(rows).forEach(id => {
    const r = dsRow(rows[id], rows[id] - 1000, 1000);
    by_model[id] = r;
    by_model_realm[id] = { intl: r };
    by_model_acct[id] = { intl: { 'acct-A': r } };
  });
  return {
    requests: Object.keys(rows).length,
    total_tokens: total || Object.keys(rows).reduce((s, id) => s + rows[id], 0),
    prompt_tokens: 8000, completion_tokens: 2000, reasoning_tokens: 0,
    by_model, by_model_realm, by_model_acct,
    accounts_map: { 'acct-A': { nickname: 'Hades', realm: 'intl' } },
  };
}

const perf = {
  errors: 0, ttft_ms: S(400), tokens_per_sec: S(100), wall_ms: S(1200), cache_hit_pct: { avg: 0, samples: 0 },
  by_model: Object.fromEntries(Object.keys(ROWS).map(id => [id, perfRow])),
  by_model_realm: Object.fromEntries(Object.keys(ROWS).map(id => [id, { intl: perfRow }])),
  by_model_acct: {},
};

/* The cell as the reader sees it: tags dropped, so the number is read from
 * whichever element happens to present it. */
const visible = (cell) => cell.replace(/<[^>]*>/g, '').trim();

/* A sliver keeps a 3% minimum bar so it stays visible; at or above that the
 * bar is the printed share. Written once so the per-row agreement check means
 * the same thing in the ordinary and the lopsided case. */
const BAR_FLOOR = 3;
const barMatches = (row) => row.bar === Math.max(BAR_FLOOR, row.pct);

/* Every model row, in render order - one entry per rendered row.
 *
 * A list, not a map keyed by model name: a map silently collapses two rows for
 * the same model into one, and that is the shape of regression the old count
 * check used to catch. A stray duplicate would leave the keys looking right
 * while the DOM carried an extra row, making this suite weaker than the check
 * it replaces. Keeping the list puts the multiplicity in the data, so it has
 * to be asserted rather than assumed away.
 *
 * The model cell and the share cell are taken from the same <tr>, which is the
 * other half of the point: a share cannot be attributed to a row it does not
 * sit in.
 *
 * The summary row is the one row whose share cell carries no bar - it prints
 * the total as a bare percentage - and that is what separates the two, exactly
 * as before; only the way the bar is recognised changed, from its class to the
 * width it carries.
 */
function modelRows(out){
  const rows = [];
  for(const match of out.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)){
    const row = match[1];
    const modelCell = row.match(/<td[^>]*data-label="模型"[^>]*>([\s\S]*?)<\/td>/);
    if(!modelCell) continue;
    const shareCell = row.match(/<td[^>]*data-label="用量占比"[^>]*>([\s\S]*?)<\/td>/);
    if(!shareCell) continue;
    const cell = shareCell[1];
    const bar = cell.match(/style="[^"]*width:\s*([\d.]+)\s*%/);
    if(!bar) continue;
    const pct = visible(cell).match(/([\d.]+)\s*%/);
    const model = visible(modelCell[1]);
    rows.push({ model: model, pct: pct ? Number(pct[1]) : null, bar: Number(bar[1]) });
  }
  return rows;
}

const namesOf = (rows) => rows.map(r => r.model);
const rowsFor = (rows, name) => rows.filter(r => r.model === name);
/* The single row for a model, or null when it is missing or duplicated - so a
 * model that renders twice fails the assertion reading it instead of being
 * quietly resolved to one of the two. */
const onlyRow = (rows, name) => { const hits = rowsFor(rows, name); return hits.length === 1 ? hits[0] : null; };
/* Every rendered row, duplicates included: a collapsed summary would hide the
 * very thing this diagnostic exists to show. */
const sharesOf = (rows) => rows.map(r => r.model + '=' + r.pct).join(' ') || '(none)';

/* The summary row is the row that prints a share without a bar. */
function summaryShare(out){
  for(const match of out.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)){
    const cell = match[1].match(/<td[^>]*data-label="用量占比"[^>]*>([\s\S]*?)<\/td>/);
    if(!cell || /style="[^"]*width:/.test(cell[1])) continue;
    return visible(cell[1]);
  }
  return null;
}
function summaryTok(out){
  for(const match of out.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)){
    const row = match[1];
    if(!/(?:Kết quả đã lọc|Tất Cả Mô Hình)/.test(row)) continue;
    const cell = row.match(/<td[^>]*data-label="(?:总 Token|Tổng Token)"[^>]*>([\s\S]*?)<\/td>/);
    if(cell) return visible(cell[1]);
  }
  return null;
}

let pass = 0, fail = 0;
const check = (label, cond, extra) => { if (cond) { pass++; console.log('  [PASS] ' + label); } else { fail++; console.log('  [FAIL] ' + label + (extra !== undefined ? '  ' + extra : '')); } };

console.log('[1] no filter: each row is its own tokens over the total');
api.setFilters('', '');
api.renderPerfMatrix(buildUsage(), perf);
let out = document.getElementById('perfMatrix').innerHTML;
let rows = modelRows(out);
check('exactly three model rows are rendered', rows.length === 3, sharesOf(rows));
check('each model appears exactly once, and nothing else is rendered',
      JSON.stringify(namesOf(rows).slice().sort()) === '["model-big","model-mid","model-small"]',
      sharesOf(rows));
check('model-big owns 50% of the total', (onlyRow(rows, 'model-big') || {}).pct === 50, sharesOf(rows));
check('model-mid owns 30% of the total', (onlyRow(rows, 'model-mid') || {}).pct === 30, sharesOf(rows));
check('model-small owns 20% of the total', (onlyRow(rows, 'model-small') || {}).pct === 20, sharesOf(rows));
check('the largest row is not forced to 100%', onlyRow(rows, 'model-big').pct !== 100, sharesOf(rows));
check('shares add up to the whole',
      Math.round(rows.reduce((s, r) => s + r.pct, 0) * 10) / 10 === 100,
      sharesOf(rows));
check('bar width follows the printed share in every row',
      rows.every(barMatches),
      rows.map(r => r.model + ': bar ' + r.bar + ' vs ' + r.pct).join(', '));
check('summary still prints the total', summaryTok(out) === '10,000', summaryTok(out));
check('summary row is the 100% end of the scale', summaryShare(out) === '100%', summaryShare(out));

console.log();
console.log('[2] a filter re-bases the share on the filtered total');
api.setFilters('', 'model-mid');
api.renderPerfMatrix(buildUsage(), perf);
out = document.getElementById('perfMatrix').innerHTML;
rows = modelRows(out);
check('only the filtered model remains, once',
      rows.length === 1 && rows[0].model === 'model-mid', sharesOf(rows));
check('model-mid is 100% of what is now shown', onlyRow(rows, 'model-mid').pct === 100, sharesOf(rows));
check('summary is the filtered total', summaryTok(out) === '3,000', summaryTok(out));

console.log();
console.log('[3] tokens the table does not list stay in the denominator');
/* Virtual alias buckets (default-model and friends) are counted in the
 * endpoint total but excluded from the matrix, so the listed rows must not be
 * renormalised to 100% - that would report a share of a number the table
 * never shows. */
api.setFilters('', '');
api.renderPerfMatrix(buildUsage({ 'default-model': 2000 }, 12000), perf);
out = document.getElementById('perfMatrix').innerHTML;
rows = modelRows(out);
check('model-big is a share of 12,000, not of its own 10,000',
      onlyRow(rows, 'model-big').pct === 41.7, sharesOf(rows));
check('model-mid is a share of 12,000', onlyRow(rows, 'model-mid').pct === 25, sharesOf(rows));
check('model-small is a share of 12,000', onlyRow(rows, 'model-small').pct === 16.7, sharesOf(rows));
check('summary prints the full total', summaryTok(out) === '12,000', summaryTok(out));

console.log();
console.log('[4] a lopsided total still resolves the small rows');
/* The real gateway spends almost everything on one model. A whole-percent
 * reading turns the runner-up's millions of tokens into a bare "0%", which
 * reads as "no usage" rather than "a sliver". */
api.setFilters('', '');
api.renderPerfMatrix(buildUsage({ 'model-big': 5700000000, 'model-mid': 8800000, 'model-small': 5000000 }), perf);
out = document.getElementById('perfMatrix').innerHTML;
rows = modelRows(out);
check('the dominant model reads 99.8%, not 100%', onlyRow(rows, 'model-big').pct === 99.8, sharesOf(rows));
check('the runner-up keeps a visible share',
      onlyRow(rows, 'model-mid').pct > 0 && onlyRow(rows, 'model-mid').pct < 1, sharesOf(rows));
check('the smallest row is not a bare zero', onlyRow(rows, 'model-small').pct > 0, sharesOf(rows));
check('bar width still follows the printed share in every row',
      rows.every(barMatches),
      rows.map(r => r.model + ': bar ' + r.bar + ' vs ' + r.pct).join(', '));

console.log();
console.log('PASS=' + pass + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
