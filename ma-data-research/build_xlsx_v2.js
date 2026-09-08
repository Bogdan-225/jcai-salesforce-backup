// Rebuilds the full workbook: original sheets (Read me, Top picks, Providers, Summary by tier)
// plus v2 sheets: Implementation plan, Why this plan, Core sources deep dive, Asia free bonus.
// Usage: node build_xlsx_v2.js <out.xlsx>   (run from ma-data-research/)
const ExcelJS = require(process.env.EXCELJS_PATH);
const fs = require('fs');
const path = require('path');
const here = __dirname;
const out = process.argv[2];
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const exists = f => fs.existsSync(f);
const S = v => Array.isArray(v) ? v.join('\n') : (v == null ? '' : (typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v)));

const wb = new ExcelJS.Workbook();
wb.creator = 'JCAI internal research';
const NAVY = 'FF1F3864';
const hdrStyle = ws => { const h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; h.alignment = { vertical: 'middle', wrapText: true }; h.height = 34; };
const wrapRows = ws => ws.eachRow((r, i) => { if (i > 1) r.alignment = { vertical: 'top', wrapText: true }; });
const tierFill = { free: 'FFE2F0D9', low: 'FFDDEBF7', mid: 'FFFFF2CC', enterprise: 'FFF8CBAD', unknown: 'FFEDEDED' };

// ---------- Read me
const notes = wb.addWorksheet('Read me');
notes.getColumn(1).width = 130;
const readme = fs.readFileSync(path.join(here, 'readme.txt'), 'utf8').split(/\r?\n/);
readme.forEach(l => { const r = notes.addRow([l]); r.alignment = { wrapText: true, vertical: 'top' }; if (/^[A-Z][A-Z0-9 &()\/,-]+$/.test(l.trim()) && l.trim().length > 3) r.font = { bold: true }; });
notes.getRow(1).font = { bold: true, size: 13 };

// ---------- Why this plan
if (exists(path.join(here, 'why.json'))) {
  const why = rd(path.join(here, 'why.json'));
  const ws = wb.addWorksheet('Why this plan', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [{ header: 'Section', key: 'section', width: 30 }, { header: 'Argument', key: 'point', width: 110 }, { header: 'Evidence / where to look', key: 'evidence', width: 55 }];
  why.forEach(w => { const r = ws.addRow(w); r.getCell('section').font = { bold: true }; });
  hdrStyle(ws); wrapRows(ws);
}

// ---------- Implementation plan
if (exists(path.join(here, 'plan.json'))) {
  const plan = rd(path.join(here, 'plan.json'));
  // v3 (2026-09-04): options table, one block per region; a block is split into one sub-row per plan (FREE / PAID).
  const ws = wb.addWorksheet('Implementation plan', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  ws.columns = [
    // column order changed by the user on 2026-09-04: Verdict (EN) + Verdict (JA, simplified, for the data engineer) follow Main area
    { header: 'Provider (region)', key: 'provider', width: 38 }, { header: 'Main area offered', key: 'main_area', width: 32 },
    { header: 'Verdict — why (not) this option', key: 'verdict', width: 55 }, { header: '判定（日本語・要点）', key: 'verdict_ja', width: 55 },
    { header: 'Price — free vs paid, and what we get', key: 'price', width: 85 }, { header: 'API available?', key: 'api', width: 18 },
    { header: 'Status / decision', key: 'note', width: 30 },
  ];
  const freeFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F0D9' } };
  const paidFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  const thin = { style: 'thin', color: { argb: 'FF808080' } };
  plan.forEach(p => {
    const tiers = (p.tiers && p.tiers.length) ? p.tiers : [{ label: '', price: '', what_we_get: '', api: '' }];
    const first = ws.rowCount + 1;
    tiers.forEach((t, i) => {
      const r = ws.addRow({
        provider: i === 0 ? { richText: [{ text: p.region + '\n', font: { bold: true, size: 12, color: { argb: NAVY } } }, { text: p.provider, font: { bold: true } }] } : '',
        main_area: i === 0 ? p.main_area : '',
        price: t.label ? { richText: [{ text: t.label + '\n', font: { bold: true } }, { text: S(t.price) + (t.what_we_get ? '\n\nWhat we get: ' + S(t.what_we_get) : '') }] } : '',
        api: t.api, note: i === 0 ? p.note : '', verdict: t.verdict || '', verdict_ja: t.verdict_ja || '',
      });
      if (/^free/i.test(t.label)) r.getCell('price').fill = freeFill; else if (/^paid/i.test(t.label)) r.getCell('price').fill = paidFill;
      const vd = t.verdict || '';
      for (const k of ['verdict', 'verdict_ja']) {
        if (/^(NOT |NO DEAL|DEEPEST)/.test(vd)) r.getCell(k).font = { color: { argb: 'FFC00000' } };
        else if (/^(GOOD FIT|GOOD OPTION)/.test(vd)) { r.getCell(k).font = { bold: true, color: { argb: 'FF375623' } }; r.getCell(k).fill = freeFill; }
        else if (/^(ACCEPTABLE|GOOD DATA|GOOD BUT|WEAK|PARTIAL)/.test(vd)) { r.getCell(k).font = { color: { argb: 'FF7F6000' } }; r.getCell(k).fill = paidFill; }
        else if (/^UNKNOWN/.test(vd)) r.getCell(k).font = { color: { argb: 'FF595959' }, italic: true };
      }
    });
    const last = ws.rowCount;
    if (last > first) { ws.mergeCells(first, 1, last, 1); ws.mergeCells(first, 2, last, 2); ws.mergeCells(first, 7, last, 7); }
    for (let c = 1; c <= 7; c++) { ws.getCell(last, c).border = { bottom: { style: 'medium', color: { argb: NAVY } } }; }
  });
  hdrStyle(ws); wrapRows(ws);
  ws.eachRow((r, i) => { if (i > 1) r.eachCell(c => { c.border = { ...(c.border || {}), left: thin, right: thin, top: thin, bottom: c.border && c.border.bottom ? c.border.bottom : thin }; }); });
}

// ---------- Scraping terms check (2026-09-04): web-only sources re-rated on whether their terms prohibit automated collection
const tosDir = path.join(here, 'deep', 'scraping_tos');
if (fs.existsSync(tosDir)) {
  const rows = [];
  fs.readdirSync(tosDir).filter(f => f.endsWith('.json')).sort().forEach(f => {
    const j = rd(path.join(tosDir, f));
    const push = (r, type) => rows.push({
      type, site: r.site || r.name || '', region: r.region || r.market || '', stance: r.stance || r.scraping_stance || '',
      clause: S(r.clause_verbatim), gloss: S(r.clause_english_gloss), commercial: S(r.commercial_use_or_redistribution) + (r.export_rights ? '\n\nExport rights: ' + S(r.export_rights) : ''),
      notes: type === 'New candidate'
        ? ['Deal content: ' + S(r.deal_content), 'History: ' + S(r.history_depth), 'Price: ' + S(r.price), 'API: ' + S(r.api), 'Adds: ' + S(r.why_it_adds_value)].join('\n')
        : S(r.practical_notes) + (r.price_seen ? '\n\nPrice seen: ' + S(r.price_seen) : ''),
      robots: r.robots_txt ? S(r.robots_txt.summary) : '', confidence: r.confidence || '',
      urls: (r.terms_urls_checked || r.sources || []).join('\n'), url: r.url || r.homepage || '', checked: r.checked || '2026-09-04',
    });
    if (Array.isArray(j)) j.forEach(r => push(r, 'Existing source'));
    else { (j.terms_check || []).forEach(r => push(r, 'Existing source')); (j.new_candidates || []).forEach(r => push(r, 'New candidate')); }
  });
  const ws = wb.addWorksheet('Scraping terms check', { views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }] });
  ws.columns = [
    { header: '#', key: 'idx', width: 5 }, { header: 'Type', key: 'type', width: 15 }, { header: 'Site / source', key: 'site', width: 34 }, { header: 'Region', key: 'region', width: 14 },
    { header: 'Stance on automated access (terms)', key: 'stance', width: 16 }, { header: 'Clause (verbatim, original language)', key: 'clause', width: 70 }, { header: 'English gloss', key: 'gloss', width: 45 },
    { header: 'Commercial use / redistribution / export', key: 'commercial', width: 55 }, { header: 'Practical notes (or, for new candidates: content, history, price, API)', key: 'notes', width: 60 },
    { header: 'robots.txt (technical signal only)', key: 'robots', width: 35 }, { header: 'Confidence', key: 'confidence', width: 11 }, { header: 'Terms / source URLs', key: 'urls', width: 50 }, { header: 'Homepage', key: 'url', width: 30 }, { header: 'Checked', key: 'checked', width: 11 },
  ];
  const stanceFill = { PROHIBITS: 'FFF8CBAD', CONDITIONAL: 'FFFFF2CC', SILENT: 'FFDDEBF7', ALLOWS: 'FFE2F0D9', UNVERIFIED: 'FFEDEDED' };
  rows.forEach((r, i) => { const row = ws.addRow({ idx: i + 1, ...r }); const c = row.getCell('stance'); c.font = { bold: true }; if (stanceFill[r.stance]) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stanceFill[r.stance] } }; if (r.type === 'New candidate') row.getCell('type').font = { bold: true, color: { argb: NAVY } }; });
  hdrStyle(ws); wrapRows(ws);
}

// ---------- Core sources deep dive (EDINET / EDGAR / Tracxn + complements)
const deepFiles = [['deep/edinet_japan.json', 'Japan'], ['deep/edgar_usa.json', 'USA'], ['deep/tracxn.json', 'USA + Asia (paid)']];
const deepRows = [];
for (const [f, tag] of deepFiles) { const p = path.join(here, f); if (!exists(p)) { console.error('MISSING', f); continue; } for (const r of rd(p)) deepRows.push({ tag, ...r }); }
if (deepRows.length) {
  const ws = wb.addWorksheet('Core sources deep dive', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  const cols = [
    ['Block', 'tag', 14], ['Source', 'name', 28], ['Operator', 'operator', 22], ['Website', 'website', 34], ['Docs URL', 'docs_url', 40],
    ['Main region / focus', 'region_main', 30], ['Surroundings: coverage breakdown (how much is Asia, entity counts)', 'region_surroundings', 70],
    ['Plans: free vs paid (what you get)', 'plans', 80], ['API access (free / paid, auth, endpoints, limits)', 'api_access', 70],
    ['Archive window (from - to, per document type)', 'archive_window', 70], ['Data types', 'data_types', 70], ['Formats', 'formats', 30],
    ['Update frequency', 'update_frequency', 22], ['M&A relevance (who bought whom, when, how much)', 'ma_relevance', 70], ['Limitations', 'limitations', 70],
    ['Implementation notes', 'implementation_notes', 80], ['Company background', 'company_background', 50], ['Confidence', 'confidence', 12], ['Sources consulted', 'sources', 60],
  ];
  ws.columns = cols.map(([h, k, w]) => ({ header: h, key: k, width: w }));
  deepRows.forEach(r => {
    const o = {};
    for (const [, k] of cols) {
      if (k === 'plans' && Array.isArray(r.plans)) o[k] = r.plans.map(p => '• ' + S(p.plan) + ' — ' + S(p.price) + '\n   ' + S(p.what_you_get)).join('\n\n');
      else o[k] = S(r[k]);
    }
    const row = ws.addRow(o);
    const site = String(r.website || '').trim().split(/\s/)[0];
    if (/^https?:\/\//i.test(site)) row.getCell('website').value = { text: S(r.website), hyperlink: site };
    row.getCell('name').font = { bold: true };
  });
  hdrStyle(ws); wrapRows(ws);
  ws.autoFilter = { from: 'A1', to: { row: 1, column: cols.length } };
}

// ---------- Asia free bonus
const asiaP = path.join(here, 'deep/asia_free.json');
if (exists(asiaP)) {
  const asia = rd(asiaP);
  const ws = wb.addWorksheet('Asia free bonus', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  const cols = [
    ['Country', 'country', 12], ['Source', 'name', 30], ['Operator', 'operator', 24], ['Website', 'website', 34], ['Docs URL', 'docs_url', 36],
    ['Main region / focus', 'region_main', 26], ['Surroundings / scope', 'region_surroundings', 50],
    ['Plans: free vs paid', 'plans', 60], ['API access (official / unofficial, auth, limits)', 'api_access', 60],
    ['Archive window', 'archive_window', 45], ['Data types', 'data_types', 60], ['Formats', 'formats', 24], ['Update frequency', 'update_frequency', 18],
    ['M&A relevance', 'ma_relevance', 55], ['Limitations', 'limitations', 55], ['Implementation notes (effort)', 'implementation_notes', 60], ['Confidence', 'confidence', 12], ['Sources consulted', 'sources', 55],
  ];
  ws.columns = cols.map(([h, k, w]) => ({ header: h, key: k, width: w }));
  const order = ['Korea', 'South Korea', 'Taiwan', 'China', 'Hong Kong', 'Singapore', 'India', 'Indonesia', 'Thailand', 'Malaysia', 'Vietnam'];
  const rank = c => { const i = order.findIndex(o => String(c || '').toLowerCase().includes(o.toLowerCase())); return i < 0 ? 99 : i; };
  asia.sort((a, b) => rank(a.country) - rank(b.country) || String(a.name).localeCompare(String(b.name)));
  asia.forEach(r => {
    const o = {};
    for (const [, k] of cols) {
      if (k === 'plans' && Array.isArray(r.plans)) o[k] = r.plans.map(p => '• ' + S(p.plan) + ' — ' + S(p.price) + '\n   ' + S(p.what_you_get)).join('\n\n');
      else o[k] = S(r[k]);
    }
    const row = ws.addRow(o);
    const site = String(r.website || '').trim().split(/\s/)[0];
    if (/^https?:\/\//i.test(site)) row.getCell('website').value = { text: S(r.website), hyperlink: site };
    row.getCell('name').font = { bold: true };
  });
  hdrStyle(ws); wrapRows(ws);
  ws.autoFilter = { from: 'A1', to: { row: 1, column: cols.length } };
}

// ---------- Top picks (v1)
const picks = rd(path.join(here, 'picks.json'));
{
  const tp = wb.addWorksheet('Top picks', { views: [{ state: 'frozen', ySplit: 1 }] });
  tp.columns = [
    { header: 'Rank', key: 'rank', width: 12 }, { header: 'Provider', key: 'name', width: 34 }, { header: 'Role in data stack', key: 'role', width: 30 },
    { header: 'Why', key: 'why', width: 75 }, { header: 'Indicative annual cost', key: 'cost', width: 32 }, { header: 'Key risk', key: 'risk', width: 55 }, { header: 'Next action', key: 'action', width: 45 },
  ];
  picks.forEach(p => { const r = tp.addRow(p); if (/avoid/i.test(p.rank)) r.getCell('rank').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } }; if (/reference/i.test(p.rank)) r.getCell('rank').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } }; });
  hdrStyle(tp); wrapRows(tp);
}

// ---------- Providers + Summary (v1 logic)
const groups = [['group_a_global.json', 'A: Global commercial DB'], ['group_b_asia.json', 'B: Asia-regional DB'], ['group_c_open.json', 'C: Free / open source'], ['group_d_sourcing.json', 'D: Deal-sourcing / signals'], ['group_e_europe.json', 'E: Europe official / regional']];
let raw = [];
for (const [f, g] of groups) { const p = path.join(here, f); if (!exists(p)) { console.error('MISSING', f); continue; } for (const r of rd(p)) raw.push({ group: g, ...r }); }
const norm = r => ({ group: r.group, name: r.name || '', website: r.website || r.website_url || r.url || '', hq: r.hq_country || r.hq || r.hq_country_operator || '', data_types: r.data_types || '', coverage_geo: r.coverage_geo || '', history_depth: r.history_depth || '', api: r.api || '', bulk_delivery: r.bulk_delivery || '', pricing: r.pricing || '', ml_training_license: r.ml_training_license || '', language: r.language || '', update_frequency: r.update_frequency || '', fit_for_lead_prediction: r.fit_for_lead_prediction || '', budget_tier: r.budget_tier || '', confidence: r.confidence || '', sources: Array.isArray(r.sources) ? r.sources : (r.sources ? [String(r.sources)] : []) });
raw = raw.map(norm);
const aliases = [[/^crunchbase/i, 'crunchbase'], [/^dealroom/i, 'dealroom'], [/^preqin/i, 'preqin'], [/aylien/i, 'aylien'], [/event registry/i, 'eventregistry'], [/coresignal/i, 'coresignal'], [/people data labs/i, 'pdl'], [/^speeda/i, 'speeda'], [/teikoku/i, 'tdb'], [/tokyo shoko/i, 'tsr'], [/nikkei value/i, 'nikkei'], [/gbizinfo/i, 'gbizinfo'], [/^edinet/i, 'edinet']];
const keyOf = n => { for (const [re, k] of aliases) if (re.test(n)) return k; return n.toLowerCase(); };
const textLen = r => Object.values(r).filter(v => typeof v === 'string').join('').length;
const mergeFields = ['coverage_geo', 'history_depth', 'api', 'bulk_delivery', 'pricing', 'ml_training_license', 'fit_for_lead_prediction', 'data_types'];
const byKey = new Map();
for (const r of raw) {
  const k = keyOf(r.name);
  if (!byKey.has(k)) { byKey.set(k, r); continue; }
  let a = byKey.get(k), b = r; if (textLen(b) > textLen(a)) [a, b] = [b, a];
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
{
  const cols = [['#', 'idx', 5], ['Provider', 'name', 28], ['Group', 'group', 20], ['Website', 'website', 36], ['HQ / operator', 'hq', 14], ['Tier (normalized)', 'tier', 12], ['Budget tier (detail)', 'budget_tier', 40], ['Pricing (public where available)', 'pricing', 60], ['Data types', 'data_types', 60], ['Geographic coverage (Asia / Japan detail)', 'coverage_geo', 55], ['Historical depth', 'history_depth', 40], ['API', 'api', 50], ['Bulk delivery', 'bulk_delivery', 35], ['ML / AI training licence', 'ml_training_license', 50], ['Language', 'language', 16], ['Update frequency', 'update_frequency', 18], ['Fit for M&A lead-prediction model', 'fit_for_lead_prediction', 60], ['Confidence', 'confidence', 11], ['Sources consulted', 'sources', 60]];
  const ws = wb.addWorksheet('Providers', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  ws.columns = cols.map(([h, k, w]) => ({ header: h, key: k, width: w }));
  rows.forEach((r, i) => {
    const o = { idx: i + 1 }; for (const [, k] of cols) if (k !== 'idx') o[k] = S(r[k]);
    const row = ws.addRow(o);
    const site = String(r.website || '').trim().split(/\s/)[0];
    if (/^https?:\/\//i.test(site)) row.getCell('website').value = { text: r.website, hyperlink: site };
    row.getCell('tier').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tierFill[r.tier] } }; row.getCell('tier').font = { bold: true };
  });
  hdrStyle(ws); wrapRows(ws); ws.autoFilter = { from: 'A1', to: { row: 1, column: cols.length } };
  const sm = wb.addWorksheet('Summary by tier', { views: [{ state: 'frozen', ySplit: 1 }] });
  sm.columns = [{ header: 'Tier', key: 't', width: 12 }, { header: 'Provider', key: 'n', width: 34 }, { header: 'Group', key: 'g', width: 22 }, { header: 'API', key: 'a', width: 10 }, { header: 'Bulk', key: 'b', width: 10 }, { header: 'History (first 200 chars)', key: 'h', width: 50 }, { header: 'Coverage note (first 300 chars)', key: 'c', width: 70 }];
  const yn = s => { s = (s || '').trim().toLowerCase(); return s.startsWith('yes') ? 'Yes' : s.startsWith('no') ? 'No' : s.startsWith('partial') ? 'Partial' : s.startsWith('unknown') ? 'Unknown' : '?'; };
  rows.forEach(r => { const row = sm.addRow({ t: r.tier, n: r.name, g: r.group, a: yn(r.api), b: yn(r.bulk_delivery), h: r.history_depth.replace(/\s+/g, ' ').slice(0, 200), c: r.coverage_geo.replace(/\s+/g, ' ').slice(0, 300) }); row.getCell('t').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tierFill[r.tier] } }; });
  hdrStyle(sm); wrapRows(sm); sm.autoFilter = { from: 'A1', to: { row: 1, column: 7 } };
}

wb.xlsx.writeFile(out).then(() => console.log('WROTE', out, '| sheets:', wb.worksheets.map(w => w.name + '(' + (w.rowCount - 1) + ')').join(', ')));
