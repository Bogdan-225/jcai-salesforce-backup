/**
 * Daily job (05:00 JST = 20:00 UTC) that recomputes Account.SellSideConflict__c for all accounts.
 * Schedule once per org with anonymous Apex:
 *   // 05:00 in the scheduling user's time zone (Bogdan = Asia/Tokyo) = 20:00 UTC, same slot as Opportunity_Scheduled_RecomputeStalled
 *   System.schedule('SellSideConflict Daily', '0 0 5 * * ?', new SellSideConflictScheduler());
 */
public without sharing class SellSideConflictScheduler implements Schedulable {
    public void execute(SchedulableContext sc) {
        Integer updated = SellSideConflictRecalculator.recalculateAll();
        System.debug(LoggingLevel.INFO, 'SellSideConflictScheduler updated ' + updated + ' accounts');
    }
}
