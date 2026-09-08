// Blank B (EN tooltip) and D (JA tooltip) for standard-field rows — help text not deployable there.
const fs = require('fs');
const path = require('path');
const Excel = require(process.env.EXCELJS_PATH || 'exceljs');
const XLSX = path.join(__dirname, '..', 'JCAI_Salesforce_Field_Help_Text.xlsx');
const clear = { Accounts: [6, 45, 88], Opportunities: [2, 4, 66, 69, 70], Matches: [34] };
(async () => {
  fs.copyFileSync(XLSX, path.join(__dirname, 'backup_before_std_blank.xlsx'));
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(XLSX);
  for (const [sheet, rows] of Object.entries(clear)) {
    const ws = wb.getWorksheet(sheet);
    for (const r of rows) {
      const row = ws.getRow(r);
      console.log(sheet, 'r' + r, JSON.stringify(String(row.getCell(1).value)), '| B was:', JSON.stringify(String(row.getCell(2).value).slice(0, 40)));
      row.getCell(2).value = null;
      row.getCell(4).value = null;
      row.commit();
    }
  }
  await wb.xlsx.writeFile(XLSX);
  console.log('written. backup: backup_before_std_blank.xlsx');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
