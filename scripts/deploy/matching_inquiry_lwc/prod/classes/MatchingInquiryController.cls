/**
 * Inquiry Message of the Project (Opportunity) behind a Matching, for the matchingInquiryMessage LWC.
 *
 * Why part of this runs without sharing: IS roles must read the inquiry text (the outreach message)
 * even for deals that the IS_Buy_PreTopMtg_Read sharing rule hides from them. This class exposes
 * only the Inquiry_* fields listed below, read-only, and only for a Matching the running user can
 * read (that query runs WITH sharing). Field-level security is still enforced with stripInaccessible.
 */
public with sharing class MatchingInquiryController {

    public static final List<String> JA_FIELDS = new List<String>{
        'Inquiry_Company_Ja__c', 'Inquiry_Name_Ja__c', 'Inquiry_Spelling_Ja__c', 'Inquiry_Email_Ja__c',
        'Inquiry_Mobile_Ja__c', 'Inquiry_Work_Ja__c', 'Inquiry_Postalcode_Ja__c', 'Inquiry_Address_Ja__c',
        'Inquiry_Department_Ja__c', 'Inquiry_Title_Ja__c', 'Inquiry_Subject_Ja__c', 'Inquiry_Body_Ja__c'
    };
    public static final List<String> EN_FIELDS = new List<String>{
        'Inquiry_Company_En__c', 'Inquiry_Name_En__c', 'Inquiry_Email_En__c', 'Inquiry_Mobile_En__c',
        'Inquiry_Work_En__c', 'Inquiry_Postalcode_En__c', 'Inquiry_Address_En__c', 'Inquiry_Department_En__c',
        'Inquiry_Title_En__c', 'Inquiry_Subject_En__c', 'Inquiry_Body_En__c'
    };

    public class FieldValue {
        @AuraEnabled public String apiName;
        @AuraEnabled public String label;
        @AuraEnabled public String value;
        @AuraEnabled public String type;   // STRING | EMAIL | PHONE | TEXTAREA
    }

    public class Inquiry {
        @AuraEnabled public Boolean hasProject = false;
        @AuraEnabled public String projectName;
        @AuraEnabled public List<FieldValue> ja = new List<FieldValue>();
        @AuraEnabled public List<FieldValue> en = new List<FieldValue>();
    }

    @AuraEnabled(cacheable=true)
    public static Inquiry getInquiry(Id matchingId) {
        Inquiry result = new Inquiry();
        if (matchingId == null) {
            return result;
        }
        // With sharing: the user must be able to read the Matching itself.
        List<Matching__c> matchings = [SELECT Id, Sell__c FROM Matching__c WHERE Id = :matchingId LIMIT 1];
        if (matchings.isEmpty() || matchings[0].Sell__c == null) {
            return result;
        }

        List<String> allFields = new List<String>();
        allFields.addAll(JA_FIELDS);
        allFields.addAll(EN_FIELDS);
        Opportunity project = new ProjectReader().read(matchings[0].Sell__c, allFields);
        if (project == null) {
            return result;
        }

        // FLS: drop any Inquiry field the running user may not read.
        SObjectAccessDecision decision = Security.stripInaccessible(
            AccessType.READABLE, new List<Opportunity>{ project }
        );
        Opportunity safe = (Opportunity) decision.getRecords()[0];
        Set<String> removed = decision.getRemovedFields().containsKey('Opportunity')
            ? decision.getRemovedFields().get('Opportunity')
            : new Set<String>();

        result.hasProject = true;
        result.projectName = removed.contains('Name') ? null : safe.Name;
        Map<String, Schema.SObjectField> fieldMap = Schema.SObjectType.Opportunity.fields.getMap();
        result.ja = toFieldValues(safe, JA_FIELDS, removed, fieldMap);
        result.en = toFieldValues(safe, EN_FIELDS, removed, fieldMap);
        return result;
    }

    private static List<FieldValue> toFieldValues(
        Opportunity rec, List<String> apiNames, Set<String> removed, Map<String, Schema.SObjectField> fieldMap
    ) {
        List<FieldValue> out = new List<FieldValue>();
        for (String apiName : apiNames) {
            if (removed.contains(apiName) || !fieldMap.containsKey(apiName.toLowerCase())) {
                continue;
            }
            Schema.DescribeFieldResult dfr = fieldMap.get(apiName.toLowerCase()).getDescribe();
            FieldValue fv = new FieldValue();
            fv.apiName = apiName;
            fv.label = dfr.getLabel();
            fv.value = (String) rec.get(apiName);
            fv.type = String.valueOf(dfr.getType());
            out.add(fv);
        }
        return out;
    }

    /** Reads the Project regardless of record sharing. Only the fixed Inquiry field list is ever queried. */
    private without sharing class ProjectReader {
        private Opportunity read(Id projectId, List<String> apiNames) {
            String soql = 'SELECT Id, Name, ' + String.join(apiNames, ', ')
                + ' FROM Opportunity WHERE Id = :projectId LIMIT 1';
            List<Opportunity> rows = Database.query(soql);
            return rows.isEmpty() ? null : rows[0];
        }
    }
}
