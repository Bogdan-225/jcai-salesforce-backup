trigger SF_CreateVoiceCallTrigger on ZVC__Zoom_Call_Log__c (after insert, after update) {
    
    for (ZVC__Zoom_Call_Log__c triggerRecord : Trigger.new) {
        if (Trigger.isAfter && Trigger.isInsert) {
            if (
                String.isNotBlank(triggerRecord.ZVC__Call_ID__c) && 
                String.isNotBlank(triggerRecord.ZVC__Recording__c)
            ) {
                SF_CreateVoiceCallWithZoomPhoneRecording.createVoiceCalls(triggerRecord.Id);            
            }            
        }

        if (Trigger.isAfter && Trigger.isUpdate) {
            ZVC__Zoom_Call_Log__c oldZoomCallLog = Trigger.oldMap.get(triggerRecord.Id);

            if (
                String.isNotBlank(triggerRecord.ZVC__Call_ID__c) &&
                String.isNotBlank(triggerRecord.ZVC__Recording__c) &&
                String.isBlank(oldZoomCallLog.ZVC__Recording__c)
            ) {
                SF_CreateVoiceCallWithZoomPhoneRecording.createVoiceCalls(triggerRecord.Id);            
            }
        }        
    }
}