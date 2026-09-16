// Rehearsal slice of the Account normalization backfill (prod step 3a, 2026-09-16).
// Only accounts modified in the last 7 days (~3,750 records, all three record-type groups mixed),
// so the footprint is small and the results can be spot-checked before the full run.
// Run:  sf apex run --target-org prod --file scripts/apex/run_account_normalization_backfill_slice.apex
// Progress: SELECT Status, JobItemsProcessed, TotalJobItems, NumberOfErrors FROM AsyncApexJob
//           WHERE ApexClass.Name = 'AccountNormalizationBatch' ORDER BY CreatedDate DESC LIMIT 1
Id jobId = Database.executeBatch(new AccountNormalizationBatch('LastModifiedDate = LAST_N_DAYS:7'), 2000);
System.debug(LoggingLevel.INFO, 'AccountNormalizationBatch slice job: ' + jobId);
