const ExcelJS = require(process.env.EXCELJS_PATH);
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'research');
const out = process.argv[2];
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));

const groups = [
  ['group_a_global.json', 'A: Global commercial DB'],
  ['group_b_asia.json', 'B: Asia-regional DB'],
  ['group_c_open.json', 'C: Free / open source'],
  ['group_d_sourcing.json', 'D: Deal-sourcing / signals'],
];
let raw = [];
for (const [f, g] of groups) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { console.error('MISSING', f); continue; }
  for (const r of rd(p)) raw.push({ group: g, ...r });
}

// ---- normalise field names
const norm = r => ({
  group: r.group,
  name: r.name || '',
  website: r.website || r.website_url || r.url || '',
  hq: r.hq_country || r.hq || r.hq_country_operator || '',
  data_types: r.data_types || '', coverage_geo: r.coverage_geo || '', history_depth: r.history_depth || '',
  api: r.api || '', bulk_delivery: r.bulk_delivery || '', pricing: r.pricing || '',
  ml_training_license: r.ml_training_license || '', language: r.language || '', update_frequency: r.update_frequency || '',
  fit_for_lead_prediction: r.fit_for_lead_prediction || '', budget_tier: r.budget_tier || '', confidence: r.confidence || '',
  sources: Array.isArray(r.sources) ? r.sources : (r.sources ? [String(r.sources)] : []),
});
raw = raw.map(norm);

// ---- dedupe: canonical key by regex
const aliases = [
  [/^crunchbase/i, 'crunchbase'], [/^dealroom/i, 'dealroom'], [/^preqin/i, 'preqin'], [/aylien/i, 'aylien'],
  [/event registry/i, 'eventregistry'], [/coresignal/i, 'coresignal'], [/people data labs/i, 'pdl'],
  [/^speeda/i, 'speeda'], [/teikoku/i, 'tdb'], [/tokyo shoko/i, 'tsr'], [/nikkei value/i, 'nikkei'],
  [/gbizinfo/i, 'gbizinfo'], [/^edinet/i, 'edinet'],
];
const keyOf = n => { for (const [re, k] of aliases) if (re.test(n)) return k; return n.toLowerCase(); };
const textLen = r => Object.values(r).filter(v => typeof v === 'string').join('').length;
const mergeFields = ['coverage_geo', 'history_depth', 'api', 'bulk_delivery', 'pricing', 'ml_training_license', 'fit_for_lead_prediction', 'data_types'];
const byKey = new Map();
for (const r of raw) {
  const k = keyOf(r.name);
  if (!byKey.has(k)) { byKey.set(k, r); continue; }
  let a = byKey.get(k), b = r;
  if (textLen(b) > textLen(a)) [a, b] = [b, a];
  const tag = '[2nd researcher, group ' + b.group.slice(0, 1) + '] ';
  for (const f of mergeFields) if (b[f] && b[f].trim() && b[f].trim() !== a[f].trim()) a[f] = a[f] + '\n\n' + tag + b[f];
  if (b.budget_tier && b.budget_tier !== a.budget_tier) a.budget_tier = a.budget_tier + '\n\n' + tag + b.budget_tier;
  a.sources = [...new Set([...a.sources, ...b.sources])];
  a.group = a.group.slice(0, 1) + ' + ' + b.group.slice(0, 1) + a.group.slice(1);
  a.name = a.name.length >= b.name.length ? a.name : b.name;
  byKey.set(k, a);
}
let rows = [...byKey.values()];

const tierOf = t => { const m = /(free|low|mid|enterprise|unknown)/i.exec(t || ''); return m ? m[1].toLowerCase() : 'unknown'; };
const tierRank = t => ({ free: 0, low: 1, mid: 2, enterprise: 3, unknown: 4 })[tierOf(t)];
rows.forEach(r => r.tier = tierOf(r.budget_tier));
rows.sort((a, b) => tierRank(a.budget_tier) - tierRank(b.budget_tier) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

const wb = new ExcelJS.Workbook();
wb.creator = 'JCAI internal research';
const hdrStyle = ws => { const h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }; h.alignment = { vertical: 'middle', wrapText: true }; h.height = 34; };
const tierFill = { free: 'FFE2F0D9', low: 'FFDDEBF7', mid: 'FFFFF2CC', enterprise: 'FFF8CBAD', unknown: 'FFEDEDED' };

// ---- Read me
const notes = wb.addWorksheet('Read me');
notes.getColumn(1).width = 130;
fs.readFileSync(path.join(__dirname, 'readme.txt'), 'utf8').split(/\r?\n/).forEach(l => { const r = notes.addRow([l]); r.alignment = { wrapText: true, vertical: 'top' }; if (/^[A-Z][A-Z &()\/-]+$/.test(l.trim()) && l.trim().length > 3) r.font = { bold: true }; });
notes.getRow(1).font = { bold: true, size: 13 };

// ---- Top picks
const picks = rd(path.join(__dirname, 'picks.json'));
const tp = wb.addWorksheet('Top picks', { views: [{ state: 'frozen', ySplit: 1 }] });
tp.columns = [
  { header: 'Rank', key: 'rank', width: 12 }, { header: 'Provider', key: 'name', width: 34 }, { header: 'Role in data stack', key: 'role', width: 30 },
  { header: 'Why', key: 'why', width: 75 }, { header: 'Indicative annual cost', key: 'cost', width: 32 }, { header: 'Key risk', key: 'risk', width: 55 }, { header: 'Next action', key: 'action', width: 45 },
];
picks.forEach(p => { const r = tp.addRow(p); r.alignment = { vertical: 'top', wrapText: true }; if (/avoid/i.test(p.rank)) r.getCell('rank').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } }; if (/reference/i.test(p.rank)) r.getCell('rank').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } }; });
hdrStyle(tp);

// ---- Providers
const cols = [
  ['#', 'idx', 5], ['Provider', 'name', 28], ['Group', 'group', 20], ['Website', 'website', 36], ['HQ / operator', 'hq', 14],
  ['Tier (normalized)', 'tier', 12], ['Budget tier (detail)', 'budget_tier', 40], ['Pricing (public where available)', 'pricing', 60],
  ['Data types', 'data_types', 60], ['Geographic coverage (Asia / Japan detail)', 'coverage_geo', 55],
  ['Historical depth', 'history_depth', 40], ['API', 'api', 50], ['Bulk delivery', 'bulk_delivery', 35],
  ['ML / AI training licence', 'ml_training_license', 50], ['Language', 'language', 16], ['Update frequency', 'update_frequency', 18],
  ['Fit for M&A lead-prediction model', 'fit_for_lead_prediction', 60], ['Confidence', 'confidence', 11], ['Sources consulted', 'sources', 60],
];
const ws = wb.addWorksheet('Providers', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
ws.columns = cols.map(([h, k, w]) => ({ header: h, key: k, width: w }));
rows.forEach((r, i) => {
  const o = { idx: i + 1 };
  for (const [, k] of cols) if (k !== 'idx') o[k] = Array.isArray(r[k]) ? r[k].join('\n') : (r[k] || '');
  const row = ws.addRow(o);
  row.alignment = { vertical: 'top', wrapText: true };
  const site = String(r.website || '').trim().split(/\s/)[0];
  if (/^https?:\/\//i.test(site)) row.getCell('website').value = { text: r.website, hyperlink: site };
  row.getCell('tier').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tierFill[r.tier] } };
  row.getCell('tier').font = { bold: true };
});
hdrStyle(ws);
ws.autoFilter = { from: 'A1', to: { row: 1, column: cols.length } };

// ---- Summary by tier
const sm = wb.addWorksheet('Summary by tier', { views: [{ state: 'frozen', ySplit: 1 }] });
sm.columns = [{ header: 'Tier', key: 't', width: 12 }, { header: 'Provider', key: 'n', width: 34 }, { header: 'Group', key: 'g', width: 22 }, { header: 'API', key: 'a', width: 10 }, { header: 'Bulk', key: 'b', width: 10 }, { header: 'History (first 200 chars)', key: 'h', width: 50 }, { header: 'Coverage note (first 300 chars)', key: 'c', width: 70 }];
const yn = s => { s = (s || '').trim().toLowerCase(); return s.startsWith('yes') ? 'Yes' : s.startsWith('no') ? 'No' : s.startsWith('partial') ? 'Partial' : s.startsWith('unknown') ? 'Unknown' : '?'; };
rows.forEach(r => { const row = sm.addRow({ t: r.tier, n: r.name, g: r.group, a: yn(r.api), b: yn(r.bulk_delivery), h: r.history_depth.replace(/\s+/g, ' ').slice(0, 200), c: r.coverage_geo.replace(/\s+/g, ' ').slice(0, 300) }); row.alignment = { vertical: 'top', wrapText: true }; row.getCell('t').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tierFill[r.tier] } }; });
hdrStyle(sm);
sm.autoFilter = { from: 'A1', to: { row: 1, column: 7 } };

wb.xlsx.writeFile(out).then(() => console.log('WROTE', out, '| providers:', rows.length, '| raw:', raw.length, '| picks:', picks.length));
