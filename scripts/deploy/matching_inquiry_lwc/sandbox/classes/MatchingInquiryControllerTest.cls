@IsTest
private class MatchingInquiryControllerTest {

    private static final String BODY_JA = 'M&Aご担当者様\n\n突然のご連絡失礼いたします。';

    /**
     * Existing active IS_Buy-profile users. We do not insert a test user: prod has no free
     * Salesforce license, so a User insert fails there with LICENSE_LIMIT_EXCEEDED.
     */
    private static List<User> isBuyUsers() {
        return [
            SELECT Id, UserRoleId FROM User
            WHERE Profile.Name = 'Active__IS_Buy' AND IsActive = true
            ORDER BY CreatedDate
            LIMIT 2
        ];
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
            StageName = 'DD',                 // a stage hidden from IS while the T-002 rule is on
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

    private static Matching__c makeMatching(Id projectId, Id ownerId) {
        return new Matching__c(Sell__c = projectId, OwnerId = ownerId, phase_match__c = 'アプローチ', status__c = '-');
    }

    private static Boolean canRead(Id userId, Id recordId) {
        return [SELECT RecordId, HasReadAccess FROM UserRecordAccess WHERE UserId = :userId AND RecordId = :recordId].HasReadAccess;
    }

    @IsTest
    static void isUserReadsInquiryThroughOwnMatching() {
        List<User> users = isBuyUsers();
        if (users.isEmpty()) {
            System.debug('No active IS_Buy user in this org, test skipped');
            return;
        }
        User isUser = users[0];
        Opportunity project = makeProject();
        insert project;
        Matching__c matching = makeMatching(project.Id, isUser.Id);   // owner -> always readable
        insert matching;

        MatchingInquiryController.Inquiry result;
        Boolean projectReadable;
        System.runAs(isUser) {
            projectReadable = canRead(isUser.Id, project.Id);
            Test.startTest();
            result = MatchingInquiryController.getInquiry(matching.Id);
            Test.stopTest();
        }
        // While the T-002 criteria rule is on, a DD project is sealed for IS and this proves the
        // without-sharing read. While the rule is widened (T-002 off) the project is readable anyway.
        System.debug('Project sealed for IS user: ' + !projectReadable);

        System.assertEquals(true, result.hasProject);
        System.assertEquals('PJ Inquiry Test', result.projectName);
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

        Map<String, String> en = new Map<String, String>();
        for (MatchingInquiryController.FieldValue fv : result.en) {
            en.put(fv.apiName, fv.value);
        }
        System.assertEquals('Test Co., Ltd.', en.get('Inquiry_Company_En__c'));
        System.assertEquals('Dear M&A team,\nHello.', en.get('Inquiry_Body_En__c'));
    }

    @IsTest
    static void matchingNotReadableReturnsEmpty() {
        List<User> users = isBuyUsers();
        if (users.size() < 2) {
            System.debug('Fewer than two active IS_Buy users, test skipped');
            return;
        }
        User isUser = users[0];
        Opportunity project = makeProject();
        insert project;
        // Owned by a peer in the same role: no sharing rule shares IS_Buy-owned Matchings to IS_Buy,
        // and peers are not above each other in the role hierarchy.
        Matching__c matching = makeMatching(project.Id, users[1].Id);
        insert matching;

        MatchingInquiryController.Inquiry result;
        Boolean matchingReadable;
        System.runAs(isUser) {
            matchingReadable = canRead(isUser.Id, matching.Id);
            result = MatchingInquiryController.getInquiry(matching.Id);
        }
        if (matchingReadable) {
            // Sharing setup changed: the gate cannot be proven with this data, but nothing must break.
            System.debug('Peer Matching readable in this org, gate not provable here');
            System.assertEquals(true, result.hasProject);
        } else {
            System.assertEquals(false, result.hasProject, 'no Matching access -> nothing exposed');
            System.assertEquals(0, result.ja.size());
            System.assertEquals(0, result.en.size());
        }
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
