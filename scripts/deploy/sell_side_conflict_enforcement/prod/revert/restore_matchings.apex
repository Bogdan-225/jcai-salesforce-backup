// Rollback of the sell-side sweep: restore Matchings from sweep/prod_before/matchings_before.csv.
// Fill a COPY (sweep/prod_before/restore_matchings.filled.apex, git-ignored), never this file. See prod/revert/README.md.
// Run only with flows A, B, C inactive.
// One line per CSV row, columns 1-5 in this order:
//   Id, phase_match__c, status__c, termination_reason__c, other_termination_reason__c
// Empty cell -> ''. Escape ' as \' and a line break inside a cell as \n. Comma between lines, none after the last.
List<List<String>> rows = new List<List<String>>{
    // new List<String>{'a00XXXXXXXXXXXXXXX', 'アプローチ', '-', '', ''},
    // new List<String>{'a00YYYYYYYYYYYYYYY', 'MG対応', '未確認', '', ''}
};

System.assert(!rows.isEmpty(), 'no rows: paste the backup rows first');
Map<Id, List<String>> before = new Map<Id, List<String>>();
for (List<String> r : rows) {
    System.assertEquals(5, r.size(), 'each row needs 5 values: ' + r);
    before.put(Id.valueOf(r[0]), r);
}

List<Matching__c> changed = new List<Matching__c>();
Integer restored = 0;
Integer markersOnly = 0;
for (Matching__c m : [SELECT Id, SellSideAutoTerminated__c, SellSideConflictWarned__c, SellSideConflictSourceName__c
                      FROM Matching__c WHERE Id IN :before.keySet()]) {
    List<String> r = before.remove(m.Id);
    if (!m.SellSideAutoTerminated__c && !m.SellSideConflictWarned__c && m.SellSideConflictSourceName__c == null) continue;
    if (m.SellSideAutoTerminated__c) {
        m.phase_match__c = String.isBlank(r[1]) ? null : r[1];
        m.status__c = String.isBlank(r[2]) ? null : r[2];
        m.termination_reason__c = String.isBlank(r[3]) ? null : r[3];
        m.other_termination_reason__c = String.isBlank(r[4]) ? null : r[4];
        restored++;
    } else {
        markersOnly++;
    }
    m.SellSideAutoTerminated__c = false;
    m.SellSideConflictWarned__c = false;
    m.SellSideConflictSourceName__c = null;
    changed.add(m);
}
for (Id missing : before.keySet()) System.debug('NOT FOUND (deleted?): ' + missing);

update changed;
System.debug('restored ' + restored + ', markers cleared only ' + markersOnly + ', not found ' + before.size());

// Terminated outside the backup (new Matchings terminated by flow C, or accounts flagged after the backup): left as they are.
for (Matching__c m : [SELECT Id, Name, phase_match__c FROM Matching__c WHERE SellSideAutoTerminated__c = true]) {
    System.debug('NOT IN BACKUP, still terminated (decide by hand): ' + m.Id + ' ' + m.Name);
}
