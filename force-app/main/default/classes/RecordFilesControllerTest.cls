@IsTest
private class RecordFilesControllerTest {

    // Inserting a ContentVersion auto-creates a ContentDocumentLink to the owner (running user),
    // so we can test against the user record without touching Account/Opportunity validation rules.
    @IsTest
    static void returnsFilesLinkedToRecord() {
        ContentVersion cv = new ContentVersion(
            Title = 'Test File',
            PathOnClient = 'test_file.pdf',
            VersionData = Blob.valueOf('hello'),
            IsMajorVersion = true,
            DocType__c = 'IM'
        );
        insert cv;

        Test.startTest();
        List<RecordFilesController.FileItem> items =
            RecordFilesController.getFiles(UserInfo.getUserId(), 20);
        Test.stopTest();

        System.assertEquals(1, items.size(), 'Expected exactly one file linked to the running user');
        System.assertEquals('Test File', items[0].title);
        System.assertEquals('pdf', items[0].fileType);
        System.assertEquals('IM', items[0].docType, 'Document type of the latest version expected');
        System.assertNotEquals(null, items[0].id);
        System.assertNotEquals(null, items[0].lastModified);
    }

    @IsTest
    static void returnsEmptyForNullIdAndUsesDefaultLimit() {
        System.assertEquals(0, RecordFilesController.getFiles(null, null).size());
        System.assertEquals(0, RecordFilesController.getFiles(UserInfo.getUserId(), null).size());
        System.assertEquals(0, RecordFilesController.getFiles(UserInfo.getUserId(), 999).size());
    }
}
