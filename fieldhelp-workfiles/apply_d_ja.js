// Write Japanese tooltips (translations_d.json) into column D. Touches column D only.
const fs = require('fs');
const path = require('path');
const Excel = require(process.env.EXCELJS_PATH || 'exceljs');
const tr = require('./translations_d.json');

const XLSX = path.join(__dirname, '..', 'JCAI_Salesforce_Field_Help_Text.xlsx');

const txt = v => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.text) return String(v.text);
    return String(v);
  }
  return String(v);
};

(async () => {
  fs.copyFileSync(XLSX, path.join(__dirname, 'backup_before_d_ja.xlsx'));
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(XLSX);
  let written = 0;
  const problems = [];
  for (const ws of wb.worksheets) {
    const map = tr[ws.name] || {};
    // safety: every B-filled row (except header) must have a translation; every mapped row must have B
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const b = txt(row.getCell(2).value).trim();
      if (b && !map[n]) problems.push(`UNMAPPED B: ${ws.name} r${n}: ${b.slice(0, 40)}`);
      if (!b && map[n]) problems.push(`MAP WITHOUT B: ${ws.name} r${n}`);
    });
    for (const [r, text] of Object.entries(map)) {
      if (text.length > 255) problems.push(`OVER 255 (${text.length}): ${ws.name} r${r}`);
      const row = ws.getRow(Number(r));
      row.getCell(4).value = text;
      row.commit();
      written++;
    }
  }
  if (problems.length) {
    console.log('PROBLEMS — file NOT written:');
    problems.forEach(p => console.log(' ', p));
    process.exit(1);
  }
  await wb.xlsx.writeFile(XLSX);
  console.log('OK: wrote', written, 'D cells across', wb.worksheets.length, 'sheets. Backup: backup_before_d_ja.xlsx');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
