// Re-runnable: copies verdict (col C) and verdict_ja (col D) from plan.json into the Implementation plan sheet of an
// existing xlsx IN PLACE, matching rows by order (row 2.. = plan tiers in order). Only cells whose text differs are touched.
// Run from ma-data-research/: node archive/sync_plan_verdicts_to_xlsx.js ../MA_Data_Providers_Research_2026-09-03.xlsx
const fs = require('fs'); const path = require('path');
const EX = require(process.env.EXCELJS_PATH || 'C:/Users/BogdanBrezeanu/.claude/tools/node_modules/exceljs');
const here = path.resolve(__dirname, '..');
const plan = JSON.parse(fs.readFileSync(path.join(here, 'plan.json'), 'utf8'));
const tiers = plan.flatMap(p => p.tiers.map(t => ({ ...t, region: p.region })));
const xlsx = process.argv[2]; if (!xlsx) throw new Error('xlsx path required');
(async () => {
  const wb = new EX.Workbook(); await wb.xlsx.readFile(xlsx);
  const ws = wb.getWorksheet('Implementation plan');
  const h = ws.getRow(1);
  if (!/Verdict/i.test(String(h.getCell(3).value)) || !/判定/.test(String(h.getCell(4).value))) throw new Error('unexpected headers: C=' + h.getCell(3).value + ' D=' + h.getCell(4).value);
  if (ws.rowCount - 1 !== tiers.length) throw new Error('row count ' + (ws.rowCount - 1) + ' != tiers ' + tiers.length);
  let changed = 0;
  tiers.forEach((t, i) => {
    const r = ws.getRow(i + 2);
    // sanity: the region block label in col A (merged, first row of block) or the price label in col E must belong to this tier
    const e = r.getCell(5).value; const lbl = e && e.richText ? e.richText[0].text.trim() : String(e || '');
    if (t.label && !lbl.startsWith(t.label.slice(0, 20))) throw new Error('row ' + (i + 2) + ' label mismatch: "' + lbl.slice(0, 40) + '" vs "' + t.label.slice(0, 40) + '" - nothing saved');
    if (String(r.getCell(3).value || '') !== (t.verdict || '')) { r.getCell(3).value = t.verdict || ''; changed++; }
    if (String(r.getCell(4).value || '') !== (t.verdict_ja || '')) { r.getCell(4).value = t.verdict_ja || ''; changed++; }
  });
  if (!changed) { console.log('nothing to change'); return; }
  await wb.xlsx.writeFile(xlsx); console.log('xlsx updated in place; cells changed:', changed);
})().catch(e => { console.error(e.message || e); process.exit(1); });
