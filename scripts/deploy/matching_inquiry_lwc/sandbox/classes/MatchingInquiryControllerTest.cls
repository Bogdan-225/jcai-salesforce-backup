@IsTest
private class MatchingInquiryControllerTest {

    private static final String BODY_JA = 'M&Aご担当者様\n\n突然のご連絡失礼いたします。';

    /** IS_Buy-profile user with no role: no sharing rule reaches them, so the Project stays sealed. */
    private static User makeIsBuyUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Active__IS_Buy' LIMIT 1];
        String stamp = String.valueOf(Datetime.now().getTime());
        return new User(
            ProfileId = p.Id,
            LastName = 'InquiryTest',
            Alias = 'inqtst',
            Username = 'inquiry.test.' + stamp + '@jcai.example',
            Email = 'inquiry.test@jcai.example',
            TimeZoneSidKey = 'Asia/Tokyo',
            LocaleSidKey = 'ja_JP',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'ja'
        );
    }

    private static Opportunity makeProject() {
        // VR required_website reads SP_Website__c = Account.Website, so the Project needs a seller Account.
        // CorporateNumber__c satisfies the Account VR Required_CorporateNumber (国内 record type).
        Account seller = new Account(Name = 'Inquiry Test Seller', Website = 'https://example.com', CorporateNumber__c = '1234567890123');
        insert seller;
        Id rtId = [SELECT Id FROM RecordType WHERE SObjectType = 'Opportunity' AND DeveloperName = 'SellingOpp' LIMIT 1].Id;
        return new Opportunity(
            Name = 'PJ Inquiry Test',
            AccountId = seller.Id,
            RecordTypeId = rtId,
            StageName = 'DD',                 // a stage hidden from IS by the T-002 rule
            CloseDate = Date.today().addDays(30),
            Inquiry_Company_Ja__c = '株式会社テスト',
            Inquiry_Name_Ja__c = '試験 太郎',
            Inquiry_Email_Ja__c = 'taro@jcai.example',
            Inquiry_Mobile_Ja__c = '09012345678',
            Inquiry_Body_Ja__c = BODY_JA,
            Inquiry_Company_En__c = 'Test Co., Ltd.',
            Inquiry_Email_En__c = 'taro.en@jcai.example',
            Inquiry_Body_En__c = 'Dear M&A team,\nHello.'
        );
    }

    @IsTest
    static void isUserReadsInquiryOfSealedProject() {
        User isUser = makeIsBuyUser();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert isUser;
        }
        Opportunity project = makeProject();
        insert project;
        Matching__c matching = new Matching__c(Sell__c = project.Id, OwnerId = isUser.Id, phase_match__c = 'アプローチ', status__c = '-');
        insert matching;

        MatchingInquiryController.Inquiry result;
        Boolean projectReadable;
        System.runAs(isUser) {
            projectReadable = [
                SELECT RecordId, HasReadAccess FROM UserRecordAccess
                WHERE UserId = :isUser.Id AND RecordId = :project.Id
            ].HasReadAccess;
            Test.startTest();
            result = MatchingInquiryController.getInquiry(matching.Id);
            Test.stopTest();
        }

        System.assertEquals(false, projectReadable, 'Precondition: the Project must be sealed for the IS user');
        System.assertEquals(true, result.hasProject);
        System.assertEquals(MatchingInquiryController.JA_FIELDS.size(), result.ja.size(), 'all JA fields returned (FLS ok)');
        System.assertEquals(MatchingInquiryController.EN_FIELDS.size(), result.en.size(), 'all EN fields returned (FLS ok)');

        Map<String, MatchingInquiryController.FieldValue> ja = new Map<String, MatchingInquiryController.FieldValue>();
        for (MatchingInquiryController.FieldValue fv : result.ja) {
            ja.put(fv.apiName, fv);
        }
        System.assertEquals('株式会社テスト', ja.get('Inquiry_Company_Ja__c').value);
        System.assertEquals(BODY_JA, ja.get('Inquiry_Body_Ja__c').value, 'line breaks preserved');
        System.assertEquals('TEXTAREA', ja.get('Inquiry_Body_Ja__c').type);
        System.assertEquals('STRING', ja.get('Inquiry_Company_Ja__c').type);
        System.assert(String.isNotBlank(ja.get('Inquiry_Company_Ja__c').label), 'label populated');
        System.assertEquals(null, ja.get('Inquiry_Work_Ja__c').value, 'blank field still listed, value null');

        Map<String, String> en = new Map<String, String>();
        for (MatchingInquiryController.FieldValue fv : result.en) {
            en.put(fv.apiName, fv.value);
        }
        System.assertEquals('Test Co., Ltd.', en.get('Inquiry_Company_En__c'));
        System.assertEquals('Dear M&A team,\nHello.', en.get('Inquiry_Body_En__c'));
    }

    @IsTest
    static void matchingNotReadableReturnsEmpty() {
        User isUser = makeIsBuyUser();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert isUser;
        }
        Opportunity project = makeProject();
        insert project;
        // Owned by the admin, OWD Private: the IS user cannot read this Matching.
        Matching__c matching = new Matching__c(Sell__c = project.Id, phase_match__c = 'アプローチ', status__c = '-');
        insert matching;

        MatchingInquiryController.Inquiry result;
        System.runAs(isUser) {
            result = MatchingInquiryController.getInquiry(matching.Id);
        }
        System.assertEquals(false, result.hasProject, 'no Matching access -> nothing exposed');
        System.assertEquals(0, result.ja.size());
    }

    @IsTest
    static void matchingWithoutProjectAndNullId() {
        Matching__c matching = new Matching__c(phase_match__c = 'アプローチ', status__c = '-');
        insert matching;

        MatchingInquiryController.Inquiry result = MatchingInquiryController.getInquiry(matching.Id);
        System.assertEquals(false, result.hasProject);
        System.assertEquals(0, result.en.size());

        System.assertEquals(false, MatchingInquiryController.getInquiry(null).hasProject);
    }
}
