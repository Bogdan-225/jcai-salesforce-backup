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
        // VR Required_CheckFieldsWhenSuccess: all four final-confirmation checkboxes needed at 成約
        src.Confirm_BuyersBank_POC__c = true;
        src.Confirm_SellersBank_POC__c = true;
        src.UpdateShareholderRegistry__c = true;
        src.VerifyWireTransferPayment__c = true;
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
    static void siblingKeepsParentOn() {
        Account parent = newAccount('SSC Sib Parent', null);
        insert parent;
        Account c1 = newAccount('SSC Sib C1', parent.Id);
        Account c2 = newAccount('SSC Sib C2', parent.Id);
        insert new List<Account>{ c1, c2 };
        insert newOpp('SSC Sib opp', c1.Id, '案件化', sellingRt());
        SellSideConflictRecalculator.recalculate(new Set<Id>{ c1.Id });
        System.assertEquals(true, flag(c1.Id), 'C1 on after its own recompute');

        SellSideConflictRecalculator.recalculate(new Set<Id>{ c2.Id });

        System.assertEquals(true, flag(parent.Id), 'parent stays on because sibling C1 is active');
        System.assertEquals(true, flag(c1.Id), 'C1 unchanged by recomputing C2');
        System.assertEquals(false, flag(c2.Id), 'C2 has no opportunity of its own');
    }

    @isTest
    static void schedulerRuns() {
        Test.startTest();
        String jobId = System.schedule('SSC test ' + Datetime.now().getTime(), '0 0 20 * * ?', new SellSideConflictScheduler());
        Test.stopTest();
        System.assertNotEquals(null, jobId);
    }
}
