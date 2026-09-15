@IsTest
private class AccountTriggerTest {

    private static final Id DOMESTIC_RT = Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName()
        .get('MasterRecordType').getRecordTypeId();
    private static final Id INTL_RT = Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName()
        .get('International').getRecordTypeId();

    private static Account one(Id accId) {
        return [SELECT Id, Name_Normalized__c, Phone_Normalized__c, Website_Normalized__c,
                       Postal_Normalized__c, CorporateNumber_Normalized__c
                FROM Account WHERE Id = :accId];
    }

    private static List<Account> many(List<Account> accs) {
        return [SELECT Id, Name_Normalized__c, Phone_Normalized__c, Website_Normalized__c,
                       Postal_Normalized__c, CorporateNumber_Normalized__c
                FROM Account WHERE Id IN :accs ORDER BY Name];
    }

    @IsTest
    static void insertDomestic_fillsAllNormalizedFields() {
        // Validation rule Required_CorporateNumber needs a corporate number on new domestic accounts
        Account a = new Account(
            RecordTypeId = DOMESTIC_RT,
            Name = '株式会社バイヤーテスト',
            Phone = '03-3603-2251',
            Website = 'https://www.iij.ad.jp/',
            TDBPostalCode__c = '051-0023',
            CorporateNumber__c = '030001026885'          // 12 digits, check digit missing
        );
        insert a;

        Account r = one(a.Id);
        System.assertEquals('バイヤーテスト', r.Name_Normalized__c);
        System.assertEquals('81336032251', r.Phone_Normalized__c);
        System.assertEquals('iij.ad.jp', r.Website_Normalized__c);
        System.assertEquals('0510023', r.Postal_Normalized__c);
        System.assertEquals('7030001026885', r.CorporateNumber_Normalized__c);
    }

    @IsTest
    static void insertInternational_usesCbPostalAndNullsPlaceholders() {
        Account a = new Account(
            RecordTypeId = INTL_RT,
            Name = 'Anhui Anjia Automobile Sales Service Co., Ltd.',
            Phone = '+--',
            Website = 'None',
            CB_Postalcode__c = '23003-1'
        );
        insert a;

        Account r = one(a.Id);
        System.assertEquals('anhuianjiaautomobilesalesservice', r.Name_Normalized__c);
        System.assertEquals(null, r.Phone_Normalized__c);
        System.assertEquals(null, r.Website_Normalized__c);
        System.assertEquals('230031', r.Postal_Normalized__c);
        System.assertEquals(null, r.CorporateNumber_Normalized__c);
    }

    @IsTest
    static void update_recomputesAndClearsWhenSourceEmptied() {
        Account a = new Account(
            RecordTypeId = DOMESTIC_RT,
            Name = 'Buyer Test inc.',
            Phone = '+81-3-3603-2251',
            CorporateNumber__c = '7030001026885'
        );
        insert a;

        a.Name = 'Americana Ltd';
        a.Phone = null;
        a.Website = 'www.americana.co.jp';
        update a;

        Account r = one(a.Id);
        System.assertEquals('americana', r.Name_Normalized__c);
        System.assertEquals(null, r.Phone_Normalized__c, 'emptied source must clear the normalized value');
        System.assertEquals('americana.co.jp', r.Website_Normalized__c);
    }

    @IsTest
    static void jpAndEnNamesShareKeysOnPhoneAndWebsite() {
        // the JP/EN pair cannot match on name; phone + website must give identical keys
        List<Account> pair = new List<Account>{
            new Account(RecordTypeId = DOMESTIC_RT, Name = '株式会社インターネットイニシアティブ',
                        Phone = '03-5205-6500', Website = 'https://www.iij.ad.jp/', CorporateNumber__c = '7010001034191'),
            new Account(RecordTypeId = DOMESTIC_RT, Name = 'Internet Initiative Japan Inc.',
                        Phone = '+81-3-5205-6500', Website = 'iij.ad.jp', CorporateNumber__c = '7010001034191')
        };
        insert pair;

        List<Account> r = many(pair);
        System.assertNotEquals(r[0].Name_Normalized__c, r[1].Name_Normalized__c);
        System.assertEquals(r[0].Phone_Normalized__c, r[1].Phone_Normalized__c);
        System.assertEquals(r[0].Website_Normalized__c, r[1].Website_Normalized__c);
        System.assertEquals(r[0].CorporateNumber_Normalized__c, r[1].CorporateNumber_Normalized__c);
    }

    @IsTest
    static void bulkInsert_200Records() {
        List<Account> accs = new List<Account>();
        for (Integer i = 0; i < 200; i++) {
            accs.add(new Account(RecordTypeId = INTL_RT, Name = 'Bulk Co ' + i,
                                 Phone = '+1 415 670 ' + String.valueOf(2000 + i).leftPad(4, '0'),
                                 Website = 'www.bulk' + i + '.com'));
        }
        Test.startTest();
        insert accs;
        Test.stopTest();

        Integer filled = [SELECT COUNT() FROM Account WHERE Name_Normalized__c != null
                          AND Phone_Normalized__c != null AND Website_Normalized__c != null];
        System.assertEquals(200, filled);
    }

    @IsTest
    static void staticBypass_skipsNormalization() {
        AccountNormalizationHandler.bypass = true;
        Account a = new Account(RecordTypeId = INTL_RT, Name = 'Bypass Test Inc.', Phone = '+1 415 670 2000');
        insert a;
        AccountNormalizationHandler.bypass = false;

        Account r = one(a.Id);
        System.assertEquals(null, r.Name_Normalized__c);
        System.assertEquals(null, r.Phone_Normalized__c);
    }

    @IsTest
    static void customPermissionBypass_skipsNormalization() {
        // user with the Account_Normalization_Bypass permission set -> trigger does nothing
        User u = new User(
            Alias = 'bypass', Email = 'bypass@example.com', Username = 'bypass.' + System.now().getTime() + '@example.com',
            LastName = 'Bypass', ProfileId = UserInfo.getProfileId(),
            EmailEncodingKey = 'UTF-8', LanguageLocaleKey = 'ja', LocaleSidKey = 'ja_JP', TimeZoneSidKey = 'Asia/Tokyo'
        );
        // setup-object DML inside runAs avoids MIXED_DML with the Account insert below
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert u;
            PermissionSet ps = [SELECT Id FROM PermissionSet WHERE Name = 'Account_Normalization_Bypass' LIMIT 1];
            insert new PermissionSetAssignment(AssigneeId = u.Id, PermissionSetId = ps.Id);
        }

        Account a = new Account(RecordTypeId = INTL_RT, Name = 'Perm Bypass Inc.', Phone = '+1 415 670 2000');
        System.runAs(u) {
            System.assert(FeatureManagement.checkPermission(AccountNormalizationHandler.BYPASS_PERMISSION));
            insert a;
        }

        Account r = one(a.Id);
        System.assertEquals(null, r.Name_Normalized__c);
        System.assertEquals(null, r.Phone_Normalized__c);
    }
}
