// Build dataset.json: per workbook row -> object, type, master label, ja translation, visibility
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEF = path.join(ROOT, 'force-app', 'main', 'default');
const worklist = require('./worklist.json');

const SHEET_OBJ = {
  'Accounts': ['Account'],
  'Contacts': ['Contact'],
  'Opportunities': ['Opportunity'],
  'Matches': ['Matching__c'],
  'M&A Needs': ['Buy_Needs__c'],
  'Establishments': ['Establishments__c'],
  'Contracts': ['Contract', 'ContractFile__c'],
};
const OBJECTS = ['Account','Contact','Opportunity','Matching__c','Buy_Needs__c','Establishments__c','Contract','ContractFile__c'];

// --- describes: field name -> {type, label(en), filterable, aggregatable...}
const describe = {};
for (const o of OBJECTS) {
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, `describe_${o}.json`), 'utf8'));
  const d = j.result || j;
  describe[o] = {};
  for (const f of d.fields) describe[o][f.name] = { type: f.type, label: f.label, filterable: f.filterable, groupable: f.groupable, custom: f.custom };
}

// --- master labels from CustomObject field metadata
const masterLabel = {}; // obj -> field -> label
for (const o of OBJECTS) {
  masterLabel[o] = {};
  const fdir = path.join(DEF, 'objects', o, 'fields');
  if (!fs.existsSync(fdir)) continue;
  for (const f of fs.readdirSync(fdir)) {
    const x = fs.readFileSync(path.join(fdir, f), 'utf8');
    const name = (x.match(/<fullName>([^<]+)<\/fullName>/) || [])[1];
    const label = (x.match(/<label>([^<]+)<\/label>/) || [])[1];
    if (name && label) masterLabel[o][name] = label;
  }
}

// --- ja translations
const jaTrans = {}; // obj -> field -> ja label
for (const o of OBJECTS) {
  jaTrans[o] = {};
  const tdir = path.join(DEF, 'objectTranslations', `${o}-ja`);
  if (!fs.existsSync(tdir)) continue;
  for (const f of fs.readdirSync(tdir).filter(f => f.endsWith('.fieldTranslation-meta.xml'))) {
    const x = fs.readFileSync(path.join(tdir, f), 'utf8');
    const name = (x.match(/<name>([^<]+)<\/name>/) || [])[1];
    // label translation lives in <label> or in caseValues/value
    const label = (x.match(/<label>([^<]+)<\/label>/) || [])[1] ||
                  (x.match(/<caseValues>[\s\S]*?<value>([^<]+)<\/value>/) || [])[1];
    if (name && label) jaTrans[o][name] = label;
  }
}

// --- visibility: union of all layouts + all flexipage fieldItems per object
const visible = {}; // obj -> Set(field)
for (const o of OBJECTS) visible[o] = new Set();
const ldir = path.join(DEF, 'layouts');
for (const f of fs.readdirSync(ldir).filter(f => f.endsWith('.layout-meta.xml'))) {
  const obj = f.split('-')[0];
  if (!visible[obj]) continue;
  const x = fs.readFileSync(path.join(ldir, f), 'utf8');
  for (const m of x.matchAll(/<field>([^<]+)<\/field>/g)) visible[obj].add(m[1]);
}
const fdir2 = path.join(DEF, 'flexipages');
for (const f of fs.readdirSync(fdir2).filter(f => f.endsWith('.xml'))) {
  const x = fs.readFileSync(path.join(fdir2, f), 'utf8');
  const so = (x.match(/<sobjectType>([^<]+)<\/sobjectType>/) || [])[1];
  if (!so || !visible[so]) continue;
  for (const m of x.matchAll(/<fieldItem>Record\.([^<]+)<\/fieldItem>/g)) visible[so].add(m[1]);
}

// --- assemble dataset
const out = {};
const stats = {};
for (const [sheet, rows] of Object.entries(worklist)) {
  const objs = SHEET_OBJ[sheet];
  out[sheet] = rows.map(r => {
    let obj = null;
    if (r.api) for (const o of objs) if (describe[o][r.api]) { obj = o; break; }
    const api = obj ? r.api : null;
    const row = {
      r: r.r, label: r.label, api, obj,
      type: obj ? describe[obj][api].type : null,
      filterable: obj ? describe[obj][api].filterable : null,
      enLabel: obj ? describe[obj][api].label : null,
      master: obj ? (masterLabel[obj][api] || null) : null,
      jaT: obj ? (jaTrans[obj][api] || null) : null,
      vis: obj ? visible[obj].has(api) : false,
    };
    return row;
  });
  const s = { rows: rows.length, matched: out[sheet].filter(x => x.obj).length,
    visYes: out[sheet].filter(x => x.vis).length,
    hasJaMaster: out[sheet].filter(x => x.master && /[　-鿿！-￥゠-ヿ぀-ゟ]/.test(x.master)).length,
    hasJaTrans: out[sheet].filter(x => x.jaT).length };
  stats[sheet] = s;
}
fs.writeFileSync(path.join(__dirname, 'dataset.json'), JSON.stringify(out, null, 1));
// full per-object field info (independent of workbook rows)
const fieldinfo = {};
for (const o of OBJECTS) {
  fieldinfo[o] = {};
  for (const [name, d] of Object.entries(describe[o])) {
    fieldinfo[o][name] = { type: d.type, filterable: d.filterable, enLabel: d.label,
      master: masterLabel[o][name] || null, jaT: jaTrans[o][name] || null, vis: visible[o].has(name) };
  }
}
fs.writeFileSync(path.join(__dirname, 'fieldinfo.json'), JSON.stringify(fieldinfo, null, 1));
console.table(stats);
// visibility set sizes
for (const o of OBJECTS) console.log(o, 'visible fields in org UI:', visible[o].size);
