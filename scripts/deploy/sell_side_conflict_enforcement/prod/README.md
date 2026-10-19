# Sell-Side Conflict enforcement: prod deploy runbook (2026-10-19)

Prod was only READ for this package (perm set retrieve + SELECT). Nothing has been deployed. Run every command yourself with the `!` prefix, from the repo root in Git Bash, in the order below.

## 1. Summary
Mirror of the buyer-side auto-terminate for the seller flag `Account.SellSideConflict__c` (design: `docs/superpowers/specs/2026-10-19-sell-side-conflict-enforcement-design.md`).
- 6 hidden fields: `Matching__c.SellSideAutoTerminated__c`, `SellSideConflictWarned__c`, `SellSideConflictSourceName__c`; `Account.SellSideConflictSourceId__c`, `SellSideConflictSourceName__c`; `Opportunity.SellSideSellerParentId__c` (formula). en_US labels/help, read-only on perm set `DealConflict_Access` + System Administrator profile. Not on any layout or page.
- 3 flows (deploy as Draft): A `SellSideConflict_AutoTerminate` (flag ON: terminate live アプローチ Matchings of that buyer, warn the other live ones, memo Event on the Account), B `SellSideConflict_AutoReactivate` (flag OFF: revive what A terminated, clear warnings), C `Matching_AfterSave_TerminateNewOnSellSideConflict` (new Matching on a flagged buyer: terminate on create).
- One-time sweep: every account already flagged is flipped off/on once so A runs for it. B must be inactive during the sweep. In prod B is simply not activated until the sweep is done; `run_sweep.sh` refuses to start if B has an `ActiveVersionId` (that check is the gate).

## 2. Pre-conditions
- Sandbox evidence: `test/SANDBOX_TEST_PLAN.md` (manual plan in `bogdan`, results recorded), `sweep/REHEARSAL_partial.md` (3 sweep rehearsals in `partial`, incl. refusal, fault and resume paths). Sweep procedure: `sweep/README.md`.
- Acknowledged by Bogdan: the sweep creates one memo Event `Seller Conflict: <deal>` on EVERY flagged Account (about 339), whether or not it has a Matching to touch. By design (mirror of the buyer side).
- Prod today (2026-10-19): about 339 accounts flagged (check with the backup), 0 stale flags. 21 live Matchings whose buyer is a flagged seller; expected outcome 6 terminated, 6 warned, 9 untouched (dead deal or Target). Re-derive from the backup (step 3.9), do not trust these numbers blindly.
- Staleness reference (only whole-file component): perm set `DealConflict_Access`, prod `LastModifiedDate = 2026-10-19T05:37:42.000+0000` (14:37:42 JST, deploy 0AfRA000003345N0AQ of the first project). `access_prod/` = that prod file (`prod/snapshot_before/permissionsets/DealConflict_Access.permissionset`) +30/−0 lines (the 6 read-only field permissions). `access/` (Admin profile partial) and `labels/` (3 partial translations) are not whole-file replacements: no snapshot needed.
- The 05:00 JST job `SellSideConflict Daily` and the Opportunity flow keep flipping flags. A change between backup and sweep is harmless: the sweep skips accounts no longer flagged; a newly flagged account is handled by A directly (once A is active). Do NOT run the sweep across 05:00 JST: if the nightly job unflags an account while B is still inactive, the Matchings A terminated for it are revived only after B is active AND that account's flag next changes. The runbook activates B right after the sweep, so schedule the run away from 05:00 JST.
- Decisions needed: your explicit go before activating A and C (step 3.8), and before the sweep (step 3.11).

## 3. Deploy order (one command per line)
```
P=scripts/deploy/sell_side_conflict_enforcement
```
(the `!` lines below spell the path out in full; `P` is only for reading.)

3.1 Fields (everything below references them). Expect Succeeded 6/6:
```
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict_enforcement/fields --wait 10
```
3.2 en_US labels/help. Expect 3/3:
```
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict_enforcement/labels --wait 10
```
3.3 Admin profile read FLS (partial profile). Expect 1/1:
```
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict_enforcement/access --wait 10
```
3.4 Staleness check. `LastModifiedDate` must be `2026-10-19T05:37:42.000+0000`. If newer: STOP, re-retrieve (`sf project retrieve start -o prod --metadata PermissionSet:DealConflict_Access --target-metadata-dir <scratch> --unzip --wait 10`), replace `prod/snapshot_before/...permissionset`, re-add the 6 blocks to `access_prod/`, re-diff (+30/−0), then continue:
```
! sf data query -o prod -q "SELECT LastModifiedDate, LastModifiedBy.Name FROM PermissionSet WHERE Name='DealConflict_Access'"
```
3.5 Perm set (whole file). Expect 1/1:
```
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict_enforcement/access_prod --wait 10
```
3.6 Flows A, B, C as Draft. Expect 3/3:
```
! sf project deploy start -o prod --source-dir scripts/deploy/sell_side_conflict_enforcement/flows/out --wait 10
```
3.7 FlowDefinition Ids. Expect 3 rows, `ActiveVersionId` empty on all, `LatestVersion.VersionNumber` 1. Note the three `300…` Ids (A, B, C) for the PATCH lines:
```
! sf data query -o prod --use-tooling-api -q "SELECT Id, DeveloperName, ActiveVersionId, LatestVersion.VersionNumber FROM FlowDefinition WHERE DeveloperName IN ('SellSideConflict_AutoTerminate','SellSideConflict_AutoReactivate','Matching_AfterSave_TerminateNewOnSellSideConflict')"
```
3.8 **GATE: your go.** Activate A and C only (no leading slash). B stays Draft. Use `LatestVersion.VersionNumber` from 3.7 if it is not 1:
```
! sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<A id>" --body '{"Metadata":{"activeVersionNumber":1}}'
! sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<C id>" --body '{"Metadata":{"activeVersionNumber":1}}'
```
Re-run the 3.7 query: A and C have an `ActiveVersionId`, B empty.

3.9 Baseline report, then backup, immediately after 3.8. Report: expect terminated 0, warned 0, flagged with source 0 (non-zero = an account flagged naturally since 3.8, fine), last count = expected terminated (about 6). An account flagged naturally between 3.8 and the backup is already handled by A and gets flipped once more by the sweep, so "memo events today" may end slightly above the account count; harmless. Backup: prints `matchings: N  accounts: M` (expect about 21 / 339). The folder `sweep/prod_before/` is git-ignored (deal names, free text): never commit or share it.
```
! bash scripts/deploy/sell_side_conflict_enforcement/sweep/report_sweep.sh prod
! bash scripts/deploy/sell_side_conflict_enforcement/sweep/backup_before_sweep.sh prod scripts/deploy/sell_side_conflict_enforcement/sweep/prod_before
```
3.10 Expected split, read from `sweep/prod_before/matchings_before.csv` (open in a UTF-8 text editor; columns `phase_match__c`, `RecordType.DeveloperName`, `Sell__r.StageName`, `Sell_New__r.StageName__c`). Dead stages = 成約, 案件終了, On Hold, Converted to Buyer; a blank stage counts as live.
- terminate = phase アプローチ AND record type ≠ CB_Target AND neither deal stage dead;
- warn = every other row whose deal stages are both live (other phases, or CB_Target);
- untouched = the rest (a dead deal stage).
Write down the three counts; terminate + warn + untouched = N from the backup.

3.11 **GATE: your go.** Sweep. The script first checks that B has no `ActiveVersionId` (exit 3 otherwise), then runs slices of 25 Ids (about 14 chunks), each printing `chunk i/n: swept k`, then prints the report:
```
! bash scripts/deploy/sell_side_conflict_enforcement/sweep/run_sweep.sh prod scripts/deploy/sell_side_conflict_enforcement/sweep/prod_before
```
Expect exit 0, swept total ≈ accounts in the backup (minus any unflagged since). Exit 5 = a chunk failed: see section 4. Do NOT activate B until the sweep has finished.

3.12 Report. Expect terminated = your 3.10 terminate count, warned (live) = warn count, flagged with source ≈ 339 / without 0, memo events today ≈ 339 (slightly more if accounts were flagged naturally between 3.8 and the backup; harmless), last count 0:
```
! bash scripts/deploy/sell_side_conflict_enforcement/sweep/report_sweep.sh prod
```
3.13 Activate B (use `LatestVersion.VersionNumber` from 3.7 if it is not 1), then re-run the 3.7 query (all three active):
```
! sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<B id>" --body '{"Metadata":{"activeVersionNumber":1}}'
! sf data query -o prod --use-tooling-api -q "SELECT Id, DeveloperName, ActiveVersionId, LatestVersion.VersionNumber FROM FlowDefinition WHERE DeveloperName IN ('SellSideConflict_AutoTerminate','SellSideConflict_AutoReactivate','Matching_AfterSave_TerminateNewOnSellSideConflict')"
```
3.14 After-checks. Pick one terminated and one warned Matching from:
```
! sf data query -o prod -q "SELECT Id, Name, phase_match__c, SellSideAutoTerminated__c, SellSideConflictWarned__c FROM Matching__c WHERE SellSideConflictWarned__c = true"
```
- Terminated one: phase マッチ終了, status アプローチ>終了, reason リスト除外 / 売り手として進行中のため, memo Task `Seller Conflict: <deal>`.
- Warned one: phase unchanged, memo Task `Seller Conflict: <deal>`.
- One flagged Account: memo Event `Seller Conflict: <deal>`.
- First project still healthy, both completeness lines 0 / 0:
```
! bash scripts/deploy/sell_side_conflict/backfill/report_flags.sh prod
! bash scripts/deploy/sell_side_conflict_enforcement/sweep/report_sweep.sh prod
```
(the second: last count still 0, terminated/warned unchanged by activating B).

## 4. A failed chunk (run_sweep.sh exit 5)
B is still inactive: nothing revives while it is off, so there is no hurry.
1. Read the error lines (typically a validation rule or trigger error on one Account; the first project's backfill updated the same accounts without errors, so this is unlikely).
2. `cp scripts/deploy/sell_side_conflict_enforcement/sweep/prod_before/accounts_flagged.csv scripts/deploy/sell_side_conflict_enforcement/sweep/prod_before/accounts_flagged.orig.csv`
3. Fix that Account, or delete its Id line from `accounts_flagged.csv` (only Ids in chunk k or later).
4. Resume with the printed command, e.g. `! bash scripts/deploy/sell_side_conflict_enforcement/sweep/run_sweep.sh prod scripts/deploy/sell_side_conflict_enforcement/sweep/prod_before <k>`. Never restart from chunk 1 (A would re-fire on swept accounts and duplicate their memo Events).
5. Removed Ids: list them for a later manual flip; then continue with 3.12.
If you decide to stop instead: go to 3.12/3.13 anyway (B must end up active) or roll back (section 5).

## 5. Rollback
See `prod/revert/README.md`: deactivate A, B, C → restore the swept Matchings from `sweep/prod_before/matchings_before.csv` (`prod/revert/restore_matchings.apex`) → clear the Account source fields (`prod/revert/clear_account_sources.apex`) → optional memo cleanup. Fields, labels and permissions can stay (hidden, inert). To put the perm set back exactly: deploy `prod/snapshot_before/permissionsets/` (rename to `.permissionset-meta.xml` in a scratch source dir first).

## 6. After prod
- Record here (new section 7): deploy ids of 3.1-3.6, FlowDefinition Ids, backup counts, expected vs actual split, sweep chunk count, report numbers.
- Commit the README update (Ids and counts only, no account or company names).
- Tracker: one row (next free ID, check with `tracker lists`), 種別 追加, 対象 Matching / Account flows.
- Memory: project file for this project (Flow Ids, pause list: add A/B/C to bulk Account and Matching loads next to CheckStage / OBEditingActions).
