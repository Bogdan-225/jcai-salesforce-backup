import { LightningElement, api, wire } from 'lwc';
import getInquiry from '@salesforce/apex/MatchingInquiryController.getInquiry';

const decorate = (fields) =>
    (fields || []).map((f) => ({
        ...f,
        isEmail: f.type === 'EMAIL',
        isPhone: f.type === 'PHONE',
        isTextArea: f.type === 'TEXTAREA',
        isPlain: f.type !== 'EMAIL' && f.type !== 'PHONE' && f.type !== 'TEXTAREA'
    }));

export default class MatchingInquiryMessage extends LightningElement {
    @api recordId;
    @api jaTitle = '問い合わせ項目(日本語)';
    @api enTitle = '問い合わせ項目(English)';

    ja = [];
    en = [];
    hasProject = false;
    loaded = false;
    error;
    jaOpen = true;
    enOpen = true;

    @wire(getInquiry, { matchingId: '$recordId' })
    wired({ error, data }) {
        this.loaded = true;
        if (data) {
            this.error = undefined;
            this.hasProject = data.hasProject;
            this.ja = decorate(data.ja);
            this.en = decorate(data.en);
        } else if (error) {
            this.hasProject = false;
            this.ja = [];
            this.en = [];
            this.error = error.body && error.body.message ? error.body.message : JSON.stringify(error);
        }
    }

    get showEmpty() {
        return this.loaded && !this.error && !this.hasProject;
    }

    get jaSectionClass() {
        return 'slds-section' + (this.jaOpen ? ' slds-is-open' : '');
    }

    get enSectionClass() {
        return 'slds-section' + (this.enOpen ? ' slds-is-open' : '');
    }

    toggleJa() {
        this.jaOpen = !this.jaOpen;
    }

    toggleEn() {
        this.enOpen = !this.enOpen;
    }
}
