// Map current workbook rows (by column-A label) to Salesforce fields -> rows_current.json
const fs = require('fs');
const path = require('path');
const Excel = require(process.env.EXCELJS_PATH || 'exceljs');
const worklist = require('./worklist.json');
const fieldinfo = require('./fieldinfo.json');

const SHEET_OBJ = {
  'Accounts': ['Account'], 'Contacts': ['Contact'], 'Opportunities': ['Opportunity'],
  'Matches': ['Matching__c'], 'M&A Needs': ['Buy_Needs__c'], 'Establishments': ['Establishments__c'],
  'Contracts': ['Contract', 'ContractFile__c'],
};
const norm = s => String(s || '').replace(/[？?]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const cellStr = v => v == null ? '' : (typeof v === 'object' && v.richText ? v.richText.map(t => t.text).join('') : String(v));

(async () => {
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(path.join(__dirname, '..', 'JCAI_Salesforce_Field_Help_Text.xlsx'));
  const out = {};
  for (const ws of wb.worksheets) {
    const objs = SHEET_OBJ[ws.name];
    if (!objs) continue;
    // label -> ordered queue of apis from last session's verified join (same sheet)
    const wlQueues = {};
    for (const r of worklist[ws.name] || []) {
      if (!r.api) continue;
      const obj = objs.find(o => fieldinfo[o][r.api]);
      if (!obj) continue;
      (wlQueues[norm(r.label)] = wlQueues[norm(r.label)] || []).push({ api: r.api, obj });
    }
    // en describe-label -> apis (per object, only unique labels usable)
    const byLabel = {};
    for (const o of objs)
      for (const [api, d] of Object.entries(fieldinfo[o]))
        (byLabel[norm(d.enLabel)] = byLabel[norm(d.enLabel)] || []).push({ api, obj: o });

    const rows = [];
    const last = ws.actualRowCount || ws.rowCount;
    for (let i = 2; i <= last; i++) {
      const label = cellStr(ws.getRow(i).getCell(1).value).trim();
      if (!label) continue;
      const n = norm(label);
      let hit = null, src = null;
      if (wlQueues[n] && wlQueues[n].length) { hit = wlQueues[n].shift(); src = 'worklist'; }
      else if (byLabel[n]) {
        if (byLabel[n].length === 1) { hit = byLabel[n][0]; src = 'label'; }
        else { hit = byLabel[n][0]; src = 'label-ambig(' + byLabel[n].length + ')'; }
      } else {
        // try api-name match (some rows may hold API names)
        for (const o of objs) if (fieldinfo[o][label]) { hit = { api: label, obj: o }; src = 'apiname'; break; }
      }
      rows.push({ row: i, label, api: hit ? hit.api : null, obj: hit ? hit.obj : null, src });
    }
    out[ws.name] = rows;
    const un = rows.filter(r => !r.api);
    console.log(ws.name, '| rows:', rows.length, '| matched:', rows.length - un.length, '| unmatched:', un.length);
    un.forEach(r => console.log('   UNMATCHED row', r.row, JSON.stringify(r.label.slice(0, 40))));
    rows.filter(r => r.src && r.src.startsWith('label-ambig')).forEach(r => console.log('   AMBIG row', r.row, r.label.slice(0,30), '->', r.api, r.src));
  }
  fs.writeFileSync(path.join(__dirname, 'rows_current.json'), JSON.stringify(out, null, 1));
})();
