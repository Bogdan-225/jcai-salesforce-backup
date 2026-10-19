// verify_enforcement.apex - Sell-Side Conflict ENFORCEMENT, sandbox bogdan (2026-10-19).
// Prints PASS/FAIL lines; run with:
//   sf apex run -o bogdan --file scripts/deploy/sell_side_conflict_enforcement/test/verify_enforcement.apex | grep -E "PASS|FAIL|SKIP"
// Matching__c.Name is an auto-number in this org, so test Matchings are identified by buyer Account name + deal (Sell__r) name.
// The T1/T2 block is unguarded on purpose: before the data script has run, the first query throws (RED state).
// Needs perm set DealConflict_Access on the running user (AutoTerminated__c, Deal_Is_Dead__c are hidden otherwise).
List<String> out = new List<String>();
void check(Boolean ok, String msg) { out.add((ok ? 'PASS ' : 'FAIL ') + msg); }
Matching__c mq(String buyer, String deal) {
    List<Matching__c> l = [SELECT Id, RecordType.DeveloperName, phase_match__c, status__c, termination_reason__c, other_termination_reason__c,
                                  SellSideAutoTerminated__c, SellSideConflictWarned__c, SellSideConflictSourceName__c, AutoTerminated__c
                           FROM Matching__c WHERE Buy_Company__r.Name = :buyer AND Sell__r.Name = :deal];
    return l.isEmpty() ? null : l[0];
}
Integer tasks(Id whatId, String subj) { return [SELECT COUNT() FROM Task WHERE WhatId = :whatId AND Subject = :subj]; }
Integer events(Id whatId, String subj) { return [SELECT COUNT() FROM Event WHERE WhatId = :whatId AND Subject = :subj]; }
Boolean terminated(Matching__c m, String src) {
    return m.phase_match__c == 'マッチ終了' && m.status__c == 'アプローチ>終了' && m.termination_reason__c == 'リスト除外'
        && m.other_termination_reason__c == '売り手として進行中のため' && m.SellSideAutoTerminated__c && m.SellSideConflictWarned__c
        && m.SellSideConflictSourceName__c == src;
}
String show(Matching__c m) {
    return m.phase_match__c + '/' + m.status__c + '/' + m.termination_reason__c + '/' + m.other_termination_reason__c
        + '/SSAuto=' + m.SellSideAutoTerminated__c + '/Warned=' + m.SellSideConflictWarned__c + '/Src=' + m.SellSideConflictSourceName__c;
}

// ---------- T1 (O1 at NDA締結) / T2 (O1 at 案件終了) ----------
Matching__c m1 = [SELECT Id, phase_match__c, status__c, termination_reason__c, other_termination_reason__c, SellSideAutoTerminated__c, SellSideConflictWarned__c, SellSideConflictSourceName__c
                  FROM Matching__c WHERE Buy_Company__r.Name = 'SSE-T1 Buyer' AND Sell__r.Name = 'SSE-T Deal D1'];
Matching__c m2 = [SELECT Id, phase_match__c, SellSideAutoTerminated__c, SellSideConflictWarned__c
                  FROM Matching__c WHERE Buy_Company__r.Name = 'SSE-T1 Buyer' AND Sell__r.Name = 'SSE-T Deal D2'];
Account b1 = [SELECT Id, SellSideConflict__c, SellSideConflictSourceId__c, SellSideConflictSourceName__c FROM Account WHERE Name = 'SSE-T1 Buyer'];
Opportunity o1 = [SELECT Id, Name, StageName FROM Opportunity WHERE Name = 'SSE-T1 Own Opp'];
if (o1.StageName != '案件終了') {
    out.add('---- T1 (O1 stage ' + o1.StageName + ')');
    check(b1.SellSideConflict__c, 'T1 B1 flag ON');
    check(m1.phase_match__c == 'マッチ終了' && m1.status__c == 'アプローチ>終了', 'T1 M1 terminated phase/status: ' + m1.phase_match__c + '/' + m1.status__c);
    check(m1.termination_reason__c == 'リスト除外' && m1.other_termination_reason__c == '売り手として進行中のため', 'T1 M1 reasons');
    check(m1.SellSideAutoTerminated__c && m1.SellSideConflictWarned__c, 'T1 M1 markers');
    check(m1.SellSideConflictSourceName__c == o1.Name, 'T1 M1 source name = ' + m1.SellSideConflictSourceName__c);
    check(m2.phase_match__c == 'MG対応' && !m2.SellSideAutoTerminated__c && m2.SellSideConflictWarned__c, 'T1 M2 warned only');
    check(b1.SellSideConflictSourceId__c == String.valueOf(o1.Id) && b1.SellSideConflictSourceName__c == o1.Name, 'T1 B1 source fields');
    check([SELECT COUNT() FROM Task WHERE WhatId = :m1.Id AND Subject = :('Seller Conflict: ' + o1.Name)] == 1, 'T1 M1 memo task');
    check([SELECT COUNT() FROM Task WHERE WhatId = :m2.Id AND Subject = :('Seller Conflict: ' + o1.Name)] == 1, 'T1 M2 memo task');
    check([SELECT COUNT() FROM Event WHERE WhatId = :b1.Id AND Subject = :('Seller Conflict: ' + o1.Name)] == 1, 'T1 B1 memo event');
} else {
    out.add('---- T2 (O1 stage 案件終了)');
    check(!b1.SellSideConflict__c, 'T2 B1 flag OFF');
    check(m1.phase_match__c == 'MG対応' && m1.status__c == '未確認', 'T2 M1 revived phase/status: ' + m1.phase_match__c + '/' + m1.status__c);
    check(m1.termination_reason__c == null && m1.other_termination_reason__c == null, 'T2 M1 reasons blank: ' + m1.termination_reason__c + '/' + m1.other_termination_reason__c);
    check(!m1.SellSideAutoTerminated__c && !m1.SellSideConflictWarned__c, 'T2 M1 markers false');
    check(m1.SellSideConflictSourceName__c == null, 'T2 M1 source name blank: ' + m1.SellSideConflictSourceName__c);
    check(m2.phase_match__c == 'MG対応' && !m2.SellSideAutoTerminated__c && !m2.SellSideConflictWarned__c, 'T2 M2 Warned false');
    check(tasks(m2.Id, 'Seller Conflict: ' + o1.Name) == 1 && tasks(m2.Id, 'Seller Conflict Cleared: ' + o1.Name) == 1, 'T2 M2 tasks: conflict + cleared');
    check(events(b1.Id, 'Seller Conflict: ' + o1.Name) == 1 && events(b1.Id, 'Seller Conflict Cleared: ' + o1.Name) == 1, 'T2 B1 events: conflict + cleared');
    check(b1.SellSideConflictSourceId__c == null && b1.SellSideConflictSourceName__c == null, 'T2 B1 source fields blank');
    out.add('INFO T2 M1 tasks conflict=' + tasks(m1.Id, 'Seller Conflict: ' + o1.Name) + ' cleared=' + tasks(m1.Id, 'Seller Conflict Cleared: ' + o1.Name));
}

// ---------- T3: new Matching at アプローチ for flagged buyer B3 ----------
Account b3 = [SELECT Id, SellSideConflict__c FROM Account WHERE Name = 'SSE-T3 Buyer'];
Matching__c m3 = mq('SSE-T3 Buyer', 'SSE-T Deal D1');
if (m3 == null) { out.add('SKIP T3 (M3 not inserted yet)'); } else {
    check(b3.SellSideConflict__c, 'T3 B3 flag ON');
    check(terminated(m3, 'SSE-T3 Own Opp'), 'T3 M3 terminated on save: ' + show(m3));
    check(tasks(m3.Id, 'Seller Conflict: SSE-T3 Own Opp') == 1, 'T3 M3 memo task');
    // one Event from the flag going ON at data-script time + one from the M3 insert
    check(events(b3.Id, 'Seller Conflict: SSE-T3 Own Opp') == 2, 'T3 B3 events (flag-on + M3) = ' + events(b3.Id, 'Seller Conflict: SSE-T3 Own Opp'));
}

// ---------- T4: CB_Target and dead-deal Matchings are left alone ----------
Matching__c m4 = mq('SSE-T4 Buyer', 'SSE-T Deal D1');
Matching__c m5 = mq('SSE-T4 Buyer', 'SSE-T Deal Dead');
if (m4 == null) { out.add('SKIP T4 M4 (CB_Target Matching not inserted yet; needs CB_Target record type visibility, see plan)'); } else {
    check(m4.RecordType.DeveloperName == 'CB_Target' && m4.phase_match__c == 'アプローチ' && !m4.SellSideAutoTerminated__c && !m4.SellSideConflictWarned__c, 'T4 M4 (CB_Target) untouched: ' + show(m4));
    check(tasks(m4.Id, 'Seller Conflict: SSE-T4 Own Opp') == 0, 'T4 no memo task on M4');
}
if (m5 == null) { out.add('SKIP T4 M5 (dead-deal Matching not inserted yet)'); } else {
    check(m5.phase_match__c == 'アプローチ' && !m5.SellSideAutoTerminated__c && !m5.SellSideConflictWarned__c, 'T4 M5 (dead deal) untouched: ' + show(m5));
    check(tasks(m5.Id, 'Seller Conflict: SSE-T4 Own Opp') == 0, 'T4 no memo task on M5');
}
Account b4 = [SELECT Id FROM Account WHERE Name = 'SSE-T4 Buyer'];
// only the flag-on Event from data-script time; inserts of M4/M5 must not add one
check(events(b4.Id, 'Seller Conflict: SSE-T4 Own Opp') == 1, 'T4 B4 events stay at 1 (flag-on only) = ' + events(b4.Id, 'Seller Conflict: SSE-T4 Own Opp'));

// ---------- T5: parent flagged through subsidiary's Opp ----------
Opportunity o5 = [SELECT Id, Name, StageName FROM Opportunity WHERE Name = 'SSE-T5 Child Opp'];
Account p5 = [SELECT Id, SellSideConflict__c, SellSideConflictSourceId__c, SellSideConflictSourceName__c FROM Account WHERE Name = 'SSE-T5 Parent'];
Matching__c m6 = mq('SSE-T5 Parent', 'SSE-T Deal D1');
if (o5.StageName == 'リード反響') { out.add('SKIP T5 (child opp not moved yet)'); } else {
    check(p5.SellSideConflict__c, 'T5 parent flag ON');
    check(terminated(m6, o5.Name), 'T5 M6 terminated, source = child opp: ' + show(m6));
    check(p5.SellSideConflictSourceId__c == String.valueOf(o5.Id) && p5.SellSideConflictSourceName__c == o5.Name, 'T5 parent source fields = ' + p5.SellSideConflictSourceName__c);
    check(tasks(m6.Id, 'Seller Conflict: ' + o5.Name) == 1, 'T5 M6 memo task');
    check(events(p5.Id, 'Seller Conflict: ' + o5.Name) == 1, 'T5 parent memo event');
}

// ---------- T6: buyer-mechanism Matching never touched ----------
Opportunity o6 = [SELECT Id, Name, StageName FROM Opportunity WHERE Name = 'SSE-T6 Own Opp'];
Account b6 = [SELECT Id, SellSideConflict__c FROM Account WHERE Name = 'SSE-T6 Buyer'];
Matching__c m7 = mq('SSE-T6 Buyer', 'SSE-T Deal D1');
out.add('---- T6 (O6 stage ' + o6.StageName + ', B6 flag ' + b6.SellSideConflict__c + ')');
check(m7.phase_match__c == 'マッチ終了' && m7.status__c == 'アプローチ>終了' && m7.other_termination_reason__c == '他案件進行中のため' && m7.AutoTerminated__c
      && !m7.SellSideAutoTerminated__c && !m7.SellSideConflictWarned__c && m7.SellSideConflictSourceName__c == null, 'T6 M7 untouched: ' + show(m7) + '/AutoTerminated=' + m7.AutoTerminated__c);
check([SELECT COUNT() FROM Task WHERE WhatId = :m7.Id] == 0, 'T6 no tasks on M7');
if (o6.StageName == '案件終了') {
    check(!b6.SellSideConflict__c, 'T6 B6 flag back OFF');
    check(events(b6.Id, 'Seller Conflict: SSE-T6 Own Opp') == 1 && events(b6.Id, 'Seller Conflict Cleared: SSE-T6 Own Opp') == 1, 'T6 B6 events: conflict + cleared');
}

System.debug('\n' + String.join(out, '\n'));
