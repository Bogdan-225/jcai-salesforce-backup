# Sell-Side Conflict: prod deploy runbook (2026-10-16)

Prod was only READ for this package (retrieve + SELECT). Nothing has been deployed. Run every command yourself with the `!` prefix, from the repo root, in the order below.

## 1. Summary
New checkbox `Account.SellSideConflict__c` (label ja 進行中売り手(接触注意) / en "Seller Conflict (Caution)") marks accounts that are the seller (or parent of the seller) in an active project. Two helper fields on Opportunity (`SellSideActive__c`, `SellSideBaseDate__c`), an Apex recalculator, a record-triggered Opportunity flow (instant ON/OFF) and a daily scheduled Apex (90-day expiry + safety net) drive it. Existing `DealConflict__c` / `DealConflict_M__c` only get new labels/help (ja 進行中買い手(接触注意), en "Buyer Conflict (Caution)").

Deliberate deviations from the colleague's spec:
- NO API rename (BuySideConflict__c is not created; labels only).
- Compact layout NOT changed (already at the 10-field maximum, see section 6).
- Hybrid instant (flow) + daily (Apex) instead of formula/scheduled flow only.

## 2. Pre-conditions (already done)
- Backup `backfill/prod_before.json`: 12 rows (the 12 DealConflict accounts), status 0. SellSideConflict__c does not exist in prod yet, so the stock `backup_flags.sh` fails on the missing column; the file was produced by the same query without that column (DealConflict only). Before-state of the new flag = all false.
- Snapshot `prod/snapshot_before/` (committed): the 3 en_US translations (full, with field entries; retrieved together with their CustomObjects), 2 DealConflict fields, Account compact layout, FlexiPages Japan + International, perm set DealConflict_Access, 8 profiles. The CustomObject files themselves were not kept (very large; only needed to get the translation field entries).

## 3. Deploy order (one command per line)
```
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict/fields --wait 10
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict/apex --test-level RunSpecifiedTests --tests SellSideConflictRecalculatorTest --wait 15
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict/flow --wait 10
```
The flow file says `status Active`. In this org flows have deployed as Draft before; check right after the deploy, and do not activate without your go:
```
! sf data query -o prod --use-tooling-api -q "SELECT Id, DeveloperName, ActiveVersionId, LatestVersionId FROM FlowDefinition WHERE DeveloperName='Opportunity_AfterSave_RecomputeSellSideConflict'"
```
Activation (only after explicit go; empty ActiveVersionId = still Draft; use the Id from the query; no leading slash):
```
! sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<FlowDefinitionId>" --body '{"Metadata":{"activeVersionNumber":1}}'
```
Then:
```
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict/labels/prod --wait 10
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict/access/prod --wait 10
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict/pages/prod --wait 10
```
Backfill and report:
```
! sf apex run -o prod --file scripts/deploy/sell_side_conflict/backfill/run_recalculate_all.apex
! bash scripts/deploy/sell_side_conflict/backfill/report_flags.sh prod
```
Schedule the daily job and verify (expect State WAITING, NextFireTime = next 20:00Z):
```
! sf apex run -o prod --file scripts/deploy/sell_side_conflict/backfill/schedule_job.apex
! sf data query -o prod -q "SELECT Id, CronJobDetail.Name, CronExpression, State, NextFireTime FROM CronTrigger WHERE CronJobDetail.Name = 'SellSideConflict Daily'"
```
After-snapshot (same retrieve as before, into snapshot_after, then `git diff --no-index prod/snapshot_before/<file> prod/snapshot_after/<file>` per file):
```
! sf project retrieve start -o prod -m "CustomField:Account.DealConflict__c" -m "CustomField:Account.SellSideConflict__c" -m "CustomField:Opportunity.SellSideActive__c" -m "CustomField:Opportunity.SellSideBaseDate__c" -m "CustomField:Matching__c.DealConflict_M__c" -m "FlexiPage:Japan" -m "FlexiPage:International" -m "PermissionSet:DealConflict_Access" -m "Profile:Admin" -m "Profile:Active%5F%5FIS_Buy" -m "Profile:Active_インターン" -m "Profile:Active_アプローチ管理者" -m "Profile:Active_アドバイザー" -m "Profile:Active_アドバイザー_pf" -m "Profile:Active_IS_Sell" -m "Profile:Active_IS_Sell_pf" -r scripts/deploy/sell_side_conflict/prod/snapshot_after
```
Translations only carry field entries when retrieved together with the CustomObject: use `--manifest` (CustomObject Account/Matching__c/Opportunity + CustomObjectTranslation, same as `prod/snapshot_before/retrieve_package.xml`) with `--target-metadata-dir <dir> --unzip`.

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
| Perm set DealConflict_Access | +3 read-only field permissions, new description |
| 8 profiles (Admin, Active__IS_Buy, Active_インターン, Active_アプローチ管理者, Active_アドバイザー, Active_アドバイザー_pf, Active_IS_Sell, Active_IS_Sell_pf) | partial: 2 class accesses + 3 read-only FLS each |
| FlexiPage Account Japan, International | + SellSideConflict__c read-only after DealConflict__c |
| Scheduled job "SellSideConflict Daily" | new |

Expected UNCHANGED (API names do not change; verify by opening after deploy): 4+2 flows referencing DealConflict__c, Apex DealConflictRecalculator (+Test), Account compact layout, 5 Matching layouts + 4 Matching flexipages, report type Account_Matching, 18 reports (SatoMizuki/MatchingTest + LongList), the other Account/Matching en_US translation entries, all profiles other than the 8 above.

### Diffs of prod package vs prod snapshot (added/changed lines only)
- labels/prod Account-en_US: DealConflict__c help+label replaced (Deal Conflict -> Buyer Conflict (Caution)); +1 block SellSideConflict__c (Seller Conflict (Caution)) at line 4833. Nothing else.
- labels/prod Matching__c-en_US: DealConflict_M__c help+label replaced. Nothing else (caseValues Match/Matches untouched).
- labels/prod Opportunity-en_US: +2 blocks SellSideActive__c, SellSideBaseDate__c. Nothing else.
- access/prod DealConflict_Access: description replaced; +Account.SellSideConflict__c, +Opportunity.SellSideActive__c, +Opportunity.SellSideBaseDate__c (editable false, readable true). Nothing else.
- pages/prod Japan: +10 lines (fieldInstance Record.SellSideConflict__c, readonly) after DealConflict__c. Nothing else.
- pages/prod International: +10 lines, same. Nothing else.
- labels/prod field files: same text as sandbox; vs prod snapshot only description, inlineHelpText, label changed (+ `<externalId>false</externalId>`).

## 5. Expected backfill size
About 337 accounts ON (334 sellers + 3 parents) from the 2026-10-16 sizing; the partial-sandbox rehearsal gave 74 (smaller data). The report script shows total, by record type, seller vs parent-only.

## 6. Open decisions for Bogdan
1. Compact layout (NOT in the package): Account_Compact_Layout already has 10 fields: Name, TDBAmountOfSales__c, NGDate__c, NDA_date__c, NDA_caution__c, NDA_note__c, approach_caution_select__c, DealConflict__c, fd_M_Aneeds__c, cb_M_Aneeds__c. Swap one of them for SellSideConflict__c, or leave it?
2. Matching mirror field (Task 10): build now or later?
3. Flow activation: your explicit go after the flow deploy check.
4. The flow file has status Active: confirm you accept it live right after deploy if prod does not turn it into Draft; otherwise I ship a Draft copy.

## 7. Rollback
In this order:
1. Deactivate the flow: `! sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<FlowDefinitionId>" --body '{"Metadata":{"activeVersionNumber":0}}'`
2. Abort the job: `! sf data query -o prod -q "SELECT Id FROM CronTrigger WHERE CronJobDetail.Name = 'SellSideConflict Daily'"`, then run anonymous Apex `System.abortJob('<CronTriggerId>');`
3. Clear the flag: `! sf apex run -o prod --file scripts/deploy/sell_side_conflict/backfill/rollback_clear_flags.apex` (sets SellSideConflict__c false everywhere; before-state was "field did not exist", so all-false is the restore). DealConflict__c is not touched by this change; `backfill/prod_before.json` lists its 12 ON accounts for reference.
4. Labels / page / permissions can stay (harmless). To revert them, redeploy the files in `prod/snapshot_before/`.
