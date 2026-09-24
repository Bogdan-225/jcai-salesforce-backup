# NN/IM pass reason -> Drop Reason Comments migration (built 2026-09-24)

Task: 「マッチングのステータスを変更して移行してから項目削除」
Old fields NNPassReason__c (Teaser Pass Reason) / IMPassReason__c (IM Pass Reason) are being retired.
Their free text moves into other_termination_reason__c (Drop Reason Comments) and termination_reason__c (Drop Reason) is set to その他.

Scope (decided with Bogdan 2026-09-24)
- Every Matching__c at Stage phase_match__c = マッチ終了 with NN or IM text -> 1,678 rows
  (NN>終了 1,322 / アプローチ>終了 321 / IM>終了 35). Status is NOT changed: Stage=Drop is what matters.
- Comment = exact source text (trimmed), overwriting the June-2025 placeholder 移行データのため詳細は活動履歴を確認.
- Source text ※一括インポート (132 rows) -> comment 理由記載なし.
- No record has both NN and IM filled, so the "skip if IM has value" rule never applies.
- 45 records with NN text at open stages (アプローチ 34 / NN準備 10 / MOU/LOI 1) are HELD BACK -> held_back_open_stage.csv, pending confirmation.

Files
- snapshot_2026-09-24.json           raw prod export of all 1,723 rows with NN/IM text (before any change)
- build_drop_reason_csvs.js          rebuilds the CSVs below from the snapshot
- matching_drop_reason_update.csv    1,678 rows: Id, termination_reason__c, other_termination_reason__c (UTF-8, CRLF)
- matching_drop_reason_rollback.csv  same Ids with ORIGINAL values; #N/A = set back to null (Bulk API 2.0)
- canary_update.csv                  3 rows, one per status group, real text (not the marker)
- held_back_open_stage.csv           the 45 open-stage records, for review

Automation check (all 8 record-triggered flows on Matching__c reviewed)
- Fires on this load: MatchingOBEditingActions (scheduled path 1 min after save, dedup DELETE + Account counters) -> PAUSE during load.
  Matching_Opportunity_CheckStage / Matching_Project_CheckStage / RecomputeDealConflict: idempotent flags only, left on.
- Does NOT fire: AutoDate_Status_Date (status unchanged), Drop_NoNeeds flag (reason is その他), MatchingAndOppSamePhase, MatchingAndTodo.
- Validation rules satisfied: termination_reason_required, other_reason_required (その他 needs a comment -> always filled).

Run order (prod writes must be run by the user with the ! prefix)
1. Pause dedup flow (FlowDefinition 300BL00000004R2YAI, active v13):
   sf api request rest services/data/v62.0/tooling/sobjects/FlowDefinition/300BL00000004R2YAI -X PATCH -o prod --body "{\"Metadata\":{\"activeVersionNumber\":0}}"
2. Canary:
   sf data update bulk -o prod --sobject Matching__c --file scripts/data/drop_reason_migration/canary_update.csv --wait 5
   -> verify 3 records in UI, then
3. Full load:
   sf data update bulk -o prod --sobject Matching__c --file scripts/data/drop_reason_migration/matching_drop_reason_update.csv --wait 10
4. Resume dedup flow:
   sf api request rest services/data/v62.0/tooling/sobjects/FlowDefinition/300BL00000004R2YAI -X PATCH -o prod --body "{\"Metadata\":{\"activeVersionNumber\":13}}"
5. Verify (read-only, Claude runs): count rows where Stage=マッチ終了 AND (NN or IM text) AND comment != expected -> must be 0.

Rollback: sf data update bulk -o prod --sobject Matching__c --file scripts/data/drop_reason_migration/matching_drop_reason_rollback.csv --wait 10

Field deletion afterwards (separate step, after data verified)
- Delete dead VRs MustFillNNReason / MustFillIMReason (reference inactive Stage values NN見送り / IM見送り)
- Remove the 2 columns from list view PJ_sample_aproach
- Remove both fields from layout Matching__c-新規作成時 (still on it)
- Reports: Salesforce lists them at delete time; deleted fields stay in the recycle bin 15 days
- Formulas NNEndNumber__c / IMEndNumber__c also reference the inactive Stage values (dead, optional cleanup)

## Result (run 2026-09-24, all prod writes by Bogdan via !)
- Dedup flow MatchingOBEditingActions paused (activeVersionNumber 0) before any write.
- Canary job 750RA00001aXlFqYAK: 3/3 OK.
- Full job 750RA00001aVnwtYAC: 1,678 processed, 236 failed (233 rows + the 3 canaries).
  Cause: Matching_Opportunity_CheckStage updates the parent Opportunity on every Matching save; some Opportunities
  fail their own VR ("Please check all items in the [Final Confirmation] checklist"). In bulk, one bad Opportunity
  fails the whole flow chunk, so healthy rows failed too. Failed rows untouched (job_750RA00001aVnwtYAC_failed.csv).
- Fix: paused Matching_Opportunity_CheckStage (300RA00001G6EgDYAV v2) and Matching_Project_CheckStage (300RA00001G6sTsYAJ v1),
  retried the 233 rows (matching_drop_reason_retry.csv) -> job 750RA00001aZUZ3YAO: 233/233 OK.
- Verification: all 1,678 in-scope rows equal the update CSV (verify_after_retry.json). 0 mismatches.
- All 3 flows re-activated (v2 / v1 / v13) and confirmed via FlowDefinition query.
- Still open: 45 open-stage records (held_back_open_stage.csv) pending Bogdan's confirmation; field deletion step.
