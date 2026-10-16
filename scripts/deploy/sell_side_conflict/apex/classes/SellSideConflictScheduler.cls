/**
 * Daily job (05:00 JST = 20:00 UTC) that recomputes Account.SellSideConflict__c for all accounts.
 * Schedule once per org with anonymous Apex:
 *   System.schedule('SellSideConflict Daily', '0 0 20 * * ?', new SellSideConflictScheduler());
 */
public without sharing class SellSideConflictScheduler implements Schedulable {
    public void execute(SchedulableContext sc) {
        Integer updated = SellSideConflictRecalculator.recalculateAll();
        System.debug(LoggingLevel.INFO, 'SellSideConflictScheduler updated ' + updated + ' accounts');
    }
}
