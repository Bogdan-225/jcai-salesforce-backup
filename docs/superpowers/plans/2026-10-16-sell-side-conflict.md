# Sell-Side Conflict Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an auto-maintained Account checkbox `SellSideConflict__c` (進行中売り手(接触注意)) that is ON when the account, or one of its direct children, is the seller on an active Opportunity, and relabel the existing buyer flag so consultants can tell buyer conflicts from seller conflicts.

**Architecture:** Two Opportunity formula fields hold the rule (base date = max of 3 dates; active = stage list AND not Sourcing AND base date within 90 days). One `without sharing` Apex class recomputes accounts from those formulas: an invocable entry point is called by a new Opportunity after-save flow (instant), and a Schedulable runs the full recompute daily at 05:00 JST (90-day expiry, safety net). No API names change; only labels/help/descriptions of the two existing buyer fields.

**Tech Stack:** Salesforce Metadata API (sf CLI 2.147), Apex (API 62.0), Flow (record-triggered, after save), Dynamic Forms FlexiPages, CustomObjectTranslation (en_US). Orgs: `bogdan` dev sandbox (metadata build + unit tests, 0 data), `partial` sandbox (data rehearsal), `prod` (read-only until the final deploy, which Bogdan runs with the `!` prefix).

**Spec:** `docs/superpowers/specs/2026-10-16-sell-side-conflict-spec.md`

## Global Constraints

- Prod is read-only for Claude until the final step. Any prod deploy, data write, flow activation or scheduled-job creation is run by Bogdan via `! <command>`. Retrieves/queries from prod are fine.
- Flow activation in prod needs the owner's (Bogdan's) explicit go.
- Whole-file metadata (FlexiPage, Layout, Profile, PermissionSet, CustomObjectTranslation) replaces the whole component on deploy: always retrieve from the target org immediately before editing, then deploy only the named components. Never reuse a sandbox-retrieved page for prod.
- Apex deploys use `--test-level RunSpecifiedTests --tests SellSideConflictRecalculatorTest` (prod RunLocalTests is broken: 73% coverage, failing legacy tests). Never `sf project deploy validate`.
- Flows deploy as Draft in this org. Activate with Tooling REST, relative path: `sf api request rest -o <org> --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<300 id>" --body '{"Metadata":{"activeVersionNumber":N}}'`.
- `sf` CLI commands run from the Bash tool; the repo lives on G: Drive (npm fails there, `sf` works). Big heredocs fail: write files with the Write tool.
- No API rename. `DealConflict__c` and `DealConflict_M__c` keep their names.
- Labels: Account.SellSideConflict__c ja 進行中売り手(接触注意) / en Seller Conflict (Caution); Account.DealConflict__c and Matching__c.DealConflict_M__c ja 進行中買い手(接触注意) / en Buyer Conflict (Caution).
- Stage list (exact picklist API values): `NDA締結`, `FS Request`, `バリュエーション済み`, `面談前`, `案件化`, `資料作成`, `ISマッチング中`, `MGマッチング中`, `Pre Top MTG`, `トップ面談`, `Post Top MTG`, `MOU/LOI`, `DD`, `SPA`, `CP`, `成約`. Record type `CB_Sourcing_Path` excluded. Window = 90 days.
- Test data constraints (validation rules in all orgs): Account needs `Website='None'` (Opportunity VR required_website) and, for record type 国内, `CorporateNumber__c` (Account VR Required_CorporateNumber). Opportunity stage changes trip `Required_ActivitiesByStage` unless `Check_ActivitiesByStage__c = true` was saved beforehand; `案件終了` needs `termination_reason__c`; `On Hold` needs `OnHoldReason__c`. Use record type `SellingOpp` for stage-change tests (XBorderType has extra document VRs).
- Commit after every task with the message style of the repo (`<what>: <detail> (sandbox bogdan, <deploy id>)`), ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- All work files live under `scripts/deploy/sell_side_conflict/`; source of truth copies also go to `force-app/main/default/` (classes, flows, objects/*/fields) so the repo stays retrievable.

---

### Task 1: Opportunity helper formula fields + Account flag field (sandbox bogdan)

**Files:**
- Create: `scripts/deploy/sell_side_conflict/fields/package.xml`
- Create: `scripts/deploy/sell_side_conflict/fields/objects/Opportunity/fields/SellSideBaseDate__c.field-meta.xml`
- Create: `scripts/deploy/sell_side_conflict/fields/objects/Opportunity/fields/SellSideActive__c.field-meta.xml`
- Create: `scripts/deploy/sell_side_conflict/fields/objects/Account/fields/SellSideConflict__c.field-meta.xml`
- Copy the three field files to `force-app/main/default/objects/<Object>/fields/`

**Interfaces:**
- Produces: `Opportunity.SellSideActive__c` (Checkbox formula, filterable in SOQL), `Opportunity.SellSideBaseDate__c` (DateTime formula), `Account.SellSideConflict__c` (Checkbox). Task 2 queries `SellSideActive__c = true`.

- [ ] **Step 1: Write the package and the three field files**

`scripts/deploy/sell_side_conflict/fields/package.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Opportunity.SellSideBaseDate__c</members>
        <members>Opportunity.SellSideActive__c</members>
        <members>Account.SellSideConflict__c</members>
        <name>CustomField</name>
    </types>
    <version>62.0</version>
</Package>
```

`objects/Opportunity/fields/SellSideBaseDate__c.field-meta.xml` (source-format deploy: use `sf project deploy start --source-dir scripts/deploy/sell_side_conflict/fields` — the folder is laid out in source format with `objects/<Object>/fields/*.field-meta.xml`; the package.xml is for documentation and for the prod retrieve/diff):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>SellSideBaseDate__c</fullName>
    <description>進行中売り手判定の基準日時。最終フェーズ変更日(LastStageChangeDate)・最終更新日(LastModifiedDate)・最終活動更新日時(LastActivityUpdate__c)のうち最も新しいもの。Account.SellSideConflict__c の判定(SellSideActive__c)に使用。</description>
    <externalId>false</externalId>
    <formula>IF(
  BLANKVALUE(LastStageChangeDate, LastModifiedDate) &gt;= BLANKVALUE(LastActivityUpdate__c, LastModifiedDate),
  IF(BLANKVALUE(LastStageChangeDate, LastModifiedDate) &gt;= LastModifiedDate, BLANKVALUE(LastStageChangeDate, LastModifiedDate), LastModifiedDate),
  IF(BLANKVALUE(LastActivityUpdate__c, LastModifiedDate) &gt;= LastModifiedDate, BLANKVALUE(LastActivityUpdate__c, LastModifiedDate), LastModifiedDate)
)</formula>
    <formulaTreatBlanksAs>BlankAsZero</formulaTreatBlanksAs>
    <inlineHelpText>進行中売り手判定の基準日時（フェーズ変更・最終更新・活動更新の最新）。自動計算。</inlineHelpText>
    <label>進行中判定基準日</label>
    <required>false</required>
    <type>DateTime</type>
</CustomField>
```

`objects/Opportunity/fields/SellSideActive__c.field-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>SellSideActive__c</fullName>
    <description>この譲渡案件が「売り手として進行中」と判定されるか。レコードタイプがSourcing以外、フェーズが進行中(NDA締結〜成約)、かつ進行中判定基準日(SellSideBaseDate__c)が90日以内でTRUE。取引先(売り手・その親)の SellSideConflict__c はこの値から Apex(SellSideConflictRecalculator) が計算する。</description>
    <externalId>false</externalId>
    <formula>AND(
  RecordType.DeveloperName &lt;&gt; "CB_Sourcing_Path",
  CASE(TEXT(StageName),
    "NDA締結", 1, "FS Request", 1, "バリュエーション済み", 1, "面談前", 1, "案件化", 1, "資料作成", 1,
    "ISマッチング中", 1, "MGマッチング中", 1, "Pre Top MTG", 1, "トップ面談", 1, "Post Top MTG", 1,
    "MOU/LOI", 1, "DD", 1, "SPA", 1, "CP", 1, "成約", 1,
    0) = 1,
  SellSideBaseDate__c &gt;= NOW() - 90
)</formula>
    <formulaTreatBlanksAs>BlankAsZero</formulaTreatBlanksAs>
    <inlineHelpText>売り手として進行中の案件ならON（Sourcing以外・フェーズNDA締結〜成約・基準日が90日以内）。自動計算。</inlineHelpText>
    <label>進行中売り手判定(自動)</label>
    <type>Checkbox</type>
</CustomField>
```

`objects/Account/fields/SellSideConflict__c.field-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>SellSideConflict__c</fullName>
    <defaultValue>false</defaultValue>
    <description>別の譲渡案件で売り手として進行中の会社（またはその親会社）。Apex(SellSideConflictRecalculator)が商談の保存時と毎日05:00(JST)に自動でON/OFF。判定: 譲渡案件(Opportunity、Sourcing以外)のフェーズが進行中(NDA締結〜成約)かつ基準日(最終フェーズ変更日・最終更新日・最終活動更新日時の最大)が90日以内 = Opportunity.SellSideActive__c。案件終了・Converted to Buyer・Ongoing・On Hold・リード反響・長期フォロー・トスアップ・IS戻しは対象外。手動編集不可。</description>
    <externalId>false</externalId>
    <inlineHelpText>別の譲渡案件で売り手として進行中の会社（またはその親会社）です。買い手としての案内は送らないでください。案件終了・Converted to Buyer・Ongoing の案件は対象外です。※商談の保存時と毎日自動でON/OFFされます（手動で変更しないでください）</inlineHelpText>
    <label>進行中売り手(接触注意)</label>
    <trackFeedHistory>false</trackFeedHistory>
    <type>Checkbox</type>
</CustomField>
```

- [ ] **Step 2: Deploy to sandbox bogdan**

Run from repo root:
```bash
sf project deploy start -o bogdan --source-dir scripts/deploy/sell_side_conflict/fields --wait 10
```
Expected: `Status: Succeeded`, 3 components. If `LastStageChangeDate` is rejected in the formula ("Field LastStageChangeDate does not exist"), remove that branch from `SellSideBaseDate__c` so it becomes max(LastActivityUpdate__c, LastModifiedDate) and record the limitation in the spec; the daily job still catches stage changes because a stage change also updates LastModifiedDate.

- [ ] **Step 3: Verify the formula behaves on a real record**

Create one account + one opportunity in bogdan and read the formulas back:
```bash
sf data create record -o bogdan -s Account -v "Name='SSC Test Seller' Website='None'" --json
# take the 001 id into ACC
sf data create record -o bogdan -s Opportunity -v "Name='SSC Test Opp' StageName='面談前' CloseDate=2027-03-31 AccountId=<ACC>" --json
sf data query -o bogdan -q "SELECT Id, StageName, LastModifiedDate, LastStageChangeDate, LastActivityUpdate__c, SellSideBaseDate__c, SellSideActive__c, RecordType.DeveloperName FROM Opportunity WHERE Name='SSC Test Opp'"
```
Expected: `SellSideActive__c = true`, `SellSideBaseDate__c` equals LastModifiedDate (or LastStageChangeDate if set). Then:
```bash
sf data query -o bogdan -q "SELECT COUNT(Id) FROM Opportunity WHERE SellSideActive__c = true"
```
Expected: 1 (proves the formula is filterable in SOQL, which Task 2 relies on). Leave the two test records; Task 2 tests create their own data.

- [ ] **Step 4: Copy field files into force-app and commit**

```bash
mkdir -p force-app/main/default/objects/Opportunity/fields force-app/main/default/objects/Account/fields
cp scripts/deploy/sell_side_conflict/fields/objects/Opportunity/fields/*.xml force-app/main/default/objects/Opportunity/fields/
cp scripts/deploy/sell_side_conflict/fields/objects/Account/fields/SellSideConflict__c.field-meta.xml force-app/main/default/objects/Account/fields/
git add scripts/deploy/sell_side_conflict/fields force-app/main/default/objects/Opportunity/fields/SellSide*.xml force-app/main/default/objects/Account/fields/SellSideConflict__c.field-meta.xml docs/superpowers
git commit -m "Sell-side conflict: Account.SellSideConflict__c + Opportunity SellSideBaseDate__c/SellSideActive__c formulas (sandbox bogdan, <deploy id>)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Apex recalculator (invocable + scheduler) with tests (sandbox bogdan)

**Files:**
- Create: `scripts/deploy/sell_side_conflict/apex/classes/SellSideConflictRecalculator.cls` (+ `.cls-meta.xml`)
- Create: `scripts/deploy/sell_side_conflict/apex/classes/SellSideConflictScheduler.cls` (+ `.cls-meta.xml`)
- Create: `scripts/deploy/sell_side_conflict/apex/classes/SellSideConflictRecalculatorTest.cls` (+ `.cls-meta.xml`)
- Copy all six to `force-app/main/default/classes/`

**Interfaces:**
- Consumes: `Opportunity.SellSideActive__c` (Task 1), `Account.SellSideConflict__c` (Task 1).
- Produces:
  - `SellSideConflictRecalculator.Request { String accountId; String priorAccountId; }` (String, not Id: Flow passes an empty string for a null $Record__Prior.AccountId on create, which fails Id-typed inputs with "Invalid id:"; Apex converts with a blank-safe toId helper)
  - `@InvocableMethod public static void recalculateForAccounts(List<Request> requests)` — used by the flow in Task 3.
  - `public static Integer recalculate(Set<Id> accountIds)` — recomputes the given accounts and their direct parents; returns number of accounts updated.
  - `public static Integer recalculateAll()` — full recompute; returns number updated.
  - `SellSideConflictScheduler implements Schedulable` — `execute` calls `recalculateAll()`.

- [ ] **Step 1: Write the failing test class**

`SellSideConflictRecalculatorTest.cls`:
```apex
/**
 * SellSideConflictRecalculatorTest
 * Data rules (validation rules verified in prod 2026-10-16, read-only):
 *  - Account: Website='None' (Opportunity VR required_website reads SP_Website__c = Account.Website).
 *    Default record type for the running user may be 国内 → CorporateNumber__c required on insert.
 *  - Opportunity: insert with RecordType SellingOpp; stage changes need Check_ActivitiesByStage__c=true
 *    saved beforehand (VR Required_ActivitiesByStage uses PRIORVALUE); 案件終了 needs termination_reason__c.
 *  - The 90-day expiry cannot be unit-tested (LastModifiedDate is always "now" in a test); it is
 *    rehearsed in the partial sandbox with real data instead.
 */
@isTest
private class SellSideConflictRecalculatorTest {

    private static Id sellingRt() {
        return Schema.SObjectType.Opportunity.getRecordTypeInfosByDeveloperName().get('SellingOpp').getRecordTypeId();
    }
    private static Id sourcingRt() {
        return Schema.SObjectType.Opportunity.getRecordTypeInfosByDeveloperName().get('CB_Sourcing_Path').getRecordTypeId();
    }

    private static Account newAccount(String name, Id parentId) {
        return new Account(Name = name, Website = 'None', CorporateNumber__c = '1' + String.valueOf(Math.abs(Crypto.getRandomInteger())).leftPad(12, '0'), ParentId = parentId);
    }

    private static Opportunity newOpp(String name, Id accountId, String stage, Id rtId) {
        return new Opportunity(Name = name, AccountId = accountId, StageName = stage, CloseDate = Date.today().addMonths(6),
                               RecordTypeId = rtId, Check_ActivitiesByStage__c = true);
    }

    private static Boolean flag(Id accountId) {
        return [SELECT SellSideConflict__c FROM Account WHERE Id = :accountId].SellSideConflict__c;
    }

    @isTest
    static void activeStageTurnsSellerAndParentOn() {
        Account parent = newAccount('SSC Parent', null);
        insert parent;
        Account seller = newAccount('SSC Seller', parent.Id);
        Account bystander = newAccount('SSC Bystander', null);
        insert new List<Account>{ seller, bystander };
        insert newOpp('SSC Opp active', seller.Id, '面談前', sellingRt());

        Test.startTest();
        Integer updated = SellSideConflictRecalculator.recalculate(new Set<Id>{ seller.Id });
        Test.stopTest();

        System.assertEquals(true, flag(seller.Id), 'seller must be ON');
        System.assertEquals(true, flag(parent.Id), 'direct parent must be ON');
        System.assertEquals(false, flag(bystander.Id), 'unrelated account stays OFF');
        // no assertion on `updated`: once the Task 3 flow is active the insert already set the flags (updated = 0)
    }

    @isTest
    static void inactiveStageAndSourcingStayOff() {
        Account a1 = newAccount('SSC Lead', null);
        Account a2 = newAccount('SSC Sourcing', null);
        Account a3 = newAccount('SSC Closed', null);
        insert new List<Account>{ a1, a2, a3 };
        Opportunity lead = newOpp('SSC lead', a1.Id, 'リード反響', sellingRt());
        Opportunity src = newOpp('SSC sourcing', a2.Id, '成約', sourcingRt());
        Opportunity closed = newOpp('SSC closed', a3.Id, '案件終了', sellingRt());
        closed.termination_reason__c = 'その他';
        insert new List<Opportunity>{ lead, src, closed };

        Test.startTest();
        SellSideConflictRecalculator.recalculate(new Set<Id>{ a1.Id, a2.Id, a3.Id });
        Test.stopTest();

        System.assertEquals(false, flag(a1.Id), 'リード反響 is not active');
        System.assertEquals(false, flag(a2.Id), 'Sourcing record type excluded even at 成約');
        System.assertEquals(false, flag(a3.Id), '案件終了 is not active');
    }

    @isTest
    static void turnsOffWhenNoActiveOppRemains() {
        Account seller = newAccount('SSC Seller off', null);
        insert seller;
        Opportunity opp = newOpp('SSC Opp off', seller.Id, '案件化', sellingRt());
        insert opp;
        SellSideConflictRecalculator.recalculate(new Set<Id>{ seller.Id });
        System.assertEquals(true, flag(seller.Id), 'precondition: ON');

        opp.StageName = '案件終了';
        opp.termination_reason__c = 'その他';
        update opp; // flow (Task 3) may already recompute; the explicit call below must be idempotent

        Test.startTest();
        Integer updated = SellSideConflictRecalculator.recalculate(new Set<Id>{ seller.Id });
        Test.stopTest();

        System.assertEquals(false, flag(seller.Id), 'must turn OFF after the only opp closed');
    }

    @isTest
    static void recalculateAllSetsAndClears() {
        Account onAcc = newAccount('SSC All on', null);
        Account staleAcc = newAccount('SSC All stale', null);
        insert new List<Account>{ onAcc, staleAcc };
        staleAcc.SellSideConflict__c = true; // simulates a flag left behind
        update staleAcc;
        insert newOpp('SSC all opp', onAcc.Id, 'DD', sellingRt());

        Test.startTest();
        Integer updated = SellSideConflictRecalculator.recalculateAll();
        Test.stopTest();

        System.assertEquals(true, flag(onAcc.Id));
        System.assertEquals(false, flag(staleAcc.Id), 'stale flag must be cleared by the full run');
    }

    @isTest
    static void invocableHandlesPriorAccount() {
        Account oldAcc = newAccount('SSC old', null);
        Account newAcc = newAccount('SSC new', null);
        insert new List<Account>{ oldAcc, newAcc };
        Opportunity opp = newOpp('SSC move', oldAcc.Id, '資料作成', sellingRt());
        insert opp;
        SellSideConflictRecalculator.recalculate(new Set<Id>{ oldAcc.Id });
        System.assertEquals(true, flag(oldAcc.Id));

        opp.AccountId = newAcc.Id;
        update opp;

        SellSideConflictRecalculator.Request req = new SellSideConflictRecalculator.Request();
        req.accountId = newAcc.Id;
        req.priorAccountId = oldAcc.Id;
        Test.startTest();
        SellSideConflictRecalculator.recalculateForAccounts(new List<SellSideConflictRecalculator.Request>{ req });
        Test.stopTest();

        System.assertEquals(false, flag(oldAcc.Id), 'old seller cleared');
        System.assertEquals(true, flag(newAcc.Id), 'new seller set');
    }

    @isTest
    static void schedulerRuns() {
        Test.startTest();
        String jobId = System.schedule('SSC test ' + Datetime.now().getTime(), '0 0 20 * * ?', new SellSideConflictScheduler());
        Test.stopTest();
        System.assertNotEquals(null, jobId);
    }
}
```

- [ ] **Step 2: Write the implementation**

`SellSideConflictRecalculator.cls`:
```apex
/**
 * SellSideConflictRecalculator
 * ----------------------------
 * Maintains Account.SellSideConflict__c (進行中売り手(接触注意)).
 * Rule: Account A is TRUE iff an Opportunity O exists with O.SellSideActive__c = true and
 *       (O.AccountId = A or O.Account.ParentId = A). SellSideActive__c is a formula on Opportunity
 *       (record type not Sourcing, stage NDA締結〜成約, base date within 90 days), so the rule itself
 *       is editable by admins without touching this class.
 * Entry points:
 *   - recalculateForAccounts (invocable): called by flow Opportunity_AfterSave_RecomputeSellSideConflict
 *     with the opportunity's current and prior AccountId.
 *   - recalculateAll(): called daily by SellSideConflictScheduler (05:00 JST) for the 90-day expiry.
 * without sharing: the flag must not depend on the saving user's record visibility (T-002 hides
 * opportunities from IS users). Only differing accounts are updated (idempotent, no recursion).
 */
public without sharing class SellSideConflictRecalculator {

    public class Request {
        @InvocableVariable(required=false label='Account Id (current seller)')
        public String accountId;   // String: Flow sends '' for a null $Record__Prior.AccountId on create
        @InvocableVariable(required=false label='Prior Account Id (seller before the change, may be blank)')
        public String priorAccountId;
    }

    @InvocableMethod(label='売り手SellSideConflictを再計算' description='渡された取引先(現在・変更前)とその親取引先の SellSideConflict__c を再計算する。')
    public static void recalculateForAccounts(List<Request> requests) {
        Set<Id> ids = new Set<Id>();
        if (requests != null) {
            for (Request r : requests) {
                if (r == null) continue;
                Id a = toId(r.accountId);
                Id p = toId(r.priorAccountId);
                if (a != null) ids.add(a);
                if (p != null) ids.add(p);
            }
        }
        if (!ids.isEmpty()) recalculate(ids);
    }

    private static Id toId(String s) {
        if (String.isBlank(s)) return null;
        try { return Id.valueOf(s.trim()); } catch (Exception e) { return null; }
    }

    /** Recompute the given accounts plus their direct parents. Returns number of accounts updated. */
    public static Integer recalculate(Set<Id> accountIds) {
        if (accountIds == null || accountIds.isEmpty()) return 0;

        // Targets = requested accounts + their direct parents (a parent may need clearing too).
        Map<Id, Account> targets = new Map<Id, Account>([SELECT Id, ParentId, SellSideConflict__c FROM Account WHERE Id IN :accountIds]);
        Set<Id> parentIds = new Set<Id>();
        for (Account a : targets.values()) {
            if (a.ParentId != null && !targets.containsKey(a.ParentId)) parentIds.add(a.ParentId);
        }
        if (!parentIds.isEmpty()) {
            targets.putAll([SELECT Id, ParentId, SellSideConflict__c FROM Account WHERE Id IN :parentIds]);
        }
        Set<Id> targetIds = targets.keySet();

        Set<Id> shouldBeOn = new Set<Id>();
        for (Opportunity o : [SELECT AccountId, Account.ParentId FROM Opportunity
                              WHERE SellSideActive__c = true AND AccountId != null
                              AND (AccountId IN :targetIds OR Account.ParentId IN :targetIds)]) {
            if (targetIds.contains(o.AccountId)) shouldBeOn.add(o.AccountId);
            if (o.Account.ParentId != null && targetIds.contains(o.Account.ParentId)) shouldBeOn.add(o.Account.ParentId);
        }
        return applyDiff(targets.values(), shouldBeOn);
    }

    /** Full recompute: every account that is ON or should be ON. Returns number of accounts updated. */
    public static Integer recalculateAll() {
        Set<Id> shouldBeOn = new Set<Id>();
        for (Opportunity o : [SELECT AccountId, Account.ParentId FROM Opportunity
                              WHERE SellSideActive__c = true AND AccountId != null]) {
            shouldBeOn.add(o.AccountId);
            if (o.Account.ParentId != null) shouldBeOn.add(o.Account.ParentId);
        }
        Map<Id, Account> candidates = new Map<Id, Account>([SELECT Id, ParentId, SellSideConflict__c FROM Account
                                                            WHERE SellSideConflict__c = true OR Id IN :shouldBeOn]);
        return applyDiff(candidates.values(), shouldBeOn);
    }

    private static Integer applyDiff(List<Account> accounts, Set<Id> shouldBeOn) {
        List<Account> toUpdate = new List<Account>();
        for (Account a : accounts) {
            Boolean target = shouldBeOn.contains(a.Id);
            if (a.SellSideConflict__c != target) {
                toUpdate.add(new Account(Id = a.Id, SellSideConflict__c = target));
            }
        }
        if (toUpdate.isEmpty()) return 0;
        Integer ok = 0;
        for (Database.SaveResult sr : Database.update(toUpdate, false)) {
            if (sr.isSuccess()) {
                ok++;
            } else {
                System.debug(LoggingLevel.ERROR, 'SellSideConflict update failed ' + sr.getId() + ': ' + sr.getErrors());
            }
        }
        return ok;
    }
}
```

`SellSideConflictScheduler.cls`:
```apex
/**
 * Daily job (05:00 JST = 20:00 UTC) that recomputes Account.SellSideConflict__c for all accounts.
 * Schedule once per org with anonymous Apex:
 *   System.schedule('SellSideConflict Daily', '0 0 20 * * ?', new SellSideConflictScheduler());
 */
public without sharing class SellSideConflictScheduler implements Schedulable {
    public void execute(SchedulableContext sc) {
        Integer updated = SellSideConflictRecalculator.recalculateAll();
        System.debug(LoggingLevel.INFO, 'SellSideConflictScheduler updated ' + updated + ' accounts');
    }
}
```

Each `.cls-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Active</status>
</ApexClass>
```

- [ ] **Step 3: Deploy to bogdan running only this test**

```bash
sf project deploy start -o bogdan --source-dir scripts/deploy/sell_side_conflict/apex --test-level RunSpecifiedTests --tests SellSideConflictRecalculatorTest --wait 15
```
Expected: `Status: Succeeded`, 6/6 tests pass, coverage of SellSideConflictRecalculator ≥ 90%. If `CorporateNumber__c` is rejected on Account insert (field may be validated for 13 digits by another rule), use a fixed 13-digit string with a test-run counter. If `Required_ActivitiesByStage` still fires on the stage change in test 3, insert the opp first without `Check_ActivitiesByStage__c`, then update that checkbox alone, then change the stage.

- [ ] **Step 4: Copy to force-app and commit**

```bash
cp scripts/deploy/sell_side_conflict/apex/classes/* force-app/main/default/classes/
git add scripts/deploy/sell_side_conflict/apex force-app/main/default/classes/SellSideConflict*
git commit -m "Sell-side conflict: SellSideConflictRecalculator (invocable + recalculateAll) and daily scheduler, tests 6/6 (sandbox bogdan, <deploy id>)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Opportunity after-save flow (instant recompute) (sandbox bogdan)

**Files:**
- Create: `scripts/deploy/sell_side_conflict/flow/flows/Opportunity_AfterSave_RecomputeSellSideConflict.flow-meta.xml`
- Copy to `force-app/main/default/flows/`

**Interfaces:**
- Consumes: `SellSideConflictRecalculator.recalculateForAccounts` with inputs `accountId`, `priorAccountId` (Task 2).

- [ ] **Step 1: Write the flow**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <actionCalls>
        <name>Recalculate_SellSide_Conflict</name>
        <label>Recalculate Seller Conflict</label>
        <locationX>176</locationX>
        <locationY>287</locationY>
        <actionName>SellSideConflictRecalculator</actionName>
        <actionType>apex</actionType>
        <flowTransactionModel>CurrentTransaction</flowTransactionModel>
        <inputParameters>
            <name>accountId</name>
            <value>
                <elementReference>$Record.AccountId</elementReference>
            </value>
        </inputParameters>
        <inputParameters>
            <name>priorAccountId</name>
            <value>
                <elementReference>$Record__Prior.AccountId</elementReference>
            </value>
        </inputParameters>
        <nameSegment>SellSideConflictRecalculator</nameSegment>
    </actionCalls>
    <apiVersion>62.0</apiVersion>
    <description>譲渡案件(Opportunity)の作成時、またはフェーズ・取引先・レコードタイプの変更時に Apex(SellSideConflictRecalculator)を呼び、売り手取引先(現在・変更前)とその親取引先の SellSideConflict__c(進行中売り手(接触注意))を即時再計算する。90日経過によるOFFは日次ジョブ(SellSideConflictScheduler)が担当。</description>
    <environments>Default</environments>
    <interviewLabel>Opportunity AfterSave Recompute SellSide Conflict {!$Flow.CurrentDateTime}</interviewLabel>
    <label>Opportunity AfterSave Recompute SellSide Conflict</label>
    <processMetadataValues>
        <name>BuilderType</name>
        <value><stringValue>LightningFlowBuilder</stringValue></value>
    </processMetadataValues>
    <processMetadataValues>
        <name>CanvasMode</name>
        <value><stringValue>AUTO_LAYOUT_CANVAS</stringValue></value>
    </processMetadataValues>
    <processMetadataValues>
        <name>OriginBuilderType</name>
        <value><stringValue>LightningFlowBuilder</stringValue></value>
    </processMetadataValues>
    <processType>AutoLaunchedFlow</processType>
    <start>
        <locationX>50</locationX>
        <locationY>0</locationY>
        <connector>
            <targetReference>Recalculate_SellSide_Conflict</targetReference>
        </connector>
        <filterFormula>OR( ISNEW(), ISCHANGED({!$Record.StageName}), ISCHANGED({!$Record.AccountId}), ISCHANGED({!$Record.RecordTypeId}) )</filterFormula>
        <object>Opportunity</object>
        <recordTriggerType>CreateAndUpdate</recordTriggerType>
        <triggerType>RecordAfterSave</triggerType>
    </start>
    <status>Active</status>
</Flow>
```

- [ ] **Step 2: Deploy and activate in bogdan**

```bash
sf project deploy start -o bogdan --source-dir scripts/deploy/sell_side_conflict/flow --wait 10
sf data query -o bogdan -q "SELECT Id, ActiveVersionId, LatestVersionId FROM FlowDefinition WHERE DeveloperName='Opportunity_AfterSave_RecomputeSellSideConflict'" --use-tooling-api
```
If ActiveVersionId is null:
```bash
sf api request rest -o bogdan --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<300 id>" --body '{"Metadata":{"activeVersionNumber":1}}'
```
Expected: 204 No Content; re-query shows ActiveVersionId set.

- [ ] **Step 3: End-to-end check in bogdan (flow + Apex)**

```bash
sf data create record -o bogdan -s Account -v "Name='SSC E2E Parent' Website='None' CorporateNumber__c='1234567890123'" --json   # → PARENT
sf data create record -o bogdan -s Account -v "Name='SSC E2E Seller' Website='None' CorporateNumber__c='1234567890124' ParentId=<PARENT>" --json   # → SELLER
sf data create record -o bogdan -s Opportunity -v "Name='SSC E2E Opp' StageName='リード反響' CloseDate=2027-03-31 AccountId=<SELLER> Check_ActivitiesByStage__c=true" --json   # → OPP
sf data query -o bogdan -q "SELECT Name, SellSideConflict__c FROM Account WHERE Name LIKE 'SSC E2E%'"
```
Expected: both false (リード反響 is not active).
```bash
sf data update record -o bogdan -s Opportunity -i <OPP> -v "StageName='案件化'"
sf data query -o bogdan -q "SELECT Name, SellSideConflict__c FROM Account WHERE Name LIKE 'SSC E2E%'"
```
Expected: both true, in the same save (no scheduler involved).
```bash
sf data update record -o bogdan -s Opportunity -i <OPP> -v "StageName='案件終了' termination_reason__c='その他'"
sf data query -o bogdan -q "SELECT Name, SellSideConflict__c FROM Account WHERE Name LIKE 'SSC E2E%'"
```
Expected: both false. If the update fails on a validation rule, read the message and set the required field; do not loosen the rule.

- [ ] **Step 4: Re-run the Apex tests with the flow active**

```bash
sf apex run test -o bogdan --tests SellSideConflictRecalculatorTest --result-format human --wait 10
```
Expected: 6/6 pass (the flow now fires inside the tests; results must be unchanged, proving idempotence).

- [ ] **Step 5: Copy to force-app and commit**

```bash
cp scripts/deploy/sell_side_conflict/flow/flows/*.xml force-app/main/default/flows/
git add scripts/deploy/sell_side_conflict/flow force-app/main/default/flows/Opportunity_AfterSave_RecomputeSellSideConflict.flow-meta.xml
git commit -m "Sell-side conflict: Opportunity after-save flow calls SellSideConflictRecalculator on stage/account/record-type change (sandbox bogdan, <deploy id>, flow v1 active)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Relabel the buyer-side fields + en_US translations + help (sandbox bogdan)

**Files:**
- Create: `scripts/deploy/sell_side_conflict/labels/package.xml`
- Create: `scripts/deploy/sell_side_conflict/labels/objects/Account/fields/DealConflict__c.field-meta.xml`
- Create: `scripts/deploy/sell_side_conflict/labels/objects/Matching__c/fields/DealConflict_M__c.field-meta.xml`
- Create (from retrieve, then edit): `scripts/deploy/sell_side_conflict/labels/objectTranslations/Account-en_US/Account-en_US.objectTranslation-meta.xml`, `.../Matching__c-en_US/...`, `.../Opportunity-en_US/...`

**Interfaces:**
- Consumes: field names from Task 1. Produces: nothing programmatic; visible labels/help in ja and en_US.

- [ ] **Step 1: Write the two relabeled buyer fields (API names unchanged)**

`objects/Account/fields/DealConflict__c.field-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>DealConflict__c</fullName>
    <defaultValue>false</defaultValue>
    <description>【進行中買い手】買い手が「①重複元マッチ1件以上(phase_match__cがトップ面談〜CPかつDeal_Is_TopStage__c=true)」かつ「②重複元以外につながっているマッチ1件以上(Deal_Is_Dead__c=falseかつ、マッチ終了でないか自動終了(復活待ち)のいずれか)」を満たすときフローが自動でON/OFF(=別案件と重複提案になりうる状態)。手動終了されたものはカウントしない。自動終了してもフラグはONのまま(復活待ち)。手動編集不可(フロー管理)。売り手版は SellSideConflict__c。API名は互換性のため DealConflict__c のまま(2026-10 ラベルのみ変更)。</description>
    <externalId>false</externalId>
    <inlineHelpText>別の案件で買い手としてトップ面談以降まで進んでおり、かつ他の案件にもつながっている会社です。重複提案に注意してください。※自動でON/OFFされます（手動で変更しないでください）</inlineHelpText>
    <label>進行中買い手(接触注意)</label>
    <trackFeedHistory>false</trackFeedHistory>
    <type>Checkbox</type>
</CustomField>
```

`objects/Matching__c/fields/DealConflict_M__c.field-meta.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>DealConflict_M__c</fullName>
    <description>買い手(譲受希望会社)の進行中買い手フラグ(Account.DealConflict__c)を表示(マッチングのレポート/リストビューで列表示するため)。※数式のためリストビューの絞り込み条件には使用不可。API名は互換性のため DealConflict_M__c のまま(2026-10 ラベルのみ変更)。</description>
    <externalId>false</externalId>
    <formula>Buy_Company__r.DealConflict__c</formula>
    <formulaTreatBlanksAs>BlankAsZero</formulaTreatBlanksAs>
    <inlineHelpText>別の案件で買い手としてトップ面談以降まで進んでおり、かつ他の案件にもつながっている会社です。重複提案に注意してください。※自動でON/OFFされます（手動で変更しないでください）</inlineHelpText>
    <label>進行中買い手(接触注意)</label>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>Checkbox</type>
</CustomField>
```

- [ ] **Step 2: Retrieve the three en_US translation files from bogdan, then add/replace the field entries**

```bash
mkdir -p scripts/deploy/sell_side_conflict/labels_retrieve
sf project retrieve start -o bogdan -m "CustomObjectTranslation:Account-en_US" -m "CustomObjectTranslation:Matching__c-en_US" -m "CustomObjectTranslation:Opportunity-en_US" -r scripts/deploy/sell_side_conflict/labels_retrieve
```
Copy the three retrieved files under `scripts/deploy/sell_side_conflict/labels/objectTranslations/<name>/` and edit with the Edit tool (entries are sorted alphabetically by `<name>` inside `<fields>`; keep that order):

Account-en_US — replace the existing DealConflict__c block and add SellSideConflict__c:
```xml
    <fields>
        <help>This company is a buyer in another deal at Top Meeting stage or later and is also connected to a further deal = beware of duplicate proposals. *Set automatically on/off — do not edit manually.</help>
        <label>Buyer Conflict (Caution)</label>
        <name>DealConflict__c</name>
    </fields>
```
```xml
    <fields>
        <help>This company (or its parent) is currently a seller in another active project. Do not send buyer-side proposals to it. Projects at 案件終了 / Converted to Buyer / Ongoing are excluded. *Set automatically when a project is saved and once a day — do not edit manually.</help>
        <label>Seller Conflict (Caution)</label>
        <name>SellSideConflict__c</name>
    </fields>
```
Matching__c-en_US — replace the DealConflict_M__c block:
```xml
    <fields>
        <help>This company is a buyer in another deal at Top Meeting stage or later and is also connected to a further deal = beware of duplicate proposals. *Set automatically on/off — do not edit manually.</help>
        <label>Buyer Conflict (Caution)</label>
        <name>DealConflict_M__c</name>
    </fields>
```
Opportunity-en_US — add:
```xml
    <fields>
        <help>Latest of: last stage change, last modified, last activity update. Used for the Seller Conflict flag. Auto-calculated.</help>
        <label>Seller-Active Base Date</label>
        <name>SellSideBaseDate__c</name>
    </fields>
    <fields>
        <help>ON when this project counts as an active sell-side project (not Sourcing, stage NDA締結〜成約, base date within 90 days). Auto-calculated.</help>
        <label>Seller Active (auto)</label>
        <name>SellSideActive__c</name>
    </fields>
```

- [ ] **Step 3: Deploy to bogdan**

```bash
sf project deploy start -o bogdan --source-dir scripts/deploy/sell_side_conflict/labels --wait 10
```
Expected: Succeeded, 5 components (2 CustomField + 3 CustomObjectTranslation).

- [ ] **Step 4: Verify on screen in bogdan**

Query the labels as seen by the API (ja master):
```bash
sf sobject describe -o bogdan -s Account --json | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{JSON.parse(s).result.fields.filter(f=>/Conflict/.test(f.name)).forEach(f=>console.log(f.name,'|',f.label,'|',f.inlineHelpText))})"
```
Expected: DealConflict__c | 進行中買い手(接触注意) | new help; SellSideConflict__c | 進行中売り手(接触注意) | new help. Then ask Bogdan to open an Account in bogdan with his language set to English and confirm "Buyer Conflict (Caution)" / "Seller Conflict (Caution)" and the English help bubbles (the spec requires an on-screen check of the English help).

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy/sell_side_conflict/labels
git commit -m "Sell-side conflict: relabel DealConflict__c/DealConflict_M__c to 進行中買い手(接触注意) / Buyer Conflict, en_US labels+help for the 3 new fields (sandbox bogdan, <deploy id>)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Field-level security, permission set, Apex class access (sandbox bogdan)

**Files:**
- Create: `scripts/deploy/sell_side_conflict/access/package.xml`
- Create: `scripts/deploy/sell_side_conflict/access/profiles/<8 files>.profile-meta.xml` (partial profiles: Admin, Active%5F%5FIS_Buy, Active_インターン, Active_アプローチ管理者, Active_アドバイザー, Active_アドバイザー_pf, Active_IS_Sell, Active_IS_Sell_pf)
- Modify (from retrieve): `scripts/deploy/sell_side_conflict/access/permissionsets/DealConflict_Access.permissionset-meta.xml`

**Interfaces:**
- Consumes: field and class names from Tasks 1–2.

- [ ] **Step 1: Write the partial profile files**

Same content for all 8 profiles (partial profile deploys only add/overwrite the listed entries, pattern used in `scripts/deploy/account_fls_sysadmin` and `record_files_class_access`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Profile xmlns="http://soap.sforce.com/2006/04/metadata">
    <classAccesses>
        <apexClass>SellSideConflictRecalculator</apexClass>
        <enabled>true</enabled>
    </classAccesses>
    <classAccesses>
        <apexClass>SellSideConflictScheduler</apexClass>
        <enabled>true</enabled>
    </classAccesses>
    <fieldPermissions>
        <editable>false</editable>
        <field>Account.SellSideConflict__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Opportunity.SellSideActive__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Opportunity.SellSideBaseDate__c</field>
        <readable>true</readable>
    </fieldPermissions>
</Profile>
```
File names must match the retrieved names exactly: `Admin.profile-meta.xml`, `Active%5F%5FIS_Buy.profile-meta.xml`, `Active_インターン.profile-meta.xml`, `Active_アプローチ管理者.profile-meta.xml`, `Active_アドバイザー.profile-meta.xml`, `Active_アドバイザー_pf.profile-meta.xml`, `Active_IS_Sell.profile-meta.xml`, `Active_IS_Sell_pf.profile-meta.xml`.

`package.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>Admin</members>
        <members>Active%5F%5FIS_Buy</members>
        <members>Active_インターン</members>
        <members>Active_アプローチ管理者</members>
        <members>Active_アドバイザー</members>
        <members>Active_アドバイザー_pf</members>
        <members>Active_IS_Sell</members>
        <members>Active_IS_Sell_pf</members>
        <name>Profile</name>
    </types>
    <types>
        <members>DealConflict_Access</members>
        <name>PermissionSet</name>
    </types>
    <version>62.0</version>
</Package>
```

- [ ] **Step 2: Retrieve the permission set from bogdan and add the three fields**

```bash
sf project retrieve start -o bogdan -m "PermissionSet:DealConflict_Access" -r scripts/deploy/sell_side_conflict/access_retrieve
```
Copy to `access/permissionsets/DealConflict_Access.permissionset-meta.xml`, then insert (alphabetical position among `<fieldPermissions>`):
```xml
    <fieldPermissions>
        <editable>false</editable>
        <field>Account.SellSideConflict__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Opportunity.SellSideActive__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Opportunity.SellSideBaseDate__c</field>
        <readable>true</readable>
    </fieldPermissions>
```
and change `<description>` to: `他案件進行中フラグ(DealConflict=進行中買い手)および進行中売り手(SellSideConflict)の参照権限。フロー/Apexがシステム権限で値を更新するため項目は読み取りのみ付与。`

- [ ] **Step 3: Deploy to bogdan and verify**

```bash
sf project deploy start -o bogdan --source-dir scripts/deploy/sell_side_conflict/access --wait 10
sf data query -o bogdan -q "SELECT Parent.Profile.Name, Parent.Name, Field, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE Field IN ('Account.SellSideConflict__c','Opportunity.SellSideActive__c','Opportunity.SellSideBaseDate__c') ORDER BY Field, Parent.Name"
```
Expected: 9 parents × 3 fields, all Read=true Edit=false (8 profiles + DealConflict_Access). Note: Admin may already show Edit=true for its own created fields; the partial profile sets editable=false, confirm it took.

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy/sell_side_conflict/access
git commit -m "Sell-side conflict: read-only FLS on 7 Active_ profiles + Admin + DealConflict_Access, class access (sandbox bogdan, <deploy id>)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Account record pages + compact layout (sandbox bogdan)

> Execution note 2026-10-16: the compact layout part was dropped by controller ruling. Account_Compact_Layout already holds the platform maximum of 10 fields (deploy error "Cannot have more than 10 fields in compact layout"); Bogdan decides at Task 8 whether to swap a field out. The brief's regex was replaced by a tempered pattern that clones the whole `<itemInstances>` block containing DealConflict__c (the original lazy regex matched from the first `<fieldInstance>` in the file).

**Files:**
- Create: `scripts/deploy/sell_side_conflict/pages/transform_account_page.js`
- Create (from retrieve + transform): `scripts/deploy/sell_side_conflict/pages/sandbox/flexipages/Japan.flexipage-meta.xml`, `International.flexipage-meta.xml`, `scripts/deploy/sell_side_conflict/pages/sandbox/objects/Account/compactLayouts/Account_Compact_Layout.compactLayout-meta.xml`

**Interfaces:**
- Consumes: `Account.SellSideConflict__c` (Task 1). The transform script is reused for prod in Task 9.

- [ ] **Step 1: Retrieve the two pages and the compact layout from bogdan**

```bash
sf project retrieve start -o bogdan -m "FlexiPage:Japan" -m "FlexiPage:International" -m "CompactLayout:Account.Account_Compact_Layout" -r scripts/deploy/sell_side_conflict/pages/retrieve_bogdan
```

- [ ] **Step 2: Write the transform script**

`transform_account_page.js` — inserts a read-only `Record.SellSideConflict__c` field instance right after the existing `Record.DealConflict__c` instance, idempotent:
```js
// node transform_account_page.js <in.flexipage-meta.xml> <out.flexipage-meta.xml>
const fs = require('fs');
const [,, inPath, outPath] = process.argv;
let xml = fs.readFileSync(inPath, 'utf8');
if (xml.includes('Record.SellSideConflict__c')) { fs.writeFileSync(outPath, xml); console.log('already present'); process.exit(0); }
const re = /(<componentInstance>|<fieldInstance>)([\s\S]*?)<fieldItem>Record\.DealConflict__c<\/fieldItem>[\s\S]*?<\/fieldInstance>/;
const m = re.exec(xml);
if (!m) { console.error('DealConflict__c field instance not found'); process.exit(1); }
const block = m[0];
const clone = block
  .replace('Record.DealConflict__c', 'Record.SellSideConflict__c')
  .replace('RecordDealConflict_cField', 'RecordSellSideConflict_cField');
// force read-only behaviour on the clone
const cloneRO = clone.replace(/(<name>uiBehavior<\/name>\s*<value>\s*<stringValue>)[^<]*(<\/stringValue>)/, '$1readonly$2');
xml = xml.replace(block, block + '\n' + cloneRO);
fs.writeFileSync(outPath, xml);
console.log('inserted SellSideConflict__c after DealConflict__c');
```

- [ ] **Step 3: Run the transform, edit the compact layout, deploy**

```bash
mkdir -p scripts/deploy/sell_side_conflict/pages/sandbox/flexipages scripts/deploy/sell_side_conflict/pages/sandbox/objects/Account/compactLayouts
node scripts/deploy/sell_side_conflict/pages/transform_account_page.js scripts/deploy/sell_side_conflict/pages/retrieve_bogdan/flexipages/Japan.flexipage-meta.xml scripts/deploy/sell_side_conflict/pages/sandbox/flexipages/Japan.flexipage-meta.xml
node scripts/deploy/sell_side_conflict/pages/transform_account_page.js scripts/deploy/sell_side_conflict/pages/retrieve_bogdan/flexipages/International.flexipage-meta.xml scripts/deploy/sell_side_conflict/pages/sandbox/flexipages/International.flexipage-meta.xml
```
Compact layout: copy the retrieved `Account_Compact_Layout.compactLayout-meta.xml` and add `<fields>SellSideConflict__c</fields>` immediately after `<fields>DealConflict__c</fields>`.
```bash
sf project deploy start -o bogdan --source-dir scripts/deploy/sell_side_conflict/pages/sandbox --wait 10
```
Expected: Succeeded (2 FlexiPage + 1 CompactLayout).

- [ ] **Step 4: Visual check**

Ask Bogdan to open the 'SSC E2E Seller' account (Task 3) in bogdan: the field 進行中売り手(接触注意) appears directly under 進行中買い手(接触注意), read-only, and in the highlights panel. Record the result in the task notes.

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy/sell_side_conflict/pages
git commit -m "Sell-side conflict: SellSideConflict__c on Account pages Japan/International + compact layout via transform script (sandbox bogdan, <deploy id>)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Data rehearsal in the partial sandbox (metadata + backfill + 90-day behaviour)

**Files:**
- Create: `scripts/deploy/sell_side_conflict/backfill/backup_flags.sh`
- Create: `scripts/deploy/sell_side_conflict/backfill/report_flags.sh`
- Create: `scripts/deploy/sell_side_conflict/backfill/run_recalculate_all.apex`

**Interfaces:**
- Consumes: everything from Tasks 1–6. Produces: the scripts reused for prod in Task 9.

- [ ] **Step 1: Deploy all packages to partial in order**

```bash
sf project deploy start -o partial --source-dir scripts/deploy/sell_side_conflict/fields --wait 10
sf project deploy start -o partial --source-dir scripts/deploy/sell_side_conflict/apex --test-level RunSpecifiedTests --tests SellSideConflictRecalculatorTest --wait 15
sf project deploy start -o partial --source-dir scripts/deploy/sell_side_conflict/flow --wait 10
# activate flow v1 via Tooling PATCH (see Global Constraints)
sf project deploy start -o partial --source-dir scripts/deploy/sell_side_conflict/labels --wait 10
sf project deploy start -o partial --source-dir scripts/deploy/sell_side_conflict/access --wait 10
```
Pages: re-retrieve Japan/International/compact layout FROM PARTIAL into `pages/retrieve_partial`, run the transform into `pages/partial/`, deploy `pages/partial`. Expected: all Succeeded, tests 6/6.

- [ ] **Step 2: Write the backup, run, and report scripts**

`backup_flags.sh` (usage: `backup_flags.sh <org> <outfile.json>`):
```bash
#!/usr/bin/env bash
set -e
org="$1"; out="$2"
sf data query -o "$org" -q "SELECT Id, Name, SellSideConflict__c, DealConflict__c FROM Account WHERE SellSideConflict__c = true OR DealConflict__c = true" --json > "$out"
echo "saved $(grep -c '\"Id\"' "$out") rows to $out"
```
`run_recalculate_all.apex`:
```apex
Integer n = SellSideConflictRecalculator.recalculateAll();
System.debug('SellSideConflict recalculateAll updated: ' + n);
```
`report_flags.sh` (usage: `report_flags.sh <org>`):
```bash
#!/usr/bin/env bash
org="$1"
echo "== ON total"; sf data query -o "$org" -q "SELECT COUNT(Id) FROM Account WHERE SellSideConflict__c = true"
echo "== ON by Account record type"; sf data query -o "$org" -q "SELECT RecordType.Name, COUNT(Id) FROM Account WHERE SellSideConflict__c = true GROUP BY RecordType.Name"
echo "== ON as seller (has own active opp)"; sf data query -o "$org" -q "SELECT COUNT_DISTINCT(AccountId) FROM Opportunity WHERE SellSideActive__c = true AND Account.SellSideConflict__c = true"
echo "== ON only as parent"; sf data query -o "$org" -q "SELECT COUNT(Id) FROM Account WHERE SellSideConflict__c = true AND Id NOT IN (SELECT AccountId FROM Opportunity WHERE SellSideActive__c = true)"
echo "== active opps by record type"; sf data query -o "$org" -q "SELECT RecordType.DeveloperName, COUNT(Id) FROM Opportunity WHERE SellSideActive__c = true GROUP BY RecordType.DeveloperName"
echo "== active opps by last modifier (automation check)"; sf data query -o "$org" -q "SELECT LastModifiedBy.Name, COUNT(Id) FROM Opportunity WHERE SellSideActive__c = true GROUP BY LastModifiedBy.Name ORDER BY COUNT(Id) DESC"
```

- [ ] **Step 3: Run the rehearsal in partial**

```bash
bash scripts/deploy/sell_side_conflict/backfill/backup_flags.sh partial scripts/deploy/sell_side_conflict/backfill/partial_before.json
sf apex run -o partial --file scripts/deploy/sell_side_conflict/backfill/run_recalculate_all.apex
bash scripts/deploy/sell_side_conflict/backfill/report_flags.sh partial
```
Expected: run completes with no exception; ON total = (distinct sellers of active opps) + (parents not already sellers); "active opps by last modifier" shows real users, not an automation user (if an automation user dominates, note it: the window is inflated by that automation and report to Bogdan before prod).

- [ ] **Step 4: 90-day behaviour check with real data**

```bash
sf data query -o partial -q "SELECT Id, Name, StageName, SellSideBaseDate__c, SellSideActive__c, Account.Name, Account.SellSideConflict__c FROM Opportunity WHERE StageName IN ('案件化','面談前','MGマッチング中') AND SellSideActive__c = false AND RecordType.DeveloperName != 'CB_Sourcing_Path' LIMIT 5"
```
Expected: rows exist with `SellSideBaseDate__c` older than 90 days and the account OFF (unless another opp keeps it ON). Pick one, touch it (`sf data update record -o partial -s Opportunity -i <id> -v "Description='SSC touch'"`): the flow does not fire (no stage/account change) but the formula flips to true because LastModifiedDate moved; run `run_recalculate_all.apex` again and confirm the account turns ON. This proves the daily job catches changes the flow does not.

- [ ] **Step 5: Verify the buyer-side automation still passes in partial**

```bash
sf apex run test -o partial --tests DealConflictRecalculatorTest --result-format human --wait 15
```
Expected: pass (if it fails on pre-existing data/VR issues unrelated to labels, record the failure text; relabeling cannot break Apex since API names are unchanged).

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy/sell_side_conflict/backfill scripts/deploy/sell_side_conflict/pages/partial
git commit -m "Sell-side conflict: partial-sandbox rehearsal (backfill scripts, before-snapshot, report), 90-day expiry verified

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Prod pre-change snapshot + impact analysis + approval

**Files:**
- Create: `scripts/deploy/sell_side_conflict/prod/README.md` (deploy order + exact commands for Bogdan)
- Create: `scripts/deploy/sell_side_conflict/prod/snapshot_before/` (retrieved prod metadata of every component this change touches)

- [ ] **Step 1: Retrieve the before-snapshot from prod (read-only)**

```bash
sf project retrieve start -o prod -m "CustomField:Account.DealConflict__c" -m "CustomField:Matching__c.DealConflict_M__c" -m "CustomObjectTranslation:Account-en_US" -m "CustomObjectTranslation:Matching__c-en_US" -m "CustomObjectTranslation:Opportunity-en_US" -m "FlexiPage:Japan" -m "FlexiPage:International" -m "CompactLayout:Account.Account_Compact_Layout" -m "PermissionSet:DealConflict_Access" -m "Profile:Admin" -m "Profile:Active%5F%5FIS_Buy" -m "Profile:Active_インターン" -m "Profile:Active_アプローチ管理者" -m "Profile:Active_アドバイザー" -m "Profile:Active_アドバイザー_pf" -m "Profile:Active_IS_Sell" -m "Profile:Active_IS_Sell_pf" -r scripts/deploy/sell_side_conflict/prod/snapshot_before
bash scripts/deploy/sell_side_conflict/backfill/backup_flags.sh prod scripts/deploy/sell_side_conflict/backfill/prod_before.json
```
Expected: 17 components; prod_before.json has the 12 DealConflict accounts and 0 SellSideConflict.

- [ ] **Step 2: Build the prod page files from the prod snapshot**

```bash
node scripts/deploy/sell_side_conflict/pages/transform_account_page.js scripts/deploy/sell_side_conflict/prod/snapshot_before/flexipages/Japan.flexipage-meta.xml scripts/deploy/sell_side_conflict/pages/prod/flexipages/Japan.flexipage-meta.xml
node scripts/deploy/sell_side_conflict/pages/transform_account_page.js scripts/deploy/sell_side_conflict/prod/snapshot_before/flexipages/International.flexipage-meta.xml scripts/deploy/sell_side_conflict/pages/prod/flexipages/International.flexipage-meta.xml
```
Compact layout and permission set: copy from the prod snapshot and apply the same one-line additions as Tasks 5–6 into `pages/prod/` and `access/prod_permissionsets/`. Translations: copy the three prod snapshot files into `labels/prod/objectTranslations/` and apply the Task 4 edits. Diff each prod file against its snapshot (`git diff --no-index`) and confirm only the intended lines differ.

- [ ] **Step 3: Write the README with the deploy order and show the impact analysis to Bogdan**

README content: order = fields → apex (RunSpecifiedTests) → flow (deploy, do NOT activate yet) → labels → access → pages → flow activation → backfill → schedule job → after-snapshot. One `sf` command per line, each prefixed with `! ` for Bogdan. Impact analysis = list of the 17 touched components plus the 60+ components that reference DealConflict__c and are expected to be unaffected (API names unchanged).

Stop here and get Bogdan's explicit approval before Task 9. He also decides whether the Matching mirror field (Task 10) ships now or later.

---

### Task 9: Prod deploy (commands run by Bogdan with `!`), backfill, schedule, after-snapshot

- [ ] **Step 1: Bogdan runs the deploys in README order**

Claude verifies each result (`sf project deploy report -o prod -i <id>`), records deploy ids, and stops at the first failure.

- [ ] **Step 2: Flow activation (needs Bogdan's go)**

```bash
sf data query -o prod --use-tooling-api -q "SELECT Id FROM FlowDefinition WHERE DeveloperName='Opportunity_AfterSave_RecomputeSellSideConflict'"
# Bogdan: ! sf api request rest -o prod --method PATCH "services/data/v62.0/tooling/sobjects/FlowDefinition/<300 id>" --body '{"Metadata":{"activeVersionNumber":1}}'
```

- [ ] **Step 3: Backfill**

```bash
# Bogdan: ! sf apex run -o prod --file scripts/deploy/sell_side_conflict/backfill/run_recalculate_all.apex
bash scripts/deploy/sell_side_conflict/backfill/report_flags.sh prod
```
Report to Bogdan: ON total, by record type, seller vs parent-only, active opps by record type, and the last-modifier table. Expected ≈ 337; if materially higher, flag it as the spec requests.

- [ ] **Step 4: Schedule the daily job**

```bash
# Bogdan: ! sf apex run -o prod --file scripts/deploy/sell_side_conflict/backfill/schedule_job.apex
```
`schedule_job.apex`:
```apex
System.schedule('SellSideConflict Daily', '0 0 20 * * ?', new SellSideConflictScheduler());
```
Verify: `sf data query -o prod -q "SELECT CronJobDetail.Name, NextFireTime, State FROM CronTrigger WHERE CronJobDetail.Name='SellSideConflict Daily'"` → State WAITING, NextFireTime 20:00Z.

- [ ] **Step 5: After-snapshot and diff**

Retrieve the same 17 components into `prod/snapshot_after/`, `git diff --no-index` before vs after, confirm only intended lines changed. Commit everything with the prod deploy ids. Log in the tracker (`/tracker`) as T-004 種別 追加, owner Bogdan, with the note that API names were deliberately kept.

---

### Task 10 (optional, Bogdan decides): Matching mirror field SellSideConflict_M__c

**Files:**
- Create: `scripts/deploy/sell_side_conflict/mirror/objects/Matching__c/fields/SellSideConflict_M__c.field-meta.xml`
- Modify (retrieve + edit): 5 Matching layouts, 4 Matching flexipages, Matching__c-en_US translation, 8 profiles + DealConflict_Access (FLS)

- [ ] **Step 1: Field**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>SellSideConflict_M__c</fullName>
    <description>買い手(譲受希望会社)の進行中売り手フラグ(Account.SellSideConflict__c)を表示(マッチングのレポート/リストビューで列表示するため)。※数式のためリストビューの絞り込み条件には使用不可。</description>
    <externalId>false</externalId>
    <formula>Buy_Company__r.SellSideConflict__c</formula>
    <formulaTreatBlanksAs>BlankAsZero</formulaTreatBlanksAs>
    <inlineHelpText>この買い手候補は別の譲渡案件で売り手として進行中です。買い手としての案内は送らないでください。※自動で反映されます</inlineHelpText>
    <label>進行中売り手(接触注意)</label>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>Checkbox</type>
</CustomField>
```

- [ ] **Step 2: Placement** — in each of the 5 Matching layouts add `<layoutItems><behavior>Readonly</behavior><field>SellSideConflict_M__c</field></layoutItems>` right after the `DealConflict_M__c` item; in the 4 Matching flexipages reuse `transform_account_page.js` logic with `Record.DealConflict_M__c` → `Record.SellSideConflict_M__c` (parameterise the script: third argument = source field API name). FLS and en_US entries as in Tasks 4–5. Sandbox first (bogdan), visual check, then prod via Bogdan.

- [ ] **Step 3: Commit** with the same message pattern.

---

### Task 11: Reference verification after the change (request Task 2)

- [ ] **Step 1: Automated checks in prod (read-only)**

```bash
sf apex run test -o prod --tests DealConflictRecalculatorTest --tests SellSideConflictRecalculatorTest --result-format human --wait 20
```
Expected: pass. (Running tests writes nothing; test data rolls back.)
```bash
sf data query -o prod -q "SELECT ApiName, IsActive FROM FlowDefinitionView WHERE ApiName LIKE '%Conflict%'"
```
Expected: the 5 buyer flows still active + the new one active.

- [ ] **Step 2: Manual checks by Bogdan (advisor test account)**

Open: one Account (Japan page), one International account, one Matching record on each of the 4 Matching pages, report type Account_Matching in the report builder, one long-list report in SatoMizuki/LongList, Account list view with the field as column. Expected: new labels show, no "field not found" errors, long-list report filter still "進行中買い手(接触注意) equals False".

- [ ] **Step 3: Record results** in `scripts/deploy/sell_side_conflict/prod/README.md` under "Verification 2026-xx-xx" and commit.

---

### Task 12: Manual update (request Task 3)

- [ ] **Step 1:** Ask Bogdan for the manual's location (Google Doc / docx / Confluence). Write the new section in Japanese with an English summary: both flags' meaning, the exact rule (stage list, 90 days, parent), timing (on save + daily 05:00), "do not edit manually", where the fields appear, and the deliberate API-name note.
- [ ] **Step 2:** Update memory (`project_sell_side_conflict.md`) with deploy ids, counts, and lessons; commit the repo.
