/**
 * Single custom trigger on Account. Keeps the hidden *_Normalized__c fields in sync
 * for the duplicate matching rules. Logic lives in AccountNormalizationHandler.
 */
trigger AccountTrigger on Account (before insert, before update) {
    AccountNormalizationHandler.beforeSave(Trigger.new);
}
