import { LightningElement, api } from 'lwc';
import { CloseActionScreenEvent } from 'lightning/actions';

export default class CreateBuyNeedsAction extends LightningElement {
	@api recordId; // Salesforceが自動的に設定してくれる
	@api invoke() {
		console.log(
			'クイックアクションが呼ばれました！recordId:',
			this.recordId,
		);
		// 必要に応じて処理を記述
	}

	is_domestic = true;
	is_cb = false;
	is_choice_needs_type = true;

	handle_needs_type_change(event) {
		console.log('handle_needs_type');

		const value = event.detail.value;
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

	handle_cancel() {
		console.log('__cancel__');
		console.log(this.dispatchEvent(new CloseActionScreenEvent()));
	}

	handleSuccess(event) {
		const recordId = event.detail.id;
		console.log('Created record ID:', recordId);
		// 必要があればイベント発火やナビゲーションも
	}
}