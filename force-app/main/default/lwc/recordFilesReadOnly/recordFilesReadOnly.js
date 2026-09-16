import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getFiles from '@salesforce/apex/RecordFilesController.getFiles';

export default class RecordFilesReadOnly extends NavigationMixin(LightningElement) {
    @api recordId;
    @api title = 'Files';
    @api pageSize = 20;

    files = [];
    error;
    loaded = false;

    @wire(getFiles, { recordId: '$recordId', maxRows: '$pageSize' })
    wiredFiles({ error, data }) {
        this.loaded = true;
        if (data) {
            this.error = undefined;
            this.files = data.map((f) => ({
                id: f.id,
                title: f.title,
                docType: f.docType || '',
                type: (f.fileType || '').toUpperCase(),
                modified: f.lastModified
            }));
        } else if (error) {
            this.files = [];
            this.error = error.body && error.body.message ? error.body.message : JSON.stringify(error);
        }
    }

    get headerTitle() {
        return `${this.title} (${this.files.length})`;
    }

    get hasFiles() {
        return this.files.length > 0;
    }

    get showEmpty() {
        return this.loaded && !this.error && !this.hasFiles;
    }

    handleOpen(event) {
        event.preventDefault();
        const id = event.currentTarget.dataset.id;
        this[NavigationMixin.Navigate]({
            type: 'standard__namedPage',
            attributes: { pageName: 'filePreview' },
            state: { recordIds: id, selectedRecordId: id }
        });
    }
}
