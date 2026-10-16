# Sell-Side Conflict: prod deploy runbook (2026-10-16)

Prod was only READ for this package (retrieve + SELECT). Nothing has been deployed. Run every command yourself with the `!` prefix, from the repo root, in the order below.

## 1. Summary
New checkbox `Account.SellSideConflict__c` (label ja 進行中売り手(接触注意) / en "Seller Conflict (Caution)") marks accounts that are the seller (or parent of the seller) in an active project. Two helper fields on Opportunity (`SellSideActive__c`, `SellSideBaseDate__c`), an Apex recalculator, a record-triggered Opportunity flow (instant ON/OFF) and a daily scheduled Apex (90-day expiry + safety net) drive it. A read-only formula mirror `Matching__c.SellSideConflict_M__c` (= `Buy_Company__r.SellSideConflict__c`, label ja 進行中売り手(接触注意) / en "Seller Conflict (Caution)") shows the buyer's seller flag on Matching records, next to `DealConflict_M__c`, on 5 layouts + 3 Lightning pages. Existing `DealConflict__c` / `DealConflict_M__c` only get new labels/help (ja 進行中買い手(接触注意), en "Buyer Conflict (Caution)").

Deliberate deviations from the colleague's spec:
- NO API rename (BuySideConflict__c is not created; labels only).
- Compact layout NOT changed (already at the 10-field maximum, see section 6).
- Hybrid instant (flow) + daily (Apex) instead of formula/scheduled flow only.

## 2. Pre-conditions (already done)
- `backfill/prod_before.json` is only the hand-made DealConflict baseline (12 rows, status 0) captured BEFORE the deploy, because `backup_flags.sh` cannot run until SellSideConflict__c exists. The real two-flag backup is taken in the deploy order below, after the fields/pages are live and before the backfill. Before-state of the new flag = all false.
- Backups hold Ids only by design (company names are deal-identifying); `backfill/prod_before_flags.json` and `prod/snapshot_after/` are git-ignored.
- Decision needed BEFORE the activation step: your explicit go for flow activation (section 6). The prod flow package is a Draft copy, so deploying it does not make it live.
- Snapshot `prod/snapshot_before/` (committed): the 3 en_US translations (full, with field entries; retrieved together with their CustomObjects), 2 DealConflict fields, Account compact layout, FlexiPages Japan + International, the 5 Matching layouts + 3 Matching FlexiPages (Matching_Advisor, Matching_Advisor_M_CB, Matching_IS_Buy), perm set DealConflict_Access, 8 profiles. The CustomObject files themselves were not kept (very large; only needed to get the translation field entries).

## 3. Deploy order (one command per line)
```
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict/fields --wait 10
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict/mirror/field --wait 10
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict/apex --test-level RunSpecifiedTests --tests SellSideConflictRecalculatorTest --wait 15
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict/flow/prod --wait 10
```
`mirror/field` (Matching__c.SellSideConflict_M__c) is deployed here, with the other fields, because `labels/prod` (its en_US entry) and `access/prod` (its perm set entry) reference it and would fail if the field did not exist yet. `mirror/access` deliberately holds profiles only: its perm set file would be the sandbox one, so for prod the perm set always comes from `access/prod`.

`flow/prod` is an exact copy of the sandbox flow with `<status>Draft</status>` (only that line differs), so it deploys inactive. It is activated only later (after the backup, below) and only on your explicit go. Check it is still Draft (empty ActiveVersionId):
```
! sf data query -o prod --use-tooling-api -q "SELECT Id, DeveloperName, ActiveVersionId, LatestVersionId, LatestVersion.VersionNumber FROM FlowDefinition WHERE DeveloperName='Opportunity_AfterSave_RecomputeSellSideConflict'"
```
Staleness check (labels/prod, access/prod, pages/prod and mirror/prod replace whole components built from the prod snapshot, snapshot taken 2026-10-16T12:55:52+09:00). Run all four. FlexiPage has no LastModifiedBy in Tooling, so only the date is shown. For the Layout query use the Matching__c object id (Tooling Layout.TableEnumOrId holds the id for custom objects) and pick the 5 names Advisor, CB_Matching(In-Out), CB_Matching(Out-Out), IS_Buy, 国内案件 by eye:
```
! sf data query -o prod --use-tooling-api -q "SELECT DeveloperName, LastModifiedDate FROM FlexiPage WHERE DeveloperName IN ('Japan','International','Matching_Advisor','Matching_Advisor_M_CB','Matching_IS_Buy')"
! sf data query -o prod --use-tooling-api -q "SELECT Name, TableEnumOrId, LastModifiedDate, LastModifiedBy.Name FROM Layout WHERE TableEnumOrId = '01I5h0000001y98EAA'"
! sf data query -o prod -q "SELECT Name, LastModifiedDate, LastModifiedBy.Name FROM PermissionSet WHERE Name = 'DealConflict_Access'"
! sf data query -o prod --use-tooling-api -q "SELECT DeveloperName, TableEnumOrId, LastModifiedDate, LastModifiedBy.Name FROM CustomField WHERE DeveloperName IN ('DealConflict','DealConflict_M')"
```
- Compare each LastModifiedDate with the snapshot time (queries show UTC; the time above is JST).
- If anything is newer: STOP.
- Re-retrieve that component into `prod/snapshot_before/` (same manifest).
- Rebuild the affected package file (`node pages/transform_account_page.js`, `bash mirror/build_mirror.sh`, or the manual edits for translations / perm set), re-diff, then continue.

Then:
```
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict/labels/prod --wait 10
! sf apex run test -o prod --tests DealConflictRecalculatorTest --tests SellSideConflictRecalculatorTest --result-format human --wait 20
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict/access/prod --wait 10
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict/pages/prod --wait 10
```
The Apex test run (plan Task 11 check): expect all pass; test data rolls back.

Matching mirror: access (profiles only; the perm set entry, i.e. the DealConflict_Access FLS for Matching__c.SellSideConflict_M__c, already came with `access/prod`) and the 5 layouts + 3 pages. These must be live BEFORE the backup/backfill below:
```
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict/mirror/access --wait 10
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict/mirror/prod --wait 10
```
Backup of both flags (new file name; the script refuses to overwrite prod_before.json). Expected: `saved 12 rows to ...prod_before_flags.json`; 12 rows, DealConflict true on all 12, SellSideConflict false on all (flow not yet active):
```
! bash scripts/deploy/sell_side_conflict/backfill/backup_flags.sh prod scripts/deploy/sell_side_conflict/backfill/prod_before_flags.json
```
Flow activation (only after your explicit go; empty ActiveVersionId = still Draft). Query first, then PATCH with the Id from the query and `<LatestVersion.VersionNumber from the query>` (expected 1 on first deploy); no leading slash:
```
! sf data query -o prod --use-tooling-api -q "SELECT Id, DeveloperName, ActiveVersionId, LatestVersionId, LatestVersion.VersionNumber FROM FlowDefinition WHERE DeveloperName='Opportunity_AfterSave_RecomputeSellSideConflict'"
! sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<FlowDefinitionId>" --body '{"Metadata":{"activeVersionNumber":<LatestVersion.VersionNumber from the query>}}'
```
Backfill and report. Both completeness lines at the end of the report (accounts missing the flag) must be 0 after the backfill; they double as a daily health check (run `report_flags.sh prod` any day; non-zero = an account that should be flagged is not):
```
! sf apex run -o prod --file scripts/deploy/sell_side_conflict/backfill/run_recalculate_all.apex
! bash scripts/deploy/sell_side_conflict/backfill/report_flags.sh prod
```
Schedule the daily job and verify (expect State WAITING, NextFireTime = next 20:00Z):
```
! sf apex run -o prod --file scripts/deploy/sell_side_conflict/backfill/schedule_job.apex
! sf data query -o prod -q "SELECT Id, CronJobDetail.Name, CronExpression, State, NextFireTime FROM CronTrigger WHERE CronJobDetail.Name = 'SellSideConflict Daily'"
```
After-snapshot (manifest retrieve so translations carry their field entries; the compact layout is included and expected unchanged). Files land in mdapi layout under snapshot_after/unpackaged/unpackaged/; compare with `git diff --no-index` against the matching files in snapshot_before (new fields appear inside Account.object / Opportunity.object):
```
! sf project retrieve start -o prod --manifest scripts/deploy/sell_side_conflict/prod/snapshot_before/retrieve_package.xml --target-metadata-dir scripts/deploy/sell_side_conflict/prod/snapshot_after --unzip --wait 20
```

## 4. Impact analysis
Touched components:

| Component | Change |
|---|---|
| Account.SellSideConflict__c | new checkbox |
| Opportunity.SellSideActive__c, Opportunity.SellSideBaseDate__c | new helper fields |
| Apex SellSideConflictRecalculator, SellSideConflictScheduler, SellSideConflictRecalculatorTest | new |
| Flow Opportunity_AfterSave_RecomputeSellSideConflict | new |
| Account.DealConflict__c, Matching__c.DealConflict_M__c | label / description / help only (+ `externalId false`, the default) |
| CustomObjectTranslation Account-en_US, Matching__c-en_US, Opportunity-en_US | relabel DealConflict blocks, add 3 new field blocks (diffs below) |
| Perm set DealConflict_Access | +4 read-only field permissions (3 + Matching__c.SellSideConflict_M__c), new description |
| 8 profiles (Admin, Active__IS_Buy, Active_インターン, Active_アプローチ管理者, Active_アドバイザー, Active_アドバイザー_pf, Active_IS_Sell, Active_IS_Sell_pf) | partial: 2 class accesses + 3 read-only FLS each, plus 1 read-only FLS (Matching__c.SellSideConflict_M__c) via mirror/access |
| FlexiPage Account Japan, International | + SellSideConflict__c read-only after DealConflict__c |
| Matching__c.SellSideConflict_M__c | new formula checkbox (Buy_Company__r.SellSideConflict__c), read-only FLS via mirror/access (8 profiles + DealConflict_Access), en_US label/help in Matching__c-en_US |
| 5 Matching layouts (Advisor, CB_Matching(In-Out), CB_Matching(Out-Out), IS_Buy, 国内案件) | + SellSideConflict_M__c Readonly item after DealConflict_M__c |
| 3 Matching FlexiPages (Matching_Advisor, Matching_Advisor_M_CB, Matching_IS_Buy) | + Record.SellSideConflict_M__c read-only fieldInstance (identifier RecordSellSideConflict_M_cField) after DealConflict_M__c |
| Scheduled job "SellSideConflict Daily" | new |

Expected UNCHANGED (API names do not change; verify by opening after deploy): 4+2 flows referencing DealConflict__c, Apex DealConflictRecalculator (+Test), Account compact layout, the 4th Matching page `Sourcing_RecordPage` (layout-driven, no field instance, unchanged, not in the mirror set), report type Account_Matching, 18 reports (SatoMizuki/MatchingTest + LongList), the other Account/Matching en_US translation entries, all profiles other than the 8 above.

### Diffs of prod package vs prod snapshot (added/changed lines only)
- labels/prod Account-en_US: DealConflict__c help+label replaced (Deal Conflict -> Buyer Conflict (Caution)); +1 block SellSideConflict__c (Seller Conflict (Caution)) at line 4833. Nothing else.
- labels/prod Matching__c-en_US: DealConflict_M__c help+label replaced; +1 block SellSideConflict_M__c (Seller Conflict (Caution)) inserted after S_Website__c (the file's ASCII order). Nothing else (caseValues Match/Matches untouched).
- labels/prod Opportunity-en_US: +2 blocks SellSideActive__c, SellSideBaseDate__c. Nothing else.
- access/prod DealConflict_Access: description replaced; +Account.SellSideConflict__c, +Opportunity.SellSideActive__c, +Opportunity.SellSideBaseDate__c, +Matching__c.SellSideConflict_M__c (editable false, readable true). Nothing else.
- pages/prod Japan: +10 lines (fieldInstance Record.SellSideConflict__c, readonly) after DealConflict__c. Nothing else.
- pages/prod International: +10 lines, same. Nothing else.
- mirror/prod 5 layouts: +4 lines each (layoutItems Readonly SellSideConflict_M__c) after DealConflict_M__c, 0 lines removed. mirror/prod 3 FlexiPages: +10 lines each (fieldInstance Record.SellSideConflict_M__c, readonly), 0 lines removed. Both vs prod/snapshot_before.
- labels/prod field files: same text as sandbox; vs prod snapshot only description, inlineHelpText, label changed (+ `<externalId>false</externalId>`).

## 5. Expected backfill size
About 337 accounts ON (334 sellers + 3 parents) from the 2026-10-16 sizing; the partial-sandbox rehearsal gave 74 (smaller data). The report script shows total, by record type, seller vs parent-only.

## 6. Open decisions for Bogdan
Decided, Bogdan 2026-10-16: leave the highlights panel (compact layout) as is; the flag is shown in the Details section (Account_Compact_Layout already has the 10-field maximum).

Open:
1. Flow activation: your explicit go, needed before the activation step (the deployed flow is Draft until then).

## 7. Rollback
In this order:
1. Deactivate the flow: `! sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<FlowDefinitionId>" --body '{"Metadata":{"activeVersionNumber":0}}'`
2. Abort the job: `! sf apex run -o prod --file scripts/deploy/sell_side_conflict/backfill/rollback_abort_job.apex`
3. Clear the flag: `! sf apex run -o prod --file scripts/deploy/sell_side_conflict/backfill/rollback_clear_flags.apex` (sets SellSideConflict__c false everywhere; before-state was "field did not exist", so all-false is the restore). DealConflict__c is not touched by this change; `backfill/prod_before.json` lists its 12 ON accounts for reference.
4. Labels / page / permissions can stay (harmless). To revert them, redeploy the files in `prod/snapshot_before/`.
5. Once 'SellSideConflict Daily' is scheduled, redeploying SellSideConflictRecalculator/Scheduler requires aborting the job first (`backfill/rollback_abort_job.apex`) unless 'Allow deployments of components when corresponding Apex jobs are pending' is enabled in Deployment Settings.

## 8. Operational caveats
- LastModifiedDate restarts the 90-day window: any system update (e.g. the Stalled flag) extends it.
- Not instant, but fixed by the 05:00 run: Opportunity delete, Account merge, Account re-parenting, revival by activity alone.
- Add the flow Opportunity_AfterSave_RecomputeSellSideConflict to the pause list for bulk Opportunity loads (next to StampDeal and CheckStage).
