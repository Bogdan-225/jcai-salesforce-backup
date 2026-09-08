import { LightningElement, api, wire } from 'lwc';
import { CloseActionScreenEvent } from 'lightning/actions';
import { getRecord } from 'lightning/uiRecordApi';
import userId from '@salesforce/user/Id';
import CBN_Cancel from '@salesforce/label/c.CBN_Cancel';
import CBN_Save from '@salesforce/label/c.CBN_Save';
import AC_NAME_FIELD from '@salesforce/schema/Account.Name'; // ← これ！
import AC_RECORD_TYPE_ID_FIELD from '@salesforce/schema/Account.RecordTypeId';
import NAME_FIELD from '@salesforce/schema/Matching__c.Name'; // ← これ！
import Buy_Company__c_FIELD from '@salesforce/schema/Matching__c.Buy_Company__c'; // ← これ！

const FIELDS = [NAME_FIELD, Buy_Company__c_FIELD];
const AC_FIELDS = [AC_NAME_FIELD, AC_RECORD_TYPE_ID_FIELD];
const TARGET_ACCOUNT_RECORD_TYPE_ID = '012RA00000AVG7ZYAX';

export default class CreateBuyNeedsScreenAction extends LightningElement {
	@api recordId;
	@api invoke() {
		console.log('invoke recordId:', this.recordId);
	}

	labels = { cancel: CBN_Cancel, save: CBN_Save };
	current_user_id = userId;

	is_domestic = true;
	is_cb = false;
	is_choice_needs_type = true;
	is_target_record_type = false;
	needs_type_default = '国内';

	handle_needs_type_change(event) {
		console.log('handle_needs_type');

		const value = event.detail.value;
		this.needs_type_default = value;
		this.is_choice_needs_type = true;
		if (value === '海外') {
			this.is_cb = true;
			this.is_domestic = false;
		} else if (value === '国内') {
			this.is_cb = false;
			this.is_domestic = true;
		} else {
			this.is_cb = false;
			this.is_domestic = false;
			this.is_choice_needs_type = false;
		}
	}

	matching_name = '';
	account_id = '';

	@wire(getRecord, { recordId: '$recordId', fields: AC_FIELDS })
	wired_record2({ error, data }) {
		try {
			if (data) {
				this.matching_name = data.fields.Name.value + 'の買収ニーズ';
				this.account_id = this.recordId;
				this.is_target_record_type =
					data.fields.RecordTypeId.value ===
					TARGET_ACCOUNT_RECORD_TYPE_ID;
				if (this.is_target_record_type) {
					this.needs_type_default = '海外';
					this.is_cb = true;
					this.is_domestic = false;
				} else {
					this.needs_type_default = '国内';
					this.is_cb = false;
					this.is_domestic = true;
				}
			}
		} catch (error) {}
	}

	@wire(getRecord, { recordId: '$recordId', fields: FIELDS })
	wired_record({ error, data }) {
		try {
			if (data) {
				this.matching_name = data.fields.Name.value;
				this.account_id = data.fields.Buy_Company__c.value;
			}
		} catch (error) {}
	}

	handle_cancel() {
		console.log('__cancel__');
		console.log(this.dispatchEvent(new CloseActionScreenEvent()));
	}

	handle_success(event) {
		const recordId = event.detail.id;
		console.log('Created record ID:', recordId);
		alert('買収ニーズを作成しました | M&A Needs record created');
		this.dispatchEvent(new CloseActionScreenEvent());
		// 必要があればイベント発火やナビゲーションも
	}
}