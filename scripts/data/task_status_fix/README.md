# Task Status bulk fix (2026-10-02)

Companion to flow `Task_BeforeSave_NormalizeStatus` (v2 live in prod 2026-10-02 05:17Z).
Closes every Task that carries an English Status string the org's TaskStatus value set does not
contain (`Completed`, `In Progress`, `Not Started` -> IsClosed stays false forever, rows never archive),
plus the ShortlistEmailSender rows that were left `進行中` because the Apex set no status.

## Scope (snapshot_2026-10-02.csv, 105,656 rows, exported 2026-10-02 ~05:30Z)

| Group | Rows | Source |
|---|---|---|
| Status `Completed` | 103,600 | Zoom For Lightning dialer (Subject `Outbound to +…`) + ShortlistEmailSender Matching/Contact logs |
| Status `In Progress` | 41 | Zoom dialer, failed/dropped calls that never got the completion update |
| Status `Not Started` | 23 | junk rows by 佐々 侑哉 2025-06-17, no subject |
| Subject `メール送信リストから一括送信` AND Status `進行中` | 1,991 | ShortlistEmailSender `createSendLogTask` (Account 1,878 / Opportunity 113) |
| `00TRA00002GtPur2AF` | 1 | today's failed dialer call, landed `進行中` under flow v1 |

All rows get `Status = 完了`. Nothing else is written.

## Files

- `snapshot_2026-10-02.csv` – pre-update state (Id, Status, Subject, WhatId, WhoId, OwnerId, CreatedById, dates, duration).
- `update_A_nodeal.csv` – 102,703 rows whose WhatId is NOT an Opportunity (006) / Project__c (a0r). Safe to load with all automation active.
- `update_B_deal.csv` – 2,953 rows: WhatId = Opportunity (2,952, 37 distinct deals) + the one task with CallStatus__c = アポ獲得 (`00TRA00000dWxMh2AK`). Load ONLY with the two flows below paused.
- `canary_update.csv` – 200 rows from file A (150 Completed, 20 In Progress, 10 Not Started, 20 email-log 進行中).
- `task_status_rollback.csv` – all 105,656 rows with their original Status (restores the invalid strings; the before-save flow would normalise `Completed`/`In Progress`/`Not Started` again on load, so a true rollback also needs flow `Task_BeforeSave_NormalizeStatus` paused).

CSV = UTF-8, CRLF (sf CLI on Windows rejects LF with "LineEnding is invalid").

## Automation audit (prod, 2026-10-02)

Task record-triggered flows that fire on UPDATE:

| Flow | Entry | Effect on this load | Handling |
|---|---|---|---|
| `Task_AfterSave_StampDealLastActivity` (Sato Mizuki, 2026-08-03, stalled-deal PJ) | WhatId begins 006 / a0r, any save | stamps `LastActivityUpdate__c = now` and `Stalled__c = false` on the parent deal -> would falsely un-stall 37 Opportunities | pause for file B only |
| `ToDo_Account_NG` | CallStatus__c in NG / アポ獲得 / トスアップ list, any save | rewrites Account `NGCause__c` / `NGDate__c` from a 2025 task | 1 target row (アポ獲得) moved to file B; pause for file B |
| `ToDo_Account_SellCallNG` | CallStatus__c in sell-call NG list | none: no target row has those values (only コール音/留守電 ×4, 受付NG ×2, which are not in the list) | – |
| `Task_BeforeSave_NormalizeStatus` | Status = English string | not entered (we write 完了 directly) | – |

Create-only flows (not fired by an update): Flow_SetAccountNGOnOpportunityWon, MakeRelationToAccount,
matching_record_update_when_create_task_for_matching, MatchingTODOCopyToAcquirerTODO,
ToDo_*_Check_ActivitiesByStage_True, todoToSlackAlert, When_Matching_Todo_Created.

Managed triggers (after insert + after update): `ZVC.TaskTrigger` (Zoom; already runs on every Zoom update of these
rows), `slackv2.task` (Slack; only active Task subscription is "Task assigned to me", Trigger_Record_Limit = 5, no
status-change subscription) -> no expected side effects; canary verifies.

## Run order (prod writes are blocked from Claude's Bash; Bogdan runs with `!` from the project root)

1. Canary (200 rows, file A subset):
   ```
   sf data update bulk -o prod --sobject Task --file scripts/data/task_status_fix/canary_update.csv --wait 5
   ```
   Verify: all 200 -> 完了 / IsClosed = true, 0 failures, no Slack noise, Zoom trigger quiet.
2. File A (102,703 rows, all automation active):
   ```
   sf data update bulk -o prod --sobject Task --file scripts/data/task_status_fix/update_A_nodeal.csv --wait 30
   ```
3. Pause the two flows (Tooling PATCH, URL without leading slash):
   ```
   sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/300RA00001kHKkAYAW" --body '{"Metadata":{"activeVersionNumber":0}}'
   sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/300RA00000sc562YAA" --body '{"Metadata":{"activeVersionNumber":0}}'
   ```
4. File B (2,953 rows):
   ```
   sf data update bulk -o prod --sobject Task --file scripts/data/task_status_fix/update_B_deal.csv --wait 10
   ```
5. Re-activate both flows (`activeVersionNumber` StampDeal back to 1, ToDo_Account_NG back to 2).
6. Verify:
   ```
   SELECT Status, IsClosed, COUNT(Id) FROM Task GROUP BY Status, IsClosed          -- only 進行中 / 完了
   SELECT COUNT() FROM Task WHERE Subject LIKE 'Outbound to %' AND IsClosed = false -- expect 0 (or only brand-new rows)
   ```

Job status / failed rows: `services/data/v62.0/jobs/ingest/<750…>` and `/failedResults`.
