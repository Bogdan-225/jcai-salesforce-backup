// Dump columns A-E of every sheet to JSON for the D-translation pass
const fs = require('fs');
const path = require('path');
const Excel = require(process.env.EXCELJS_PATH || 'exceljs');

const XLSX = path.join(__dirname, '..', 'JCAI_Salesforce_Field_Help_Text.xlsx');
const OUT = process.argv[2] || path.join(__dirname, 'dump_abcd.json');

const txt = v => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.text) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    return String(v);
  }
  return String(v);
};

(async () => {
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(XLSX);
  const out = {};
  for (const ws of wb.worksheets) {
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const a = txt(row.getCell(1).value).trim();
      const b = txt(row.getCell(2).value).trim();
      const c = txt(row.getCell(3).value).trim();
      const d = txt(row.getCell(4).value).trim();
      const e = txt(row.getCell(5).value).trim();
      if (a || b || c || d || e) rows.push({ r: n, a, b, c, d, e });
    });
    out[ws.name] = rows;
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  // summary
  for (const [s, rows] of Object.entries(out)) {
    const withB = rows.filter(r => r.b).length;
    const withD = rows.filter(r => r.d).length;
    console.log(s, '| rows:', rows.length, '| B filled:', withB, '| D filled:', withD);
  }
})();
