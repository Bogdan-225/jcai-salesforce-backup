// Backfill of the hidden Account *_Normalized__c fields.
// Run:  sf apex run --target-org <alias> --file scripts/apex/run_account_normalization_backfill.apex
// Progress: Setup > Apex Jobs, or
//   SELECT Status, JobItemsProcessed, TotalJobItems, NumberOfErrors FROM AsyncApexJob WHERE ApexClass.Name = 'AccountNormalizationBatch' ORDER BY CreatedDate DESC LIMIT 1
// Restrict a run with a WHERE clause, e.g. new AccountNormalizationBatch('RecordTypeId = \'012RA00000AVG7ZYAX\'')
Id jobId = Database.executeBatch(new AccountNormalizationBatch(), 2000);
System.debug(LoggingLevel.INFO, 'AccountNormalizationBatch job: ' + jobId);
