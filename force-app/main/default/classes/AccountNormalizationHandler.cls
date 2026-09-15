/**
 * Trigger handler: fills the hidden Account *_Normalized__c fields before insert / update.
 * Skipped when the running user holds the Bypass_Account_Normalization custom permission
 * or when the static `bypass` flag is set programmatically.
 */
public with sharing class AccountNormalizationHandler {

    /** Programmatic bypass for the current transaction (tests, controlled loads). */
    public static Boolean bypass = false;

    public static final String BYPASS_PERMISSION = 'Bypass_Account_Normalization';

    public static void beforeSave(List<Account> records) {
        if (bypass || FeatureManagement.checkPermission(BYPASS_PERMISSION)) {
            return;
        }
        for (Account a : records) {
            apply(a);
        }
    }

    /** Computes all five normalized values on the in-memory record. No DML. */
    public static void apply(Account a) {
        a.Name_Normalized__c            = AccountNormalizer.normalizeName(a.Name);
        a.Phone_Normalized__c           = AccountNormalizer.normalizePhone(a.Phone);
        a.Website_Normalized__c         = AccountNormalizer.normalizeWebsite(a.Website);
        a.Postal_Normalized__c          = AccountNormalizer.normalizePostal(
                                              a.TDBPostalCode__c, a.TSRPostalCode__c, a.CB_Postalcode__c);
        a.CorporateNumber_Normalized__c = AccountNormalizer.normalizeCorporateNumber(a.CorporateNumber__c);
    }
}
