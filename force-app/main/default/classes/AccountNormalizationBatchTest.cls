@IsTest
private class AccountNormalizationBatchTest {

    private static final Id DOMESTIC_RT = Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName()
        .get('MasterRecordType').getRecordTypeId();
    private static final Id INTL_RT = Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName()
        .get('International').getRecordTypeId();

    /** Inserts accounts with the trigger bypassed, i.e. the way existing prod data looks (normalized fields empty). */
    @TestSetup
    static void makeUnnormalizedData() {
        List<Account> accs = new List<Account>();
        for (Integer i = 0; i < 150; i++) {
            accs.add(new Account(RecordTypeId = DOMESTIC_RT, Name = '株式会社テスト' + i,
                                 Phone = '03-3603-' + String.valueOf(1000 + i),
                                 Website = 'https://www.test' + i + '.co.jp/',
                                 TDBPostalCode__c = '100-00' + String.valueOf(i).leftPad(2, '0'),
                                 CorporateNumber__c = '7030001026885'));
        }
        for (Integer i = 0; i < 150; i++) {
            accs.add(new Account(RecordTypeId = INTL_RT, Name = 'Intl Test ' + i + ' Ltd.',
                                 Phone = (Math.mod(i, 2) == 0) ? '+--' : '+1 415 670 ' + String.valueOf(2000 + i),
                                 Website = (Math.mod(i, 3) == 0) ? 'None' : 'www.intl' + i + '.com',
                                 CB_Postalcode__c = '51800-' + Math.mod(i, 10)));
        }
        AccountNormalizationHandler.bypass = true;
        insert accs;
        AccountNormalizationHandler.bypass = false;
    }

    @IsTest
    static void backfillsAllAccounts() {
        System.assertEquals(300, [SELECT COUNT() FROM Account WHERE Name_Normalized__c = null],
                            'precondition: data is unnormalized');

        Test.startTest();
        Database.executeBatch(new AccountNormalizationBatch(), 300);
        Test.stopTest();

        System.assertEquals(0, [SELECT COUNT() FROM Account WHERE Name_Normalized__c = null]);
        System.assertEquals(150, [SELECT COUNT() FROM Account WHERE CorporateNumber_Normalized__c = '7030001026885']);
        System.assertEquals(150, [SELECT COUNT() FROM Account WHERE Postal_Normalized__c LIKE '10000%']);
        // placeholders stayed null
        System.assertEquals(75, [SELECT COUNT() FROM Account WHERE RecordTypeId = :INTL_RT AND Phone_Normalized__c = null]);
        System.assertEquals(50, [SELECT COUNT() FROM Account WHERE RecordTypeId = :INTL_RT AND Website_Normalized__c = null]);

        Account sample = [SELECT Name_Normalized__c, Phone_Normalized__c, Website_Normalized__c, Postal_Normalized__c
                          FROM Account WHERE Name = '株式会社テスト7' LIMIT 1];
        System.assertEquals('テスト7', sample.Name_Normalized__c);
        System.assertEquals('81336031007', sample.Phone_Normalized__c);
        System.assertEquals('test7.co.jp', sample.Website_Normalized__c);
        System.assertEquals('1000007', sample.Postal_Normalized__c);
    }

    @IsTest
    static void whereClauseRestrictsScope() {
        Test.startTest();
        Database.executeBatch(new AccountNormalizationBatch('RecordTypeId = \'' + INTL_RT + '\''), 200);
        Test.stopTest();

        System.assertEquals(150, [SELECT COUNT() FROM Account WHERE RecordTypeId = :DOMESTIC_RT AND Name_Normalized__c = null],
                            'domestic accounts must be untouched');
        System.assertEquals(0, [SELECT COUNT() FROM Account WHERE RecordTypeId = :INTL_RT AND Name_Normalized__c = null]);
    }

    @IsTest
    static void secondRunUpdatesNothing() {
        // first pass: normalize everything synchronously through the trigger
        List<Account> all = [SELECT Id FROM Account];
        update all;
        Datetime before = [SELECT LastModifiedDate FROM Account ORDER BY LastModifiedDate DESC LIMIT 1].LastModifiedDate;

        Test.startTest();
        Database.executeBatch(new AccountNormalizationBatch(), 300);
        Test.stopTest();

        // nothing changed -> the batch skipped every record (no DML), so LastModifiedDate did not move
        Datetime after = [SELECT LastModifiedDate FROM Account ORDER BY LastModifiedDate DESC LIMIT 1].LastModifiedDate;
        System.assertEquals(before, after, 'idempotent: already-normalized records must not be updated again');
    }
}
