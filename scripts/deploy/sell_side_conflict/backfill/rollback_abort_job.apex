// Rollback: abort the daily job "SellSideConflict Daily".
for (CronTrigger ct : [SELECT Id FROM CronTrigger WHERE CronJobDetail.Name = 'SellSideConflict Daily']) {
    System.abortJob(ct.Id);
    System.debug('Aborted CronTrigger ' + ct.Id);
}
