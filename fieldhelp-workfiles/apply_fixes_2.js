// Round-2 fixes: B typos/rewrites, D adjustments, clear Bed Data Update Date row, unescape &amp; in C
const fs = require('fs');
const path = require('path');
const Excel = require(process.env.EXCELJS_PATH || 'exceljs');

const XLSX = path.join(__dirname, '..', 'JCAI_Salesforce_Field_Help_Text.xlsx');

// { sheet: { row: { col(1-based): newValue | null } } }
const edits = {
  Accounts: {
    23: { 2: 'EBITDA (earnings before interest, taxes, depreciation, and amortization) in USD millions.',
          4: 'EBITDA（利払前・税引前・償却前利益、百万米ドル）。' },
    38: { 2: 'Mention the acquired company.' },
    98: { 2: 'Title of the representative.' },
    99: { 2: 'Name of the representative (Kana).' },
    100: { 2: 'Name of the representative (Kanji).' },
    216: { 2: 'Revenue growth rate based on TSR financial data.' },
    217: { 2: 'Net income growth rate based on TSR financial data.' },
  },
  Establishments: {
    49: { 2: 'Estimated annual number of prescriptions handled.' },
    50: { 2: 'Unit for the estimated total prescription count.' },
    57: { 2: null, 4: null },
  },
};

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
  fs.copyFileSync(XLSX, path.join(__dirname, 'backup_before_fixes2.xlsx'));
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(XLSX);
  let nEdits = 0, nAmp = 0;
  for (const ws of wb.worksheets) {
    // unescape &amp; in column C everywhere
    ws.eachRow({ includeEmpty: false }, (row) => {
      const c = row.getCell(3);
      const s = txt(c.value);
      if (s.includes('&amp;')) { c.value = s.replace(/&amp;/g, '&'); row.commit(); nAmp++; }
    });
    const map = edits[ws.name];
    if (!map) continue;
    for (const [r, cols] of Object.entries(map)) {
      const row = ws.getRow(Number(r));
      for (const [col, val] of Object.entries(cols)) {
        console.log(`${ws.name} r${r} col${col}: "${txt(row.getCell(Number(col)).value).slice(0, 40)}" -> "${(val || '').slice(0, 40)}"`);
        row.getCell(Number(col)).value = val;
        nEdits++;
      }
      row.commit();
    }
  }
  await wb.xlsx.writeFile(XLSX);
  console.log('OK:', nEdits, 'cell edits,', nAmp, 'C cells unescaped. Backup: backup_before_fixes2.xlsx');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
