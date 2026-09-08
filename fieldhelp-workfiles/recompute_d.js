// Recompute column D = visible to Active_アドバイザー profile (their activated pages + FLS)
const fs = require('fs');
const path = require('path');
const Excel = require(process.env.EXCELJS_PATH || 'exceljs');

const rows = require('./rows_current.json');
const fls = require('./fls_advisor.json');          // obj -> field -> true (readable via advisor's perm sets)
const permissionable = require('./permissionable.json'); // obj -> field -> true (field supports FLS)

const ROOT = path.join(__dirname, '..');
const DEF = path.join(ROOT, 'force-app', 'main', 'default');
const XLSX = path.join(ROOT, 'JCAI_Salesforce_Field_Help_Text.xlsx');

const layoutFields = f => {
  const x = fs.readFileSync(path.join(DEF, 'layouts', f), 'utf8');
  return new Set([...x.matchAll(/<field>([^<]+)<\/field>/g)].map(m => m[1]));
};
const flexiFields = f => {
  const x = fs.readFileSync(path.join(DEF, 'flexipages', f), 'utf8');
  return new Set([...x.matchAll(/<fieldItem>Record\.([^<]+)<\/fieldItem>/g)].map(m => m[1]));
};
const union = (...sets) => { const s = new Set(); sets.forEach(x => x.forEach(v => s.add(v))); return s; };

// advisor-activated pages (CRM app, desktop), resolved from profile/app/org-default overrides
const accJP = flexiFields('Japan.flexipage-meta.xml');                    // Master RT + no-RT
const accIN = flexiFields('International.flexipage-meta.xml');           // International RT
const pages = {
  Account: union(accJP, accIN),
  Contact: layoutFields('Contact-取引先責任者マスタページレイアウト.layout-meta.xml'), // org default FlexiPage3 = record detail
  Opportunity: union(
    flexiFields('FlexiPage4.flexipage-meta.xml'),          // SellingOpp (domestic)
    flexiFields('Oppotunity_CB.flexipage-meta.xml'),       // XBorderType
    layoutFields('Opportunity-マスターレイアウト.layout-meta.xml')), // BuyingOpp / CB_Sourcing_Path fallback
  Matching__c: union(
    flexiFields('Matching_Advisor.flexipage-meta.xml'),    // MatchingMaster + no-RT
    flexiFields('Matching_Advisor_M_CB.flexipage-meta.xml'), // XBorderType, Matching_Out_Out
    layoutFields('Matching__c-Advisor.layout-meta.xml')),  // CB_Target (Sourcing_RecordPage=record detail), MatchingNew
  Buy_Needs__c: flexiFields('FlexiPage5.flexipage-meta.xml'),      // org default
  Establishments__c: flexiFields('Establishments_Master.flexipage-meta.xml'), // org default
  Contract: layoutFields('Contract-契約 ページレイアウト.layout-meta.xml'),
  ContractFile__c: layoutFields('ContractFile__c-契約書レイアウト.layout-meta.xml'),
};
// Opportunity sub-sets for annotation
const oppDom = flexiFields('FlexiPage4.flexipage-meta.xml');
const oppCB = flexiFields('Oppotunity_CB.flexipage-meta.xml');

// object-level read from profile
const prof = fs.readFileSync(path.join(DEF, 'profiles', 'Active_アドバイザー.profile-meta.xml'), 'utf8');
const objRead = {};
for (const m of prof.matchAll(/<objectPermissions>([\s\S]*?)<\/objectPermissions>/g)) {
  const o = (m[1].match(/<object>([^<]+)</) || [])[1];
  const r = (m[1].match(/<allowRead>([^<]+)</) || [])[1];
  objRead[o] = r === 'true';
}

const canRead = (o, f) => fls[o] && fls[o][f] ? true : !(permissionable[o] && permissionable[o][f]);

function colD(r) {
  if (!r.api) return 'No (field not found)';
  if (objRead[r.obj] === false) return 'No (no object access)';
  if (!canRead(r.obj, r.api)) return 'No (no read permission)';
  if (!pages[r.obj].has(r.api)) return 'No (not on advisor page)';
  if (r.obj === 'Account') {
    const j = accJP.has(r.api), i = accIN.has(r.api);
    if (j && !i) return 'Yes (Japan only)';
    if (i && !j) return 'Yes (International only)';
    return 'Yes';
  }
  if (r.obj === 'Opportunity') {
    const d = oppDom.has(r.api), c = oppCB.has(r.api);
    if (d && !c) return 'Yes (domestic only)';
    if (c && !d) return 'Yes (cross-border only)';
    return 'Yes';
  }
  return 'Yes';
}

(async () => {
  fs.copyFileSync(XLSX, path.join(__dirname, 'backup_before_d2.xlsx'));
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(XLSX);
  const cs = v => v == null ? '' : (typeof v === 'object' && v.richText ? v.richText.map(t => t.text).join('') : String(v));
  const flips = [];
  for (const [sheet, list] of Object.entries(rows)) {
    const ws = wb.getWorksheet(sheet);
    const tally = {};
    for (const r of list) {
      const row = ws.getRow(r.row);
      const oldD = cs(row.getCell(4).value);
      const d = colD(r);
      row.getCell(4).value = d;
      row.commit();
      tally[d] = (tally[d] || 0) + 1;
      if (oldD.startsWith('Yes') && d.startsWith('No')) flips.push(sheet + ' | ' + r.label + ' | ' + d);
    }
    console.log(sheet, JSON.stringify(tally));
  }
  await wb.xlsx.writeFile(XLSX);
  console.log('=== flipped Yes -> No:', flips.length);
  flips.forEach(f => console.log('  ', f));
  console.log('objRead:', JSON.stringify(objRead));
})();
