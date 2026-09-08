import { LightningElement, api, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import get_activities from '@salesforce/apex/ActivityController.get_activities';
import set_task_status from '@salesforce/apex/ActivityController.set_task_status';
import userId from '@salesforce/user/Id';
import activity_component_title from '@salesforce/label/c.Activity_Component_Title';

export default class ActivityComponent extends NavigationMixin(LightningElement) {
	user_id = userId;
	label_title = activity_component_title;
	@track loaded = false;
	@api recordId;
	@track type_options = [
		{
			label: '電話（バイサイド）',
			checked: true,
			classname: 'active',
			is_open_create_panel: false,
		},
		{
			label: '電話（セルサイド）',
			checked: true,
			classname: 'active',
			is_open_create_panel: false,
		},
		{
			label: 'メール',
			checked: true,
			classname: 'active',
			is_open_create_panel: false,
		},
		{
			label: '手紙',
			checked: true,
			classname: 'active',
			is_open_create_panel: false,
		},
		{
			label: 'メモ',
			checked: true,
			classname: 'active',
			is_open_create_panel: false,
		},
	];
	selected_types = [
		'電話',
		'電話（セルサイド）',
		'電話（バイサイド）',
		'メール',
		'手紙',
		'メモ',
	]; // 初期状態：すべてON
	@track activities;

	has_item = false;

	connectedCallback() {
		this.load_activities();
	}

	handle_activity_created() {
		// アクティビティが作成されたら一覧を再読み込み
		this.now_page = 1;
		this.load_activities();
	}

	handle_filter_change(event) {
		const value = event.target.value;
		if (event.target.checked) {
			this.selected_types = [...this.selected_types, value];
		} else {
			this.selected_types = this.selected_types.filter(
				(v) => v !== value,
			);
		}
		for (let i = 0; i < this.type_options.length; i++) {
			const op = this.type_options[i];
			if (op.label === value) {
				op.checked = event.target.checked;
				op.classname = event.target.checked ? 'active' : '';
			}
		}
		this.load_activities();
	}
	call_status_classnames = {
		受付NG: 'call_status call_status_ng',
		社長NG: 'call_status call_status_ng',
		社長外出or会議中: 'call_status call_status_hold',
		'コール音/留守電': 'call_status call_status_hold',
		社長不在: 'call_status call_status_hold',
		アポ獲得: 'call_status call_status_go',
		トスアップ: 'call_status call_status_toss',
		アプローチ: 'call_status call_status_go',
		重点アプローチ: 'call_status call_status_go',
		受付カット: 'call_status call_status_ng',
		メール送付: 'call_status call_status_toss',
		郵送: 'call_status call_status_toss',
		問合せ: 'call_status call_status_hold',
		親会社確認: 'call_status call_status_hold',
		MG対応: 'call_status call_status_hold',
		ドロップ: 'call_status call_status_ng',
		クレーム: 'call_status call_status_ng',
		英語NG: 'call_status call_status_ng',
	};

	format_date(d) {
		if (d === '' || d === undefined) {
			return '';
		}
		const date = new Date(d);
		return date.toLocaleString('ja-JP', {
			timeZone: 'Asia/Tokyo',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	@track per_page = 10;

	@track now_page = 1;
	@track total_count = 0;

	handle_page_change(event) {
		this.now_page = event.detail.now_page;
		this.per_page = event.detail.per_page;
		this.load_activities();
	}

	async load_activities() {
		this.loaded = false;

		try {
			await get_activities({
				recordId: this.recordId,
				activity_types: this.selected_types,
				lim: this.per_page,
				offset: (this.now_page - 1) * this.per_page,
			})
				.then(async (result) => {
					console.log(result);

					this.total_count = result.max;

					for (let i = 0; i < result.activities.length; i++) {
						const v = result.activities[i];
						v['call_date_and_time'] = this.format_date(
							v['call_date_and_time'],
						);

						v.is_subj = v.Subject !== '' && v.Subject !== undefined;

						v.Description =
							v.Description !== undefined
								? v.Description.replace(/\n/g, '<br/>')
								: '';

						v.is_desc =
							v.Description !== '' && v.Description !== undefined;
						let types = {
							call: v.activity_type === '電話',
							buy_side_call:
								v.activity_type === '電話（バイサイド）',
							sell_side_call:
								v.activity_type === '電話（セルサイド）',
							letter: v.activity_type === '手紙',
							email: v.activity_type === 'メール',
							memo: v.activity_type === 'メモ',
							reminder: v.activity_type === 'リマインダー',
						};
						result.activities[i].types = types;
						if (v.CallStatus) {
							v.call_status_classname =
								this.call_status_classnames[v.CallStatus];
						}
					}

					this.has_item = result.activities.length !== 0;
					this.activities = result.activities;
					this.loaded = true;
				})
				.catch((error) => {
					console.error(error);
				});
		} catch (error) {
			console.log(error);
		}
	}

	is_checked(value) {
		return this.selected_types.includes(value);
	}

	handleSubjectClick(event) {
		const activityId = event.currentTarget.dataset.activityId;
		if (activityId) {
			this[NavigationMixin.Navigate]({
				type: 'standard__recordPage',
				attributes: {
					recordId: activityId,
					actionName: 'view'
				}
			});
		}
	}
}