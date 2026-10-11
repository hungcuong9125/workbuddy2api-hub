/* Drive the dashboard's model table with a probed output clamp (M5 E2).
 *
 * scripts/probe_max_tokens.py writes accounts/output_probes.json; the gateway
 * annotates /v1/models entries with output_clamp; the dashboard must show the
 * measured value with a Vietnamese clamp note instead of the unprobed spec value.
 *
 * The dashboard itself is loaded from the file next to this test, so the
 * assertions run against the shipped code, not a copy of it.
 *
 * The first four renders carry one model each, which is what the value
 * semantics need. The fifth renders four models together and reads each cell
 * back by its data-label, so a probe indicator has to sit on the row of the
 * model it describes - with one model on the page, every string is trivially
 * "somewhere in the table" and a row-association regression is invisible.
 *
 * Requires node (no other dependency).
 *
 *   node _test_model_probes.js
 */
const assert = require('assert');
const {dashboardScript} = require('./_dashboard_source.js');

const code = dashboardScript();

// One shared fake DOM for every dashboard suite: tests/_dom_stub.js.
const dom = require('./_dom_stub.js');
const tbody = dom.makeElement('tbody');
dom.installDom({
  querySelector: {'#modelsTable tbody': tbody},
  fetch: () => Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({})}),
});

let api;
try {
  api = new Function(code + `
    ; return { renderAvailableModels };`)();
} catch (e) {
  console.log('LOAD ERROR:', e.message);
  process.exit(1);
}

function render(models){
  tbody.innerHTML = '';
  global.MODELS_DATA = models;
  api.renderAvailableModels();
  return tbody.innerHTML;
}

// A cell's visible text, whatever markup wraps it.
const text = html => String(html || '').replace(/<[^>]*>/g, '').trim();

// The rendered table as one object per row: data-label -> cell HTML, keyed by
// the model the row names. Reading a cell by the label the renderer already
// emits is what puts an assertion on a row; `out.includes(...)` only says the
// string exists. Attributes on <tr>/<td> and extra cells are ignored on
// purpose, so harmless markup churn is not a failure here.
function rowsById(html){
  const rows = {};
  for(const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)){
    const cells = {};
    for(const cell of row[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)){
      const label = (cell[1].match(/data-label="([^"]*)"/) || [])[1];
      if(label) cells[label] = cell[2];
    }
    const id = text(cells['ID Mô Hình']);
    if(id) rows[id] = cells;
  }
  return rows;
}

// 1. The probe measured less than the claimed spec -> warn with the ratio.
let out = render([{ id: 'glm-5.2', context_length: 1000000,
                    max_output_tokens: 131072, output_clamp: 32000 }]);
assert.ok(out.includes('Giới hạn'), 'clamped model must show the Vietnamese clamp note: ' + out);
assert.ok(out.includes('4.1×'), 'ratio must be claimed/measured (131072/32000 = 4.1×): ' + out);
assert.ok(out.includes('32K'), 'measured value must be shown: ' + out);
assert.ok(out.includes('⚠'), 'clamped model must carry the warning marker: ' + out);
assert.ok(out.includes('Theo công bố 131K'), 'tooltip must carry the claimed value: ' + out);

// 2. The probe says the claimed spec holds -> green check, no clamp note.
out = render([{ id: 'm2', context_length: 1000,
                max_output_tokens: 32000, output_clamp: 32000 }]);
assert.ok(!out.includes('Giới hạn'), 'a non-clamped probe must not warn: ' + out);
assert.ok(out.includes('✓'), 'a non-clamped probe must show the OK marker: ' + out);

// 3. No probe at all -> the plain spec value stays (default behaviour).
out = render([{ id: 'm3', context_length: 1000, max_output_tokens: 32000 }]);
assert.ok(!out.includes('Giới hạn') && !out.includes('⚠'),
          'an unprobed model keeps the plain value: ' + out);
assert.ok(out.includes('32K'), 'an unprobed model still shows its spec value: ' + out);

// 4. Probed but no spec value -> measured value labelled as a measured cap.
out = render([{ id: 'm4', context_length: 1000, output_clamp: 48000 }]);
assert.ok(out.includes('48K'), 'measured-only model must show the measured value: ' + out);
assert.ok(out.includes('Giới hạn đo được'), 'measured-only model must label the measured cap: ' + out);

// 5. Four models at once, one per probe state: every indicator and value must
//    sit on the row of the model it describes. Each of the four states above
//    is rendered exactly once here, so "the string is in the table" is no
//    longer enough to be right.
out = render([
  { id: 'glm-5.2', context_length: 1000000,
    max_output_tokens: 131072, output_clamp: 32000 },        // measured < claimed
  { id: 'm-equal', context_length: 1000,
    max_output_tokens: 64000, output_clamp: 64000 },         // probe agrees
  { id: 'm-plain', context_length: 1000, max_output_tokens: 16000 },  // unprobed
  { id: 'm-measured', context_length: 1000, output_clamp: 48000 },    // no spec
]);

const rows = rowsById(out);
assert.deepStrictEqual(Object.keys(rows).sort(),
                       ['glm-5.2', 'm-equal', 'm-measured', 'm-plain'],
                       'the reader must find every rendered row: ' + out);

// The probe presentation is the 最大输出 cell, so that is the cell addressed
// below. Nothing here counts rows or columns: another column is not a
// regression in this feature.
const maxOut = id => (rows[id] || {})['Max Output'] || '';
const shows = (id, needle, why) =>
  assert.ok(maxOut(id).includes(needle), why + ' [' + id + '] ' + maxOut(id));
const hides = (id, needle, why) =>
  assert.ok(!maxOut(id).includes(needle), why + ' [' + id + '] ' + maxOut(id));

// The clamped row: measured value, warning, ratio, and the claimed value in
// its tooltip.
shows('glm-5.2', '32K', 'the clamped row shows its measured value');
shows('glm-5.2', 'Giới hạn', 'the clamped row carries the clamp note');
shows('glm-5.2', '4.1×', 'the clamped row carries the claimed/measured ratio');
shows('glm-5.2', '⚠', 'the clamped row carries the warning marker');
shows('glm-5.2', 'Theo công bố 131K', 'the clamped row tooltip carries the claimed value');
hides('glm-5.2', '✓', 'a clamped row must not carry the OK marker');

// The satisfied row: the probe agrees with the spec, so OK and no warning.
shows('m-equal', '64K', 'the satisfied row shows its value');
shows('m-equal', '✓', 'the satisfied row carries the OK marker');
hides('m-equal', 'Giới hạn', 'a satisfied row must not carry a clamp note');
hides('m-equal', '⚠', 'a satisfied row must not carry the warning marker');

// The unprobed row: the plain spec value, and no probe presentation at all.
shows('m-plain', '16K', 'an unprobed row keeps its spec value');
hides('m-plain', '⚠', 'an unprobed row must not carry the warning marker');
hides('m-plain', 'Giới hạn', 'an unprobed row must not carry a clamp note');
hides('m-plain', '✓', 'an unprobed row must not claim a verified value');

// The measured-only row: the measured cap, a warning, and no ratio to show.
shows('m-measured', '48K', 'the measured-only row shows the measured value');
shows('m-measured', 'Giới hạn đo được', 'the measured-only row labels the measured cap');
shows('m-measured', '⚠', 'the measured-only row carries the warning marker');
hides('m-measured', '×', 'a measured-only row has no ratio to show');
hides('m-measured', '✓', 'a measured-only row is not a verified spec value');

// Each state is rendered exactly once, so a duplicated string means one row
// picked up another row's probe.
const once = (needle, why) =>
  assert.strictEqual(out.split(needle).length - 1, 1,
                     needle + ' must be rendered exactly once (' + why + ')');
once('Giới hạn 4.1×', 'only the clamped row has a clamp note');
once('4.1×', 'only the clamped row has a ratio');
once('Giới hạn đo được', 'only the measured-only row labels a measured cap');
once('✓', 'only the satisfied row is marked OK');
assert.strictEqual(out.split('⚠').length - 1, 2,
                   'exactly the two probed-below-spec rows warn: ' + out);

console.log('model probe dashboard assertions passed');
