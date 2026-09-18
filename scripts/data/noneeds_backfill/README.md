# No Needs buyer-flag backfill (2026-09-18)

Historical counterpart of flow Matching_Drop_NoNeeds_Buyer_NoNeeds_Flag (live 2026-09-17).
Source: 2,111 Matching__c rows with phase_match__c = マッチ終了, termination_reason__c INCLUDES M&Aニーズなし, Buy_Company__c set
-> 1,958 distinct buyer accounts -> 1,947 need a flag ticked (11 cb / 4 fd already set).
Rule = same as flow: seller Account RT International (or seller acc null + XBorderType opp) -> cb_M_Aneeds__c, else fd_M_Aneeds__c.

Files
- account_noneeds_update.csv   1,947 rows; blank cell = leave unchanged (Bulk API 2.0); CRLF line endings required by sf CLI on Windows (LF fails with "LineEnding is invalid"), so the other flag is never overwritten.
- account_noneeds_rollback.csv same rows with `false` in the cells the update sets (restores the 2026-09-18 snapshot).
- canary_update.csv            first 3 rows of the update.
- snapshot_byAccount_2026-09-18.json  pre-update flag state per account.

Run from the project root (prod writes are blocked from Claude's Bash):
    sf data update bulk -o prod --sobject Account --file scripts/data/noneeds_backfill/canary_update.csv --wait 5
    sf data update bulk -o prod --sobject Account --file scripts/data/noneeds_backfill/account_noneeds_update.csv --wait 15
Rollback if needed:
    sf data update bulk -o prod --sobject Account --file scripts/data/noneeds_backfill/account_noneeds_rollback.csv --wait 15
