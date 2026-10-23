/* #505: the model catalogue shows a one-way "free account blocked" label.
 *
 * The claim comes from the tier map the scheduler already uses (`modelTiers`
 * from the upstream catalogue), not from a runtime 11158: the scheduler
 * refuses a gated model before any upstream request, so a "learned from
 * 11158" channel would never fire. The dashboard only renders what
 * /v1/models carries. No label means no claim - it never says a model is
 * available.
 *
 *   node tests/_test_entitlement_badge.js
 */
const {dashboardHtml} = require('./_dashboard_source.js');
const html = dashboardHtml();

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  ' + detail : '')); }
}

check('the table reads m.entitlement',
      /const ent = m\.entitlement;/.test(html));
check('any entitlement is labelled (catalogue or runtime)',
      /if\(ent\)\{/.test(html));
check('the tooltip separates the two sources',
      /ent\.source === 'catalog'/.test(html));
check('the label reads Pro Only (upstream wording)',
      /">Pro Only<\/span>/.test(html));
check('the label is not a Chinese sentence any more',
      !/>免费账号不可用<\/span>/.test(html));
check('the catalogue tooltip names requiredUserType',
      /requiredUserType=standard/.test(html));
check('the tooltip refuses to imply availability',
      /未标记不代表可用/.test(html));
check('the label sits next to the credits badge',
      /credBadge \+= ' <span class="badge warn"/.test(html));

console.log('PASS=%d FAIL=%d', pass, fail);
process.exit(fail ? 1 : 0);
