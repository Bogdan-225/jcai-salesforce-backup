/**
 * Read-only list of files attached to a record, for the recordFilesReadOnly LWC.
 * Runs with sharing so users only see files they can already access.
 */
public with sharing class RecordFilesController {

    public class FileItem {
        @AuraEnabled public String id;
        @AuraEnabled public String title;
        @AuraEnabled public String fileType;
        @AuraEnabled public Integer contentSize;
        @AuraEnabled public Datetime lastModified;
    }

    @AuraEnabled(cacheable=true)
    public static List<FileItem> getFiles(Id recordId, Integer maxRows) {
        if (recordId == null) {
            return new List<FileItem>();
        }
        Integer lim = (maxRows == null || maxRows < 1 || maxRows > 200) ? 50 : maxRows;

        List<FileItem> items = new List<FileItem>();
        for (ContentDocumentLink cdl : [
            SELECT ContentDocumentId,
                   ContentDocument.Title,
                   ContentDocument.FileType,
                   ContentDocument.FileExtension,
                   ContentDocument.ContentSize,
                   ContentDocument.LastModifiedDate
            FROM ContentDocumentLink
            WHERE LinkedEntityId = :recordId
            ORDER BY ContentDocument.LastModifiedDate DESC
            LIMIT :lim
        ]) {
            FileItem fi = new FileItem();
            fi.id = cdl.ContentDocumentId;
            fi.title = cdl.ContentDocument.Title;
            fi.fileType = String.isNotBlank(cdl.ContentDocument.FileExtension)
                ? cdl.ContentDocument.FileExtension
                : cdl.ContentDocument.FileType;
            fi.contentSize = cdl.ContentDocument.ContentSize;
            fi.lastModified = cdl.ContentDocument.LastModifiedDate;
            items.add(fi);
        }
        return items;
    }
}
