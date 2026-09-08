import { LightningElement, api } from 'lwc';

export default class CreateBuyNeeds extends LightningElement {
	@api recordId; // Salesforceが自動的に設定してくれる
}