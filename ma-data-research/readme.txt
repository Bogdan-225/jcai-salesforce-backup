M&A DATA PROVIDER RESEARCH - Japan Corporate Advisory Institute (JCAI), internal use
Prepared 2026-09-03 by desk research (web search + vendor pages). Purpose: identify data sources to train an AI model that surfaces potential M&A targets/mergers.

SCOPE AND ASSUMPTIONS
- Budget focus: low (<USD 10k/yr) and mid (USD 10k-50k/yr). Enterprise-only vendors are listed briefly as reference rows.
- Geography: global with Asia focus (Japan, China/HK, Korea, Taiwan, India, SEA).
- Deal segment: both SME/mid-market private deals and large-cap/listed deals.
- Delivery: REST API preferred; bulk files (CSV/SFTP/Snowflake/S3/Parquet) also acceptable.
- Language: English preferred; Japanese/Chinese/Korean sources included where they matter for Asia.

SHEETS (v3, updated 2026-09-04)
- Why this plan: the argument for the proposed stack (free official filings + one paid licence). Start here for the decision.
- Implementation plan (v3, 2026-09-04): options table - one block per region (Japan EDINET, USA EDGAR, Europe, then Asia markets, then Tracxn as the optional paid private-deal layer). Each block is split into FREE and PAID sub-rows showing price, what we get, and whether an API exists. Green = free, yellow = paid. Timing/phasing removed by decision; the old phased plan is archived in ma-data-research/archive/plan_v1_timing.json.
- Core sources deep dive: EDINET (Japan), SEC EDGAR (USA), Tracxn (USA + Asia, paid) and their complements - coverage breakdown, free vs paid plans, API, archive window, data types, limitations.
- Asia free bonus: free official disclosure and registry sources for Korea, Taiwan, China, Hong Kong, Singapore, India and others.
- Top picks: curated shortlist with role in a data stack, indicative cost, key risk and next action. Start here.
- Verification note: on 2026-09-04 open points for Asia sources (official feeds, prices, unofficial endpoints) were re-checked; findings in ma-data-research/deep/asia_verification_2026-09-04.json and reflected in the Verdict column of the Implementation plan. Verdict rules agreed with the user: working undocumented endpoints are acceptable with a caveat; price ceiling USD 10k/yr; quote-only paid rows stay UNKNOWN.
- Scraping terms check (added 2026-09-04): rule change - a source that offers only a web portal (no API, no bulk download) is now ACCEPTABLE when its published terms do not prohibit automated collection (scraping), because for some countries no API exists or the API is too expensive. The Terms of Use / disclaimer / copyright notice and robots.txt of about 35 sites were read and the relevant clause quoted verbatim (stance: PROHIBITS / CONDITIONAL / SILENT / ALLOWS / UNVERIFIED). Results: India (CCI, SEBI), Thailand (SET) and Vietnam (HNX, SSC) free rows re-rated to ACCEPTABLE WITH CAVEAT; Singapore free row DOWNGRADED because SGX terms bar access "through any means not intentionally made available"; HKEXnews, NSE India, TWSE/MOPS, Tracxn and MARR stay red because their terms prohibit scraping explicitly. Two web-portal options added: SFC Takeovers Executive decisions (Hong Kong, free, download for use within a firm expressly permitted) and Venture Intelligence (India, paid, no scraping clause, Excel export). Raw JSON in ma-data-research/deep/scraping_tos/. robots.txt is recorded as a technical signal only; the terms govern. Legal characterisation of CONDITIONAL and SILENT cases should be confirmed by qualified counsel in each jurisdiction - silence is not permission.
- Providers: full comparison, 85+ sources incl. group E (Europe options added 2026-09-04), one row per provider (duplicates found by more than one researcher were merged; second-researcher notes are appended and marked). Filter on 'Tier (normalized)'.
- Summary by tier: compact view (API / bulk / history / Asia coverage).

HOW TO READ
- Tier (normalized): free / low / mid / enterprise / unknown, derived from the first tier named in the detailed budget column. Colour: green=free, blue=low, yellow=mid, red=enterprise, grey=unknown.
- Prices: only vendor-published prices are stated as fact. Figures from third-party review sites (Vendr, G2, Capterra, comparison blogs, app stores) are labelled as such. 'Quote only' means no public price exists. Text marked INFERRED is the researcher's estimate, not a confirmed fact.
- Historical depth: vendor-stated where available; otherwise inferred from the vendor's founding date and flagged.
- ML / AI training licence: almost no vendor publishes an explicit position. Where terms were found they mostly PROHIBIT model training on standard seat subscriptions (Crunchbase, CB Insights, AlphaSense/Tegus). Treat every commercial source as requiring a negotiated data-licence clause that names internal model training. Final licence review should be done by qualified legal counsel.

KEY FINDINGS
1. No free, deal-level M&A dataset exists at scale. Free official disclosure APIs (SEC EDGAR, EDINET, OpenDART, TWSE) are the only zero-cost, high-quality deal labels, but require parsing filings.
2. EDINET keeps annual reports 10 years but extraordinary reports (the M&A disclosure form), tender-offer filings and 5% reports only 5 years (verified against FIEA Art. 25 on 2026-09-03; an earlier draft wrongly said 1 year). No vendor sells a longer Japanese filing archive: begin daily archiving now.
3. The main Japanese deal database (Recof M&A Database, 1985+) was discontinued in spring 2026 and replaced by MARR Pro (Excel export, no API). Its data also flows into SPEEDA RECOF.
4. Licensing, not price, is the binding constraint on the cheapest commercial options (Crunchbase, Dealroom, CB Insights).
5. In-budget commercial candidates with API or bulk delivery: Mergr, Tracxn, Coresignal, Diffbot, TDnet (JPX), Tokyo Shoko Research bulk, ITjuzi, Event Registry. SPEEDA and MARR Pro need quotes.
6. J-Quants retail API cannot be used by a company (individual-use terms). J-Quants Pro publishes per-dataset corporate pricing instead.
7. Western deal-sourcing platforms (Grata, Sourcescrub) have no Japan/Asia coverage.

SUGGESTED LOW/MID STACK (indicative, before quotes)
- Labels: SEC EDGAR + EDINET + OpenDART (free) + Mergr Data Direct or Tracxn acquisitions pack (quote) + TDnet archive for Japan listed events.
- Company features: Coresignal or Diffbot (global), Tokyo Shoko Research bulk (Japan SMEs), gBizINFO + NTA corporate-number API (free Japan universe), OpenCorporates/GLEIF for entity resolution.
- Signals: Event Registry news events.

DECISIONS RECORDED 2026-09-03
- Japan: EDINET (free), possibly a paid complement later (TDnet / EDINET DB) after a month-3 gap review.
- USA: SEC EDGAR (free).
- USA + Asia private deals and company profiles: Tracxn, pending a recall test and quote.
- ML-training licence terms are no longer a selection criterion for now (decision by the user); the column is kept for reference.

CONFIDENTIALITY: internal research; contains no client or deal-specific information.
