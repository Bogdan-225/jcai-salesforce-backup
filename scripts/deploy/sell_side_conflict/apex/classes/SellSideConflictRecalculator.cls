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
 * Request inputs are String (not Id): Flow passes an empty string for a null $Record__Prior.AccountId
 * on create, which fails Id-typed inputs ("Invalid id:"). toId() maps blank/invalid to null.
 * without sharing: the flag must not depend on the saving user's record visibility (T-002 hides
 * opportunities from IS users). Only differing accounts are updated (idempotent, no recursion).
 */
public without sharing class SellSideConflictRecalculator {

    public class Request {
        @InvocableVariable(required=false label='Account Id (current seller)')
        public String accountId;
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
