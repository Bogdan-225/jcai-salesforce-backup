# Memo: JCAI_Salesforce_Field_Help_Text.xlsx — How It Was Built (2026-08-26)

Internal-only. Describes how the field help-text workbook was cleaned and populated, and how to continue the work.

## What the workbook is
`JCAI_Salesforce_Field_Help_Text.xlsx` — 7 sheets, one row per field:
- **Column 1** = field label (English)
- **Column 2** = help text / tooltip for data-entry users (English)

| Sheet | Salesforce object (API name) | Rows |
|---|---|---|
| Accounts | `Account` | 227 |
| Contacts | `Contact` | 45 |
| Opportunities | `Opportunity` | 133 |
| Matches | `Matching__c` | 83 |
| M&A Needs | `Buy_Needs__c` | 36 |
| Establishments | `Establishments__c` | 78 |
| Contracts | `Contract` + `ContractFile__c` | 16 |

## Process used (2026-08-26)
1. **Read the workbook** with Node + `exceljs` (no Python on this machine). Working copies live in the session scratchpad under `xlsx/` (`backup_original.xlsx`, `dump.json`, `worklist.json`, `edits.js`, `updated.xlsx`).
2. **Pulled live org schema** via the connected Salesforce MCP (`getObjectSchema` for the 8 objects above). Large results land as files under the session's `tool-results/` folder.
3. **Joined** each row's Column-1 label to the org's field metadata (normalized label/API-name match). Match rate: 577/618. Join output: `worklist.json` (label, current help, API name, type, org `inlineHelpText`, picklist values, references).
4. **Authored Column 2** per row in `edits.js` (map of sheet → row → text; unlisted rows blanked). Priority of sources:
   1. Org `inlineHelpText` (the org had 35 fields with real admin-authored help, mostly Japanese) — translated to English.
   2. Official Salesforce standard-field semantics (Reports To, Stay-in-Touch, Probability, Lead Source, Record Type…).
   3. Org picklist values (NG reasons, drop reasons, stages, approach types) — described factually.
   4. Public knowledge of data sources: TDB = Teikoku Databank, TSR = Tokyo Shoko Research, SCUEL (healthcare-facility DB), GICS, D-U-N-S, S&P Capital IQ, Apollo.io, Speed M&A, BizBank.
   5. **Nothing invented** — unverifiable fields left blank (Raia, DoGather, Deal Conflict, the unmatched "Rep's …" block on Accounts, etc.).
5. **Applied + verified** (295 descriptions written, 284 stubs blanked, 0 Japanese characters remaining), then copied over the original.

## Rules that were followed (keep for tomorrow)
- Full English in both columns.
- Blank Column 2 for self-evident labels (Year, Revenue, Website…); no "Edit X"-style stubs.
- Translate, don't discard, human-authored Japanese guidance.
- Units spelled out where labels are cryptic: `(M)` = JPY millions, `(JPY K)` = thousands, `JPY 10K` = 万円, `USD mm` = USD millions.
- Column 1 fixes applied: 買収ニーズ名 → "M&A Need Name"; "Sell Agreement **Singed** Date" → "Signed"; "Expected Revenue(万円)" → "Expected Revenue(JPY 10K)".

## Findings worth knowing
- **Duplicate columns**: Accounts `CB_EBITDAUSDmm__c` duplicates "EBITDA(USD M)" (both = `CB_EBITDA_USDmm__c`); Matches sheet duplicates Seller, Website, Folder URL(Project).
- **Misleading labels**: Accounts "TSR Current Address / Hometown / School" are the *representative's* personal data (`TSRRepAdress__c`, `TSRRepLocal__c`, `TSRRepEducation__c`).
- **Close Date** on Opportunity is unused; auto-overwritten to 2037-05-01 (org help).
- ~26 Accounts-sheet labels don't exist on the Account object (Rep's-info block, Deal Conflict, Contact Sourcing…) — possibly deleted fields or another object.
- NN = non-name (anonymous teaser); toss-up = lead handoff from inside sales to deal team; In-In/In-Out/Out-In/Out-Out = deal direction.

## Planned next step (tomorrow, 2026-08-27) — CONFIRMED
Push the workbook's help text **into Salesforce** as field-level `inlineHelpText` (Metadata API deploy; the MCP connector is read-only).

Sketch:
1. Check tooling/auth: `sf --version`, `sf org list` (login via `sf org login web` if needed). Admin rights required for metadata deploy.
2. Retrieve current field metadata for the 8 objects (e.g. `sf project retrieve start -m "CustomObject:Account" ...`) — the local `force-app/main/default/objects/` folder is empty, so retrieve fresh.
3. Generate `<inlineHelpText>` updates from the workbook (Column 2) using the API names in `fieldhelp-workfiles/worklist.json`.
4. Deploy back **only the changed fields** (per-field `.field-meta.xml` where possible) to avoid clobbering other metadata.

Cautions:
- Many standard fields (Name, CloseDate, OwnerId, system fields…) don't support inline help text — skip them and report the list.
- inlineHelpText max 510 characters.
- Prefer a sandbox run first if one exists; confirm with Bogdan before deploying to production.
- Rows blanked in the workbook: decide whether to leave org help text as-is or clear it (default: leave as-is, since the org's existing Japanese help was the source we translated — clearing would lose it for JP users; confirm).
