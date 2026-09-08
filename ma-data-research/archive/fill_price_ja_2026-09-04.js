// One-off (2026-09-04): write Japanese translations of column B (price / what we get) into column C of the
// user's sheet '国ごとのプロバイダー', IN PLACE. Rows 2..32 = plan tiers in order. Style copied from column B per row.
// Also stores the texts in plan.json as tiers[].price_ja. Run from ma-data-research/:
//   node archive/fill_price_ja_2026-09-04.js ../MA_Data_Providers_Research_2026-09-03.xlsx
const fs = require('fs'); const path = require('path');
const EX = require(process.env.EXCELJS_PATH || 'C:/Users/BogdanBrezeanu/.claude/tools/node_modules/exceljs');
const here = path.resolve(__dirname, '..');
const plan = JSON.parse(fs.readFileSync(path.join(here, 'plan.json'), 'utf8'));
const ja = JSON.parse(fs.readFileSync(path.join(here, 'plan_price_ja.json'), 'utf8'));
const tiers = plan.flatMap(p => p.tiers);
if (tiers.length !== ja.length) throw new Error('count mismatch tiers=' + tiers.length + ' ja=' + ja.length);
const txt = v => v == null ? '' : (v.richText ? v.richText.map(t => t.text).join('') : String(v));
const xlsx = process.argv[2]; if (!xlsx) throw new Error('xlsx path required');
(async () => {
  const wb = new EX.Workbook(); await wb.xlsx.readFile(xlsx);
  const ws = wb.getWorksheet('国ごとのプロバイダー'); if (!ws) throw new Error('sheet not found');
  if (ws.rowCount - 1 !== tiers.length) throw new Error('row count ' + (ws.rowCount - 1) + ' != ' + tiers.length);
  // sanity: every B cell must start with FREE/PAID matching the tier label, and every C cell must be empty
  tiers.forEach((t, i) => {
    const r = ws.getRow(i + 2); const b = txt(r.getCell(2).value); const c = txt(r.getCell(3).value);
    const want = /^free/i.test(t.label) ? /^FREE/i : /^PAID/i;
    if (!want.test(b.trim())) throw new Error('row ' + (i + 2) + ' B does not match tier ' + t.label.slice(0, 30) + ': ' + b.slice(0, 40));
    if (c) throw new Error('row ' + (i + 2) + ' C not empty: ' + c.slice(0, 40));
  });
  tiers.forEach((t, i) => {
    const r = ws.getRow(i + 2); const src = r.getCell(2); const dst = r.getCell(3);
    dst.value = ja[i]; dst.style = JSON.parse(JSON.stringify(src.style || {}));
    dst.alignment = { ...(dst.alignment || {}), vertical: 'top', wrapText: true };
    t.price_ja = ja[i];
  });
  await wb.xlsx.writeFile(xlsx);
  fs.writeFileSync(path.join(here, 'plan.json'), JSON.stringify(plan, null, 2), 'utf8');
  console.log('written', tiers.length, 'cells into column C of', xlsx, '+ plan.json price_ja');
})().catch(e => { console.error(e.message || e); process.exit(1); });
