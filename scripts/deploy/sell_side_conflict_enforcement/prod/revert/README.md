# Sell-Side Conflict enforcement: prod rollback

Run from the repo root in Git Bash, each line with `!`, in this order. Nothing here touches the first project
(`SellSideConflict__c`, its Opportunity flow and daily job) or the buyer-side fields and flows.

## 1. Kill switch: deactivate A, B, C
FlowDefinition Ids from the runbook (`prod/README.md` 3.7 / section 7). No leading slash:
```
! sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<A id>" --body '{"Metadata":{"activeVersionNumber":0}}'
! sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<B id>" --body '{"Metadata":{"activeVersionNumber":0}}'
! sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<C id>" --body '{"Metadata":{"activeVersionNumber":0}}'
! sf data query -o prod --use-tooling-api -q "SELECT Id, DeveloperName, ActiveVersionId FROM FlowDefinition WHERE DeveloperName IN ('SellSideConflict_AutoTerminate','SellSideConflict_AutoReactivate','Matching_AfterSave_TerminateNewOnSellSideConflict')"
```
Expect `ActiveVersionId` empty on all three.

## 2. Restore the swept Matchings
1. Copy the skeleton into the git-ignored backup folder (the filled copy holds free text, never commit it):
   `cp scripts/deploy/sell_side_conflict_enforcement/prod/revert/restore_matchings.apex scripts/deploy/sell_side_conflict_enforcement/sweep/prod_before/restore_matchings.filled.apex`
2. In the copy, add one line per row of `sweep/prod_before/matchings_before.csv`, columns 1-5 in this order:
   `Id, phase_match__c, status__c, termination_reason__c, other_termination_reason__c`
   as `new List<String>{'<Id>', '<phase>', '<status>', '<reason>', '<other reason>'}`, comma between lines, none after the last.
   Empty cell → `''`. Escape `'` as `\'`; a line break inside a quoted cell → `\n`. Pasting all rows is fine: the script
   restores phase/status/reasons only on rows still marked `SellSideAutoTerminated__c = true`, and only clears markers on the rest.
3. If the restore hits validation errors (stage moves back from マッチ終了 to アプローチ), pause the Matching flows
   `CheckStage` and `OBEditingActions` first (as for earlier bulk Matching updates), rerun, then re-activate them.
4. Run (all-or-nothing; the debug lines list rows restored, rows not found, and terminated rows NOT in the backup,
   e.g. new Matchings terminated by C after go-live: those are left as they are, decide by hand):
```
! sf apex run -o prod --file scripts/deploy/sell_side_conflict_enforcement/sweep/prod_before/restore_matchings.filled.apex
```
Restoring the phase also runs the buyer-side `Matching_AfterSave_RecomputeDealConflict` (intended: keeps the buyer flag right).
Check: open one restored Matching; phase/status/reasons as in the CSV, three SellSide markers blank.

## 3. Clear the Account source fields
Nulls `SellSideConflictSourceId__c` and `SellSideConflictSourceName__c` on every Account that has one (about 339, one transaction).
Debug line `cleared N, remaining 0`:
```
! sf apex run -o prod --file scripts/deploy/sell_side_conflict_enforcement/prod/revert/clear_account_sources.apex
```

## 4. Optional: memo cleanup (your call)
Memo Tasks (on Matchings) and Events (on Accounts) of the sweep day. Replace the range with the sweep day in UTC
(JST day D = `D-1T15:00:00Z` to `DT15:00:00Z`). Review before deleting; this also matches genuine memos A/C wrote that day.
```
! sf data query -o prod -q "SELECT COUNT(Id) FROM Task WHERE Subject LIKE 'Seller Conflict%' AND CreatedDate >= 2026-10-19T15:00:00Z AND CreatedDate < 2026-10-20T15:00:00Z"
! sf data query -o prod -q "SELECT COUNT(Id) FROM Event WHERE Subject LIKE 'Seller Conflict%' AND CreatedDate >= 2026-10-19T15:00:00Z AND CreatedDate < 2026-10-20T15:00:00Z"
```
To delete: export the Ids (`sf data query ... -q "SELECT Id FROM Event WHERE ..." -r csv > <file>` into `sweep/prod_before/`,
convert to CRLF) and `sf data delete bulk -o prod -s Event -f <file> --wait 10` (same for Task).

## 5. What stays
The 6 fields, labels, Admin FLS and perm set entries are hidden and inert; they can stay or be deleted in Setup later
(flows first). The perm set can be put back exactly from `prod/snapshot_before/permissionsets/` (copy as
`DealConflict_Access.permissionset-meta.xml` into a scratch `permissionsets/` source folder and deploy that folder).
