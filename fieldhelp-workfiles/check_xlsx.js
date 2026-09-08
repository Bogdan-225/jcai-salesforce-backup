// Verify row alignment between current workbook and worklist.json (headers were added since)
const path = require('path');
const Excel = require(process.env.EXCELJS_PATH || 'exceljs');
const worklist = require('./worklist.json');

(async () => {
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(path.join(__dirname, '..', 'JCAI_Salesforce_Field_Help_Text.xlsx'));
  for (const ws of wb.worksheets) {
    const rows = worklist[ws.name];
    if (!rows) { console.log(ws.name, ': NOT IN WORKLIST'); continue; }
    // print first 3 rows of A/B/C/D/E to see header layout
    for (let i = 1; i <= 3; i++) {
      const vals = [1,2,3,4,5].map(c => { const v = ws.getRow(i).getCell(c).value; return v == null ? '' : String(typeof v === 'object' && v.richText ? v.richText.map(t=>t.text).join('') : v).slice(0, 25); });
      console.log(ws.name, 'row' + i, JSON.stringify(vals));
    }
    // detect offset: find worklist row1 label in column A
    const want = String(rows[0].label).trim();
    let offset = null;
    for (let i = 1; i <= 5; i++) {
      const v = ws.getRow(i).getCell(1).value;
      const s = v == null ? '' : String(typeof v === 'object' && v.richText ? v.richText.map(t=>t.text).join('') : v).trim();
      if (s === want) { offset = i - rows[0].r; break; }
    }
    // verify alignment across all rows with that offset
    let ok = 0, bad = [];
    if (offset !== null) {
      for (const r of rows) {
        const v = ws.getRow(r.r + offset).getCell(1).value;
        const s = v == null ? '' : String(typeof v === 'object' && v.richText ? v.richText.map(t=>t.text).join('') : v).trim();
        if (s === String(r.label).trim()) ok++; else bad.push(r.r + offset + ':' + s.slice(0,20) + '<>' + String(r.label).slice(0,20));
      }
    }
    console.log(ws.name, '| offset:', offset, '| aligned:', ok + '/' + rows.length, bad.slice(0,3).join(' ; '));
    console.log('---');
  }
})();
