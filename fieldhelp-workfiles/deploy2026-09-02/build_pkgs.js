// Build one mdapi deploy package per object from plan.json + manual overrides.
// Master inlineHelpText: ADD (insert) / REPLACE_EN (swap). Translations (en_US help = column B): ADD + KEEP_JA + REPLACE_EN.
const fs = require('fs');
const path = require('path');

const plan = require('./plan.json');
const RET = path.join(__dirname, 'retrieved', 'unpackaged');

// manual mappings for rows the label-join missed (labels renamed in workbook)
const overrides = {
  'Accounts|219': { obj: 'Account', api: 'TSRRepAdress__c' },
  'Accounts|220': { obj: 'Account', api: 'TSRRepLocal__c' },
  'Accounts|221': { obj: 'Account', api: 'TSRRepEducation__c' },
  'Opportunities|116': { obj: 'Opportunity', api: 'CB_EVValue_USDmm__c' },
};
for (const p of plan) {
  const o = overrides[p.sheet + '|' + p.row];
  if (o) Object.assign(p, o, { action: 'ADD', custom: true, orgHelp: '', existingEnHelp: '' });
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// raw field blocks from retrieved objects
const rawBlocks = {};
for (const f of fs.readdirSync(path.join(RET, 'objects'))) {
  const obj = f.replace('.object', '');
  const xml = fs.readFileSync(path.join(RET, 'objects', f), 'utf8');
  const map = {};
  for (const m of xml.matchAll(/<fields>[\s\S]*?<\/fields>/g)) {
    const fn = (m[0].match(/<fullName>([^<]*)<\/fullName>/) || [])[1];
    if (fn) map[fn] = m[0];
  }
  rawBlocks[obj] = map;
}

// group by object, dedupe by api
const byObj = {};
const errors = [];
for (const p of plan) {
  if (!['ADD', 'KEEP_JA', 'REPLACE_EN'].includes(p.action)) continue;
  if (p.b.length > 255 || p.d.length > 255) errors.push(`OVER255 ${p.obj}.${p.api}`);
  const g = byObj[p.obj] = byObj[p.obj] || {};
  if (g[p.api]) {
    if (g[p.api].b !== p.b || g[p.api].d !== p.d) errors.push(`DUP CONFLICT ${p.obj}.${p.api} (${p.sheet} r${p.row} vs ${g[p.api].sheet} r${g[p.api].row})`);
    continue;
  }
  g[p.api] = p;
}
if (errors.length) { errors.forEach(e => console.log('ERROR', e)); process.exit(1); }

const HDR = '<?xml version="1.0" encoding="UTF-8"?>\n';
for (const [obj, fields] of Object.entries(byObj)) {
  const dir = path.join(__dirname, 'pkg_' + obj);
  fs.mkdirSync(path.join(dir, 'objects'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'objectTranslations'), { recursive: true });

  const masterApis = [], blocks = [], cotEntries = [];
  for (const [api, p] of Object.entries(fields)) {
    if (p.action === 'ADD' || p.action === 'REPLACE_EN') {
      let blk = rawBlocks[obj][api];
      if (!blk) { console.log('MISSING RAW BLOCK', obj, api); process.exit(1); }
      const tag = `<inlineHelpText>${esc(p.d)}</inlineHelpText>`;
      if (/<inlineHelpText>/.test(blk)) blk = blk.replace(/<inlineHelpText>[\s\S]*?<\/inlineHelpText>/, tag);
      else if (/^\s*<label>/m.test(blk)) blk = blk.replace(/^(\s*)<label>/m, `$1${tag}\n$1<label>`);
      else { console.log('NO LABEL ANCHOR', obj, api); process.exit(1); }
      blocks.push(blk);
      masterApis.push(api);
    }
    cotEntries.push(`    <fields>\n        <help>${esc(p.b)}</help>\n        <name>${api}</name>\n    </fields>`);
  }

  fs.writeFileSync(path.join(dir, 'objects', obj + '.object'),
    HDR + '<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">\n    ' + blocks.join('\n    ') + '\n</CustomObject>\n');
  fs.writeFileSync(path.join(dir, 'objectTranslations', obj + '-en_US.objectTranslation'),
    HDR + '<CustomObjectTranslation xmlns="http://soap.sforce.com/2006/04/metadata">\n' + cotEntries.join('\n') + '\n</CustomObjectTranslation>\n');

  const pkg = [HDR + '<Package xmlns="http://soap.sforce.com/2006/04/metadata">'];
  pkg.push('    <types>');
  masterApis.sort().forEach(a => pkg.push(`        <members>${obj}.${a}</members>`));
  pkg.push('        <name>CustomField</name>\n    </types>');
  pkg.push('    <types>');
  pkg.push(`        <members>${obj}-en_US</members>`);
  pkg.push('        <name>CustomObjectTranslation</name>\n    </types>');
  pkg.push('    <version>62.0</version>\n</Package>');
  fs.writeFileSync(path.join(dir, 'package.xml'), pkg.join('\n') + '\n');

  console.log(obj, '| master changes:', masterApis.length, '| en_US help entries:', cotEntries.length);
}
