// One-off: 2026-09-04 re-rating of web-only sources after the scraping terms check
// (deep/scraping_tos/*.json). Rule agreed with the user: a web-portal-only source is
// acceptable when its terms do not prohibit automated collection; sources whose terms
// prohibit scraping stay red. Run from ma-data-research/: node archive/apply_scraping_verdicts_2026-09-04.js
const fs = require('fs'); const path = require('path');
const here = path.resolve(__dirname, '..');
const file = path.join(here, 'plan.json');
const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
const find = (regionPrefix) => { const p = plan.find(x => x.region.startsWith(regionPrefix)); if (!p) throw new Error('region not found: ' + regionPrefix); return p; };
const tier = (p, labelPrefix) => { const t = p.tiers.find(t => t.label.startsWith(labelPrefix)); if (!t) throw new Error('tier not found: ' + p.region + ' / ' + labelPrefix); return t; };
const TC = ' [Terms check 2026-09-04: deep/scraping_tos]';

// ---------- JAPAN
{ const p = find('JAPAN');
  const f = tier(p, 'FREE');
  f.verdict += ' Terms: EDINET content is reusable under the Public Data License 1.0 (commercial use allowed, attribution required); the terms ban scraping the web UI, so collection must go through the API, which is what we do.' + TC;
  p.note += ' MARR Pro / MARR Online (Recof Data) checked 2026-09-04: terms prohibit automated access (bots, crawlers, scrapers) and, on the standard licence, loading data into another system, database or AI (Art. 15); Excel export is capped per contract. Usable only under a separate data-licence agreement (Art. 15(5)), quote only. Not added to the plan.';
}

// ---------- EUROPE
{ const p = find('EUROPE');
  const o1 = tier(p, 'FREE — Option 1');
  o1.verdict = 'NOT SUITABLE as main source, but LEGALLY CLEAN: only concentrations above EU Merger Regulation turnover thresholds, i.e. a few hundred large cases a year, no mid-market, no official case API. Reuse of the register is expressly permitted under CC BY 4.0 (Commission Decision 2011/833/EU), so harvesting it is allowed. Keep as free ground truth to test a vendor\'s European recall.' + TC;
  const o2 = tier(p, 'FREE — Option 2');
  o2.verdict = 'NOT SUITABLE - scraping does not rescue it: about 30 separate national systems, and the terms check shows most of the web-only ones forbid harvesting. UK FCA NSM bans any "scraper, robot, bot, spider, data mining" without written consent; LSE RNS bans "any programmatic, scripted or other mechanical means"; Italy (1Info, eMarket STORAGE) allows personal non-commercial use only and bars reproduction; Switzerland SIX requires written consent for any commercial use; Norway NewsWeb/Euronext bans spiders and "systematic retrieval to create databases"; Germany (Unternehmensregister, Bundesanzeiger) is protected by the database right (s. 87a UrhG) and needs publisher consent. Only France (free API), Netherlands (CSV/XML export) and Spain CNMV (free use, faithful reproduction permitted) are usable, and they cover three markets with listed-company disclosure only.' + TC;
}

// ---------- INDIA
{ const p = find('INDIA');
  const f = tier(p, 'FREE');
  f.verdict = 'ACCEPTABLE WITH CAVEAT (re-rated 2026-09-04, scraping route): no official free API, but two of the four sources may be harvested. CCI Combination register and SEBI SAST filings: terms, disclaimer and copyright policy read in full, nothing on automated access; the standard Indian government copyright policy asks for permission by e-mail plus source acknowledgement when content is reproduced or published, internal analysis is not addressed. BSE: no scraping clause, but the Disclaimer bans "reproduction, redistribution or transmission, for consideration or otherwise" without BSE\'s express written consent, so ask BSE before storing announcements. NSE: Terms of Use expressly prohibit "systematic or automated data collection activities (including scraping, data mining, data extraction and data harvesting)" - off limits; use the paid NSE feed instead. Practical: BSE/NSE return HTTP 403 to servers (browser emulation needed); CCI/SEBI are plain government sites. CCI orders remain the cleanest free M&A list.' + TC;
  const paid = tier(p, 'PAID');
  paid.label = 'PAID (optional) - Option A: NSE official data feed';
  p.tiers.push({
    label: 'PAID (optional) - Option B: Venture Intelligence (web database + Excel export, no API)',
    price: 'Quote only for the full database; indicative app pricing is in the low tier (under USD 10k/yr). Small Chennai-based vendor (TSJ Media), direct request for a data licence is realistic.',
    what_we_get: 'India-specific deal database: 15,000+ M&A deals and 25,000+ PE/VC deals from 1999, joined to financials on about 800,000 companies, English. Includes private-to-private deals that never reach BSE/NSE announcements.',
    api: 'NO API. Web database plus spreadsheet export (download is contemplated in the contract\'s refund clause).',
    verdict: 'ACCEPTABLE WITH CAVEAT (added 2026-09-04 under the web-portal rule): terms read in full contain no clause on scraping, crawling or automated access, and spreadsheet download is part of the product. Licence is "internal and non-commercial use"; sharing within the subscribing entity is expressly allowed without permission, but "AI tools" are listed among the prohibited recipients, so loading exports into the prediction model needs a written carve-out from the vendor. Complements Option A (listed announcements) with private deals and 25 years of history. Price to confirm.' + TC,
  });
  p.note = 'Asia focus market. Free route: harvest CCI + SEBI (terms silent), ask BSE for consent, do not scrape NSE (terms prohibit it). Paid: NSE feed (Option A) is the supported route for listed announcements; Venture Intelligence (Option B) adds private deals and history.';
}

// ---------- HONG KONG
{ const p = find('HONG KONG');
  const f = tier(p, 'FREE');
  f.verdict = 'NOT SUITABLE - terms prohibit scraping: the HKEX Terms of Use (which also govern HKEXnews) state users are "not permitted to conduct ... any text or data mining or web scraping", ban "programmatic, scripted or other mechanical means to access" and "systematic retrieval to create ... databases", and license downloads only for personal use on a non-networked disk, "whether or not for gain". No API, no RSS. Deal data is rich (notifiable/connected transactions, takeovers) but the only compliant routes are written permission from HKEX or the paid IIS feed below.' + TC;
  p.tiers.splice(1, 0, {
    label: 'FREE - Option B (added 2026-09-04): SFC Takeovers - Executive decisions and statements + Takeovers Bulletin',
    price: 'HKD 0. Public web pages on sfc.hk, no registration (CONFIRMED). Chronological list with linked PDFs from 7 April 2000 to today (about 26 years).',
    what_we_get: 'Curated, M&A-specific regulatory record: Takeovers Executive rulings and statements on general and partial offers, whitewash waivers, concert-party and chain-principle findings, cold-shoulder orders and censures under the Codes on Takeovers and Mergers and Share Buy-backs. English and Chinese.',
    api: 'NO - browsable web list, no API, no RSS found.',
    verdict: 'ACCEPTABLE, NARROW COMPLEMENT: the SFC disclaimer expressly permits materials to be "downloaded or printed for personal use or for use within an individual firm or organisation", and nothing bans automated access; reproduction for third parties or commercial purposes needs SFC consent (internal model input sits in that grey zone - counsel to confirm). Coverage is only public takeovers that reached the Executive, not the full stream of HKEX notifiable transactions, so it is a free, permissive, 26-year label set for HK takeovers rather than a replacement for HKEXnews.' + TC,
  });
  p.note = 'Important because HK is the offshore venue for mainland-China listed M&A. HKEXnews scraping is prohibited by its terms (checked 2026-09-04); SFC takeover decisions added as a permissive free complement; full announcement coverage only via HKEX consent or the paid IIS feed (above ceiling).';
}

// ---------- TAIWAN
{ const p = find('TAIWAN');
  const f = tier(p, 'FREE');
  f.verdict = 'GOOD FIT WITH ONE CAVEAT: official REST API, no key, structured daily material-information records (subject, applicable clause, event date) that include mergers, acquisitions and equity transfers, free, and the OpenAPI data is released under Taiwan\'s Open Government Data licence. Caveat: the endpoint is a same-day snapshot only (CONFIRMED 2026-09-04, 102 rows all dated today, no date parameter) and the historical archive lives on MOPS web forms, which cannot be scraped: MOPS has no terms of its own and falls under the TWSE Terms of Use, which prohibit downloading data "by means including but not limited to automated devices, scripts, automated programs, spiders, crawlers or extraction programs" unless TWSE consents. Start the daily archiver immediately; request written TWSE consent if the back-file is needed.' + TC;
}

// ---------- CHINA
{ const p = find('CHINA');
  const f = tier(p, 'FREE');
  f.verdict += ' Terms check: CNINFO\'s only public legal text is an accuracy/liability disclaimer plus a copyright footer; nothing on crawlers, automated access, reprinting or commercial use, so the undocumented endpoint passes the "not prohibited" rule (silence is not permission - the operator also sells a paid data platform).' + TC;
}

// ---------- SINGAPORE
{ const p = find('SINGAPORE');
  const f = tier(p, 'FREE');
  f.verdict = 'NOT SUITABLE WITHOUT SGX CONSENT (downgraded 2026-09-04 after the terms check; was ACCEPTABLE WITH CAVEAT): the api.sgx.com announcements endpoint works and is used by open-source tools, but the SGX Terms of Use say "You may not obtain, or attempt to obtain, any Materials or other information through any means not intentionally made available on or through our Website", which describes an undocumented backend endpoint exactly, and limit use to "your own personal and non-commercial use". The words scrape/crawl never appear and robots.txt is open, so a robots-only check would wrongly pass it. Routes: ask SGX for written consent, or price the official SGXNews feed (quote-only). ACRA dataset (data.gov.sg) is unaffected: open licence, entity data only.' + TC;
  p.note = 'English-language; good entity master for the SEA hub (ACRA). SGX announcement endpoint blocked by SGX terms (2026-09-04): needs consent or the paid SGXNews feed.';
}

// ---------- INDONESIA
{ const p = find('INDONESIA');
  const f = tier(p, 'FREE');
  f.verdict += ' LEGAL RISK (terms check 2026-09-04): the IDX Terms of Use are reported by search-engine indexes to prohibit web scraping and crawling expressly and to allow quotation only for non-commercial purposes with source and access date cited; the page itself is behind Cloudflare and could not be read first-hand. Confirm the wording in a browser; if confirmed, this row turns red like SGX.' + TC;
}

// ---------- THAILAND
{ const p = find('THAILAND');
  const f = tier(p, 'FREE');
  f.verdict = 'ACCEPTABLE WITH CAVEAT (re-rated 2026-09-04, scraping route; was NOT SUITABLE): the SET Terms and Conditions contain no clause on scraping, crawling, robots or automated access, and downloading content "for your own personal and non-commercial use" is expressly permitted, so harvesting the News & Disclosure Center (web-only, filter by source/date, up to 5 years) is not prohibited by method. Caveat: permitted use is personal and non-commercial, and copying or transferring content "to any third person" needs SET\'s prior written permission - the same pattern as Bursa Malaysia; an internal analytical copy is arguably outside the ban, but request SET\'s written permission or a counsel opinion before production. Settrade.com (SET group mirror) inherits the same terms; Kaohoon International (free English news) has no readable terms (UNVERIFIED).' + TC;
}

// ---------- MALAYSIA
{ const p = find('MALAYSIA');
  const f = tier(p, 'FREE');
  f.verdict += ' Terms check: Bursa\'s terms have no scraping or automation clause; they permit viewing and one printed copy for personal, non-commercial use and prohibit copying, storing in an electronic retrieval system or downloading content "to any third person" without written consent - an internal copy is arguably outside the wording, Malaysian counsel to confirm.' + TC;
}

// ---------- VIETNAM
{ const p = find('VIETNAM');
  const f = tier(p, 'FREE');
  f.verdict = 'ACCEPTABLE WITH CAVEAT (re-rated 2026-09-04, scraping route; was NOT SUITABLE): HNX and the SSC publish no terms of use at all (footer copyright and publishing-licence lines only, no robots.txt), so nothing prohibits automated collection of their disclosure pages; HOSE\'s terms could not be read (JavaScript site, footer never renders, robots.txt fully permissive) - verify in a browser before harvesting. Silence is not permission: Vietnamese copyright still protects the compilations and HNX sells an information-services feed. The real limit is quality: web pages in Vietnamese, HOSE RSS carries only about 10 items, no deal database. Free aggregators worth an in-browser terms check: VietstockFinance (one search across HOSE, HNX and UPCoM disclosures) and CafeF (business archive back to 2007, reports private and foreign-buyer deals).' + TC;
  p.note = 'Lowest confidence of the Asian markets. Scraping not prohibited by HNX/SSC (no terms exist); HOSE terms unread. Needs a browser-based re-check of HOSE and of the two aggregators.';
}

// ---------- TRACXN
{ const p = find('USA + ASIA');
  const f = tier(p, 'FREE');
  f.verdict += ' Terms check: Tracxn\'s Terms of Use ban "web crawlers, robots, spiders, or any automated methods to ... scrape, extract, index, download large amounts of data" unless permitted through its APIs, and the pricing page labels Lite "For personal use" - so the web-portal route is closed; only the paid API/bulk pack counts.' + TC;
}

fs.writeFileSync(file, JSON.stringify(plan, null, 2), 'utf8');
console.log('plan.json updated. Rows:', plan.length, 'Sub-rows:', plan.reduce((n, p) => n + p.tiers.length, 0));
for (const p of plan) for (const t of p.tiers) console.log(p.region.padEnd(22).slice(0, 22), '|', t.label.slice(0, 55).padEnd(55), '|', (t.verdict || '').slice(0, 48));
