// One-off (2026-09-04): (1) merge plan_verdict_ja.json into plan.json as tiers[].verdict_ja (source of truth);
// (2) fill column D "判定（日本語・要点）" of the user's edited xlsx IN PLACE (user moved Verdict to column C by hand).
// Run from ma-data-research/: node archive/fill_verdict_ja_2026-09-04.js ../MA_Data_Providers_Research_2026-09-03.xlsx
const fs = require('fs'); const path = require('path');
const EX = require(process.env.EXCELJS_PATH || 'C:/Users/BogdanBrezeanu/.claude/tools/node_modules/exceljs');
const here = path.resolve(__dirname, '..');
const planFile = path.join(here, 'plan.json');
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const ja = JSON.parse(fs.readFileSync(path.join(here, 'plan_verdict_ja.json'), 'utf8'));
const tiers = plan.flatMap(p => p.tiers);
if (tiers.length !== ja.length) throw new Error('count mismatch: tiers=' + tiers.length + ' ja=' + ja.length);
tiers.forEach((t, i) => { t.verdict_ja = ja[i]; });
fs.writeFileSync(planFile, JSON.stringify(plan, null, 2), 'utf8');
console.log('plan.json: verdict_ja set on', tiers.length, 'sub-rows');

const xlsx = process.argv[2]; if (!xlsx) throw new Error('xlsx path required');
(async () => {
  const wb = new EX.Workbook(); await wb.xlsx.readFile(xlsx);
  const ws = wb.getWorksheet('Implementation plan');
  const HDR = 1, VERDICT_COL = 3, JA_COL = 4;
  if (!/Verdict/i.test(String(ws.getRow(HDR).getCell(VERDICT_COL).value))) throw new Error('column C header is not the Verdict column: ' + ws.getRow(HDR).getCell(VERDICT_COL).value);
  if (ws.getRow(HDR).getCell(JA_COL).value) throw new Error('column D header is not empty: ' + ws.getRow(HDR).getCell(JA_COL).value);
  // header D1: copy style of C1
  const h = ws.getRow(HDR); h.getCell(JA_COL).value = '判定（日本語・要点）'; h.getCell(JA_COL).style = JSON.parse(JSON.stringify(h.getCell(VERDICT_COL).style));
  ws.getColumn(JA_COL).width = ws.getColumn(VERDICT_COL).width;
  // body: row 2.. maps to tiers in order; sanity-check by matching the English verdict prefix
  let written = 0, mismatches = 0;
  tiers.forEach((t, i) => {
    const r = ws.getRow(i + 2); const en = String(r.getCell(VERDICT_COL).value || '');
    if (!en.startsWith((t.verdict || '').slice(0, 40))) { mismatches++; console.log('MISMATCH row', i + 2, '|', en.slice(0, 50), '| expected', (t.verdict || '').slice(0, 50)); return; }
    const c = r.getCell(JA_COL); c.value = t.verdict_ja; c.style = JSON.parse(JSON.stringify(r.getCell(VERDICT_COL).style)); written++;
  });
  if (mismatches) throw new Error('row order mismatch, nothing saved');
  await wb.xlsx.writeFile(xlsx);
  console.log('xlsx updated in place:', xlsx, '| Japanese verdicts written:', written);
})().catch(e => { console.error(e); process.exit(1); });
