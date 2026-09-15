// Step-4 scenario test for the Account duplicate rules (run in a sandbox with data, e.g. partial).
// Through the API an "Alert" duplicate rule returns a DUPLICATES_DETECTED error, so every scenario
// is an insert attempt: ALERT = the rule fired (nothing saved), NO ALERT = saved and deleted again.
// Run: sf apex run --target-org partial --file scripts/apex/test_duplicate_rules.apex
Id DOM = '012BL0000004I8fYAE';
Id INTL = '012RA00000AVG7ZYAX';

// existing records in partial used as targets:
//  TKS株式会社                      phone 054-208-1155, TDB postal 421-2124, corp 1080001010915
//  Vighnaharta Technologies Pvt Ltd website https://www.vighnaharta.in/, CB postal 411041
//  Malkit Agrotech Private Limited  phone +91 9876 000 941
List<Object[]> cases = new List<Object[]>{
    // label, expected, account
    new Object[]{'D1 name variant + same postal            ', 'ALERT',
        new Account(RecordTypeId=DOM, Name='TKS(株)', TDBPostalCode__c='4212124', CorporateNumber__c='9999999999901')},
    new Object[]{'D2 name variant only (no postal)         ', 'NO ALERT',
        new Account(RecordTypeId=DOM, Name='TKS(株)', CorporateNumber__c='9999999999902')},
    new Object[]{'D3 different name, same phone (+81 form) ', 'ALERT',
        new Account(RecordTypeId=DOM, Name='テスト商事株式会社', Phone='+81-54-208-1155', CorporateNumber__c='9999999999903')},
    new Object[]{'D4 different name, corp no as 12 digits  ', 'ALERT',
        new Account(RecordTypeId=DOM, Name='テスト商事株式会社', CorporateNumber__c='080001010915')},
    new Object[]{'D5 placeholder phone only                ', 'NO ALERT',
        new Account(RecordTypeId=DOM, Name='テスト商事株式会社', Phone='03-0000-0000', CorporateNumber__c='9999999999905')},
    new Object[]{'D6 fuzzy JP name + same postal (info)     ', 'INFO',
        new Account(RecordTypeId=DOM, Name='ティー・ケー・エス株式会社', TDBPostalCode__c='421-2124', CorporateNumber__c='9999999999906')},
    new Object[]{'D7 domestic RT, website of an INTL record', 'INFO',
        new Account(RecordTypeId=DOM, Name='テスト商事株式会社', Website='https://www.vighnaharta.in/', CorporateNumber__c='9999999999907')},
    new Object[]{'I1 name exact, different designator/case ', 'ALERT',
        new Account(RecordTypeId=INTL, Name='VIGHNAHARTA TECHNOLOGIES PRIVATE LIMITED')},
    new Object[]{'I2 fuzzy name + same website             ', 'ALERT',
        new Account(RecordTypeId=INTL, Name='Vighnaharta Technology Pvt. Ltd.', Website='http://vighnaharta.in')},
    new Object[]{'I3 unrelated name + same website (dealer)', 'NO ALERT',
        new Account(RecordTypeId=INTL, Name='Completely Different Trading Co', Website='www.vighnaharta.in')},
    new Object[]{'I4 unrelated name + same phone (HQ line) ', 'NO ALERT',
        new Account(RecordTypeId=INTL, Name='Some Other Company Ltd', Phone='+91 9876 000 941')},
    new Object[]{'I5 fuzzy name + same phone               ', 'ALERT',
        new Account(RecordTypeId=INTL, Name='Malkit Agro Tech Ltd', Phone='+91 9876 000 941')},
    new Object[]{'I6 fuzzy (typo) name + same postal (info)', 'INFO',
        new Account(RecordTypeId=INTL, Name='Vighnahartha Technologys Pvt Ltd', CB_Postalcode__c='411041')},
    new Object[]{'I7 unrelated intl account                ', 'NO ALERT',
        new Account(RecordTypeId=INTL, Name='Zebra Quantum Widgets Ltd', Website='www.zebra-quantum-widgets.example', Phone='+1 212 555 0100')}
};

List<Account> created = new List<Account>();
Integer pass = 0, fail = 0;
for (Object[] c : cases) {
    String label = (String) c[0];
    String expected = (String) c[1];
    Account a = (Account) c[2];
    Database.SaveResult sr = Database.insert(a, false);
    String outcome; String detail = '';
    if (sr.isSuccess()) {
        outcome = 'NO ALERT';
        created.add(a);
    } else {
        outcome = 'ERROR';
        for (Database.Error e : sr.getErrors()) {
            if (e instanceof Database.DuplicateError) {
                outcome = 'ALERT';
                Datacloud.DuplicateResult dr = ((Database.DuplicateError) e).getDuplicateResult();
                List<String> hits = new List<String>();
                for (Datacloud.MatchResult mr : dr.getMatchResults()) {
                    for (Datacloud.MatchRecord m : mr.getMatchRecords()) {
                        hits.add((String) m.getRecord().get('Name') + ' [' + mr.getRule() + ']');
                    }
                }
                detail = String.join(hits, '; ');
            } else {
                detail = e.getStatusCode() + ' ' + e.getMessage();
            }
        }
    }
    String verdict = expected == 'INFO' ? 'info' : (outcome == expected ? 'PASS' : 'FAIL');
    if (verdict == 'PASS') pass++; if (verdict == 'FAIL') fail++;
    System.debug(LoggingLevel.INFO, 'RESULT ' + verdict + ' | ' + label + ' | expected ' + expected + ' | got ' + outcome + (detail == '' ? '' : ' -> ' + detail));
}
if (!created.isEmpty()) {
    delete created;
    Database.emptyRecycleBin(created);
}
System.debug(LoggingLevel.INFO, 'RESULT SUMMARY pass=' + pass + ' fail=' + fail + ' cleaned=' + created.size());
