# Open-task backlog close (2026-10-02)

Second Task clean-up of the day (first: `scripts/data/task_status_fix`, invalid English statuses).
This one closes Tasks that carry the valid value `進行中` but are really finished records.

## Rule (decided by Bogdan 2026-10-02)

Close every open Task **unless**
- any date field is today (2026-10-02 JST) or later: `ActivityDate`, `call_date_and_time__c`,
  `NextActionDate__c`, `task_start_date__c`, `task_end_date__c`; or
- it is a typed activity-card task: `activity_type__c` set or `parent_activity_id__c` set.

## Where the open tasks came from (analysis in memory note `project_open_tasks_backlog`)

| Source | Rows (approx.) | Status of the source |
|---|---|---|
| Flow `MatchingTODOCopyToAcquirerTODO` copied Matching tasks to the buyer Account without Status | 90,000 | FIXED: v5 copies the source Status (prod 07:04Z, deploy 0AfRA000002yvIP0AY) |
| DM logs bulk-imported by 佐々 侑哉 (手紙DM送付_N / メールDM送付予定_N) | 76,000 | imports no longer happen (Bogdan) |
| 2022-06 legacy import by 尾関2 (問い合わせ送信 + blank subjects) | 84,000 | one-off |
| Appointment / Tossup / Top Meeting quick actions (set 進行中 on purpose), meeting date passed | 3,100 | left as is; past-dated rows close under the date rule |
| misc | small | |

## Files

- `snapshot_2026-10-02.csv` – all 234,119 open Tasks at export time (~07:20Z) with every date field.
- `build_files.js` – applies the rule and writes the files below (`node build_files.js snapshot_2026-10-02.csv .`).
- `update_A_nodeal.csv` – 230,277 rows, WhatId not Opportunity/Project__c, CallStatus not in an NG list. Load with automation active.
- `update_B_deal.csv` – 3,710 rows: 3,709 linked to Opportunities + 1 with CallStatus 社長拒否(半年NG). Load ONLY with the three flows below paused.
- `canary_update.csv` – 200 rows spread across file A.
- `task_open_rollback.csv` – all 233,987 closed rows with `進行中` (restores the pre-load state).
- `kept_open.csv` – the 132 rows deliberately left open, with the reason.

CSV = UTF-8, CRLF.

## Flows to pause for file B (Tooling PATCH `activeVersionNumber`, URL without leading slash)

| Flow | FlowDefinition Id | Active version | Why |
|---|---|---|---|
| `Task_AfterSave_StampDealLastActivity` | 300RA00001kHKkAYAW | 1 | stamps LastActivityUpdate__c=now + Stalled__c=false on the parent deal for any Task save |
| `ToDo_Account_NG` | 300RA00000sc562YAA | 2 | rewrites Account NGCause__c/NGDate__c when CallStatus is in its list |
| `ToDo_Account_SellCallNG` | 300RA00000qjtTpYAI | 21 | rewrites Account SellCallNGDate__c/Detail for sell-call NG statuses (1 row in file B) |

## Run order (Bogdan runs prod writes with `!` from the project root; absolute paths because the shell cwd moves)

1. Canary:
   `sf data update bulk -o prod --sobject Task --file "G:/My Drive/Claude_projects/Salesforce/jcai-salesforce/scripts/data/task_open_close/canary_update.csv" --wait 5`
2. File A:
   `sf data update bulk -o prod --sobject Task --file "G:/My Drive/Claude_projects/Salesforce/jcai-salesforce/scripts/data/task_open_close/update_A_nodeal.csv" --wait 30`
3. Pause the three flows (activeVersionNumber 0).
4. File B:
   `sf data update bulk -o prod --sobject Task --file "G:/My Drive/Claude_projects/Salesforce/jcai-salesforce/scripts/data/task_open_close/update_B_deal.csv" --wait 10`
5. Re-activate the three flows (versions from the table).
6. Verify: `SELECT COUNT() FROM Task WHERE IsClosed = false` -> 132 (the kept set) at 2026-10-02 ~07:50Z; side-effect checks all 0.

Rollback: load `task_open_rollback.csv` the same way (the before-save normalizer does not touch `進行中`, so no flow pause needed).

## Result (2026-10-02)

| Load | Job | Rows | Failed |
|---|---|---|---|
| Canary | 750RA00001cOt8DYAS | 200 | 0 |
| File A | 750RA00001cLxRiYAK | 230,277 | 2,800 (all `UNABLE_TO_LOCK_ROW`, parallel batches on the same parent Accounts) |
| File A retry (`update_A_retry.csv`, built from `fileA_failed_750RA00001cLxRiYAK.csv`) | 750RA00001cN6uNYAS | 2,800 | 0 |
| File B (3 flows paused, re-activated after) | 750RA00001cP5hFYAS | 3,710 | 0 |

Task table after: 完了 653,104 / 進行中 132. Slack messages, Zoom call logs, Account/Opportunity/Matching edits by the loading user, AsyncApexJob: all 0.
Lesson: for 200k+ Task rows on few parent Accounts, expect lock errors from Bulk API 2.0 parallelism; a retry file of the failed rows (single batch) clears them.
