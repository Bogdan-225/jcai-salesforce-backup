// Fill columns C (Japanese label), D (implemented/visible), E (usage count) in the workbook
const fs = require('fs');
const path = require('path');
const Excel = require(process.env.EXCELJS_PATH || 'exceljs');

const rows = require('./rows_current.json');
const fieldinfo = require('./fieldinfo.json');
const jaOver = require('./ja_overrides.json');
const counts = require('./counts.json');

const ROOT = path.join(__dirname, '..');
const DEF = path.join(ROOT, 'force-app', 'main', 'default');
const XLSX = path.join(ROOT, 'JCAI_Salesforce_Field_Help_Text.xlsx');
const JP = /[　-鿿！-￥぀-ヿ]/;

const layoutFields = f => {
  const x = fs.readFileSync(path.join(DEF, 'layouts', f), 'utf8');
  return new Set([...x.matchAll(/<field>([^<]+)<\/field>/g)].map(m => m[1]));
};
const flexiFields = f => {
  const x = fs.readFileSync(path.join(DEF, 'flexipages', f), 'utf8');
  return new Set([...x.matchAll(/<fieldItem>Record\.([^<]+)<\/fieldItem>/g)].map(m => m[1]));
};
const union = (...sets) => { const s = new Set(); sets.forEach(x => x.forEach(v => s.add(v))); return s; };

const accJP = union(layoutFields('Account-Japan.layout-meta.xml'), flexiFields('Japan.flexipage-meta.xml'));
const accIN = union(layoutFields('Account-International.layout-meta.xml'), flexiFields('International.flexipage-meta.xml'));
const oppDOM = layoutFields('Opportunity-国内案件.layout-meta.xml');
const oppCB = union(layoutFields('Opportunity-CB_Project.layout-meta.xml'), layoutFields('Opportunity-CB_Sourcing.layout-meta.xml'), flexiFields('Oppotunity_CB.flexipage-meta.xml'));

function colD(r) {
  if (!r.api) return 'No (field not found)';
  if (!fieldinfo[r.obj][r.api].vis) return 'No';
  if (r.obj === 'Account') {
    const j = accJP.has(r.api), i = accIN.has(r.api);
    if (j && i) return 'Yes';
    if (j) return 'Yes (Japan only)';
    if (i) return 'Yes (International only)';
    return 'Yes (other layout)';
  }
  if (r.obj === 'Opportunity') {
    const d = oppDOM.has(r.api), c = oppCB.has(r.api);
    if (d && c) return 'Yes';
    if (d) return 'Yes (domestic only)';
    if (c) return 'Yes (cross-border only)';
    return 'Yes (other layout)';
  }
  return 'Yes';
}
function colC(r) {
  if (!r.api) return '';
  const f = fieldinfo[r.obj][r.api];
  if (f.jaT) return f.jaT;
  if (f.master && JP.test(f.master)) return f.master;
  return jaOver[r.obj + '.' + r.api] || '';
}
function colE(r) {
  if (!r.api || !fieldinfo[r.obj][r.api].vis) return null;
  const c = counts.fields[r.obj + '.' + r.api];
  if (!c) return 'n/a';
  if (c.mode === 'error') return 'n/a';
  if (c.mode === 'sampled2000') return c.n + '+ (first 2000 sampled)';
  return c.n; // exact, true-count, sampled-all
}

(async () => {
  fs.copyFileSync(XLSX, path.join(__dirname, 'backup_before_cde.xlsx'));
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(XLSX);
  const missing = [];
  for (const [sheet, list] of Object.entries(rows)) {
    const ws = wb.getWorksheet(sheet);
    for (const r of list) {
      const row = ws.getRow(r.row);
      const c = colC(r);
      if (!c && r.api) missing.push(sheet + ' r' + r.row + ' ' + r.obj + '.' + r.api);
      row.getCell(3).value = c || null;
      row.getCell(4).value = colD(r);
      const e = colE(r);
      row.getCell(5).value = e === null ? null : e;
      row.commit();
    }
  }
  await wb.xlsx.writeFile(XLSX);
  console.log('written. missing JA labels:', missing.length);
  missing.forEach(m => console.log('  MISSING', m));
  // quick stats
  for (const [sheet, list] of Object.entries(rows)) {
    const zero = list.filter(r => colE(r) === 0).length;
    const no = list.filter(r => colD(r).startsWith('No')).length;
    console.log(sheet, '| rows', list.length, '| D=No:', no, '| E=0:', zero);
  }
})();
