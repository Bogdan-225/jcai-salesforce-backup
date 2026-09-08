// Join workbook (verify_dump2.json) -> API names (rows_current.json) -> org state (retrieved metadata)
// and categorize every B/D pair into a deploy action.
const fs = require('fs');
const path = require('path');

const dump = require('../verify_dump2.json');       // current workbook: {sheet: [{r,a,b,c,d,e}]}
const rowsCur = require('../rows_current.json');    // old join: {sheet: [{row,label,api,obj}]}

const RET = path.join(__dirname, 'retrieved', 'unpackaged');
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const JP = /[぀-ヿ㐀-鿿！-｠　-〿]/;

// --- parse .object files: api -> {help, raw}
const orgFields = {}; // obj -> api -> {help, raw}
for (const f of fs.readdirSync(path.join(RET, 'objects'))) {
  const obj = f.replace('.object', '');
  const xml = fs.readFileSync(path.join(RET, 'objects', f), 'utf8');
  const map = {};
  for (const m of xml.matchAll(/<fields>([\s\S]*?)<\/fields>/g)) {
    const block = m[1];
    const fn = (block.match(/<fullName>([^<]*)<\/fullName>/) || [])[1];
    if (!fn) continue;
    const ht = block.match(/<inlineHelpText>([\s\S]*?)<\/inlineHelpText>/);
    map[fn] = { help: ht ? unesc(ht[1]) : '', raw: block };
  }
  orgFields[obj] = map;
}

// --- parse COT files: obj -> api -> {help, label}
const cot = {};
for (const f of fs.readdirSync(path.join(RET, 'objectTranslations'))) {
  const obj = f.replace('-en_US.objectTranslation', '');
  const xml = fs.readFileSync(path.join(RET, 'objectTranslations', f), 'utf8');
  const map = {};
  for (const m of xml.matchAll(/<fields>([\s\S]*?)<\/fields>/g)) {
    const block = m[1];
    const nm = (block.match(/<name>([^<]*)<\/name>/) || [])[1];
    if (!nm) continue;
    const h = block.match(/<help>([\s\S]*?)<\/help>/);
    const l = block.match(/<label>([\s\S]*?)<\/label>/);
    map[nm] = { help: h ? unesc(h[1]) : '', label: l ? unesc(l[1]) : '' };
  }
  cot[obj] = map;
}

// --- occurrence-indexed label join
const norm = s => s.replace(/\s+/g, ' ').trim();
const plan = [];
for (const [sheet, rows] of Object.entries(dump)) {
  const oldByLabel = {};
  for (const e of (rowsCur[sheet] || [])) (oldByLabel[norm(e.label)] = oldByLabel[norm(e.label)] || []).push(e);
  const seen = {};
  for (const r of rows) {
    if (r.r === 1 || !r.b) continue; // header or no EN tooltip
    const key = norm(r.a);
    const idx = seen[key] = (seen[key] || 0);
    seen[key]++;
    const cands = oldByLabel[key] || [];
    const hit = cands[idx] || cands[0];
    const entry = { sheet, row: r.r, label: r.a, b: r.b, d: r.d, obj: hit && hit.obj, api: hit && hit.api };
    if (!hit || !hit.api) { entry.action = 'NOMAP'; plan.push(entry); continue; }
    const isCustom = /__c$/.test(hit.api);
    const of = (orgFields[hit.obj] || {})[hit.api];
    if (!of) { entry.action = 'FIELD_GONE'; plan.push(entry); continue; }
    entry.custom = isCustom;
    entry.orgHelp = of.help;
    const ex = (cot[hit.obj] || {})[hit.api];
    entry.existingEnHelp = ex ? ex.help : '';
    entry.existingEnLabel = ex ? ex.label : '';
    if (!isCustom) { entry.action = 'SKIP_STANDARD'; plan.push(entry); continue; }
    if (!of.help) entry.action = 'ADD';                       // master <- D, translation <- B
    else if (JP.test(of.help)) entry.action = 'KEEP_JA';      // master untouched, translation <- B
    else entry.action = 'REPLACE_EN';                          // master EN -> D, translation <- B
    plan.push(entry);
  }
}

fs.writeFileSync(path.join(__dirname, 'plan.json'), JSON.stringify(plan, null, 1));

// --- summary
const by = {};
for (const p of plan) {
  const o = p.obj || '?';
  by[o] = by[o] || {};
  by[o][p.action] = (by[o][p.action] || 0) + 1;
}
console.log(JSON.stringify(by, null, 1));
console.log('--- problems ---');
for (const p of plan) {
  if (p.action === 'NOMAP' || p.action === 'FIELD_GONE') console.log(p.action, p.sheet, 'r' + p.row, JSON.stringify(p.label));
}
console.log('--- REPLACE_EN (master will change from English to Japanese) ---');
for (const p of plan) if (p.action === 'REPLACE_EN') console.log(` ${p.obj}.${p.api} | org: "${p.orgHelp.slice(0, 60)}"`);
console.log('--- KEEP_JA where org JA differs from workbook D ---');
for (const p of plan) if (p.action === 'KEEP_JA' && p.orgHelp.trim() !== p.d.trim()) console.log(` ${p.obj}.${p.api}\n   org: "${p.orgHelp.slice(0, 70)}"\n   wb : "${p.d.slice(0, 70)}"`);
console.log('--- existing en_US help translations that will be OVERWRITTEN (differ from B) ---');
for (const p of plan) if (p.existingEnHelp && p.existingEnHelp.trim() !== p.b.trim() && ['ADD', 'KEEP_JA', 'REPLACE_EN'].includes(p.action)) console.log(` ${p.obj}.${p.api}\n   cur: "${p.existingEnHelp.slice(0, 70)}"\n   new: "${p.b.slice(0, 70)}"`);
console.log('--- SKIP_STANDARD ---');
for (const p of plan) if (p.action === 'SKIP_STANDARD') console.log(` ${p.sheet} r${p.row} ${p.obj}.${p.api} "${p.label}"`);
