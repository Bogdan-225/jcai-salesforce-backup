/**
 * One-off / re-runnable backfill of the hidden Account *_Normalized__c fields.
 *
 * - Computes the normalized values in Apex (same code as the trigger) and updates ONLY the
 *   records whose normalized values differ, so re-running after a partial failure is cheap
 *   and the job is idempotent.
 * - Sets AccountNormalizationHandler.bypass so the trigger does not recompute the same values.
 * - Optional WHERE clause to restrict the run (record type, Id range, sample), e.g.
 *     new AccountNormalizationBatch('RecordTypeId = \'012RA00000AVG7ZYAX\'')
 *     new AccountNormalizationBatch('Id > \'001RA00000000000AAA\'')
 * - Partial-success DML; failures are counted and the first ones are reported by email in finish().
 *
 * Run:  Database.executeBatch(new AccountNormalizationBatch(), 2000);
 */
public with sharing class AccountNormalizationBatch implements Database.Batchable<SObject>, Database.Stateful {

    private static final Integer MAX_ERROR_SAMPLES = 20;

    private final String whereClause;

    public Integer scanned  = 0;
    public Integer updated  = 0;
    public Integer failed   = 0;
    public List<String> errorSamples = new List<String>();

    public AccountNormalizationBatch() {
        this(null);
    }

    public AccountNormalizationBatch(String whereClause) {
        this.whereClause = whereClause;
    }

    public Database.QueryLocator start(Database.BatchableContext bc) {
        String soql = 'SELECT Id, Name, Phone, Website, TDBPostalCode__c, TSRPostalCode__c, CB_Postalcode__c, '
                    + 'CorporateNumber__c, Name_Normalized__c, Phone_Normalized__c, Website_Normalized__c, '
                    + 'Postal_Normalized__c, CorporateNumber_Normalized__c FROM Account';
        if (String.isNotBlank(whereClause)) {
            soql += ' WHERE ' + whereClause;
        }
        return Database.getQueryLocator(soql);
    }

    public void execute(Database.BatchableContext bc, List<Account> scope) {
        scanned += scope.size();
        List<Account> toUpdate = new List<Account>();

        for (Account a : scope) {
            Account n = new Account(Id = a.Id);
            n.Name_Normalized__c            = AccountNormalizer.normalizeName(a.Name);
            n.Phone_Normalized__c           = AccountNormalizer.normalizePhone(a.Phone);
            n.Website_Normalized__c         = AccountNormalizer.normalizeWebsite(a.Website);
            n.Postal_Normalized__c          = AccountNormalizer.normalizePostal(
                                                  a.TDBPostalCode__c, a.TSRPostalCode__c, a.CB_Postalcode__c);
            n.CorporateNumber_Normalized__c = AccountNormalizer.normalizeCorporateNumber(a.CorporateNumber__c);

            if (n.Name_Normalized__c            != a.Name_Normalized__c
             || n.Phone_Normalized__c           != a.Phone_Normalized__c
             || n.Website_Normalized__c         != a.Website_Normalized__c
             || n.Postal_Normalized__c          != a.Postal_Normalized__c
             || n.CorporateNumber_Normalized__c != a.CorporateNumber_Normalized__c) {
                toUpdate.add(n);
            }
        }
        if (toUpdate.isEmpty()) return;

        AccountNormalizationHandler.bypass = true;      // values already computed; skip the trigger
        List<Database.SaveResult> results = Database.update(toUpdate, false);
        AccountNormalizationHandler.bypass = false;

        for (Integer i = 0; i < results.size(); i++) {
            if (results[i].isSuccess()) {
                updated++;
            } else {
                failed++;
                if (errorSamples.size() < MAX_ERROR_SAMPLES) {
                    errorSamples.add(toUpdate[i].Id + ': ' + results[i].getErrors()[0].getMessage());
                }
            }
        }
    }

    public void finish(Database.BatchableContext bc) {
        String body = 'AccountNormalizationBatch finished.\n'
                    + 'Filter: ' + (String.isBlank(whereClause) ? '(all accounts)' : whereClause) + '\n'
                    + 'Scanned: ' + scanned + '\nUpdated: ' + updated + '\nFailed: ' + failed + '\n';
        if (!errorSamples.isEmpty()) {
            body += '\nFirst errors:\n' + String.join(errorSamples, '\n');
        }
        System.debug(LoggingLevel.INFO, body);
        try {
            Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
            mail.setTargetObjectId(UserInfo.getUserId());
            mail.setSaveAsActivity(false);
            mail.setSubject('AccountNormalizationBatch: ' + updated + ' updated, ' + failed + ' failed');
            mail.setPlainTextBody(body);
            Messaging.sendEmail(new List<Messaging.SingleEmailMessage>{ mail });
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Summary email not sent: ' + e.getMessage());
        }
    }
}
