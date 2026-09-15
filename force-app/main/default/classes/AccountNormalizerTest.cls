@IsTest
private class AccountNormalizerTest {

    // ------------------------------------------------------------- Name

    @IsTest
    static void name_stripsJapaneseDesignatorsAndWidth() {
        System.assertEquals('トヨタ自動車', AccountNormalizer.normalizeName('トヨタ自動車株式会社'));
        System.assertEquals('トヨタ自動車', AccountNormalizer.normalizeName('株式会社トヨタ自動車'));
        System.assertEquals('トヨタ自動車', AccountNormalizer.normalizeName('(株)トヨタ自動車'));
        System.assertEquals('トヨタ自動車', AccountNormalizer.normalizeName('（株）トヨタ自動車'));   // full-width parens
        System.assertEquals('トヨタ自動車', AccountNormalizer.normalizeName('㈱トヨタ自動車'));
        System.assertEquals('トヨタ自動車', AccountNormalizer.normalizeName('トヨタ　自動車　株式会社')); // full-width spaces
        System.assertEquals('日本経営研究所', AccountNormalizer.normalizeName('有限会社 日本経営研究所'));
    }

    @IsTest
    static void name_stripsEnglishDesignatorsPunctuationAndCase() {
        System.assertEquals('buyertest', AccountNormalizer.normalizeName('Buyer Test inc.'));
        System.assertEquals('buyertest', AccountNormalizer.normalizeName('BUYER TEST, Inc'));
        System.assertEquals('buyertest', AccountNormalizer.normalizeName('Buyer Test Co., Ltd.'));
        System.assertEquals('buyertest', AccountNormalizer.normalizeName('Buyer Test Corporation'));
        System.assertEquals('buyertest', AccountNormalizer.normalizeName('Buyer Test K.K.'));
        System.assertEquals('buyertest', AccountNormalizer.normalizeName('ＢＵＹＥＲ　ＴＥＳＴ'));      // full-width ASCII
        System.assertEquals('americana', AccountNormalizer.normalizeName('Americana Ltd'));
        System.assertEquals('americana', AccountNormalizer.normalizeName('AMERICANA LIMITED'));
    }

    @IsTest
    static void name_doesNotStripDesignatorInsideWords() {
        // "co" inside "Coca" must survive; only whole-word tokens go
        System.assertEquals('cocacola', AccountNormalizer.normalizeName('Coca-Cola Co.'));
        System.assertEquals('incorporated', AccountNormalizer.normalizeName('Incorporated'));
    }

    @IsTest
    static void name_blankOrOnlyDesignatorIsNull() {
        System.assertEquals(null, AccountNormalizer.normalizeName(null));
        System.assertEquals(null, AccountNormalizer.normalizeName('   '));
        System.assertEquals(null, AccountNormalizer.normalizeName('株式会社'));
    }

    // ------------------------------------------------------------ Phone

    @IsTest
    static void phone_japaneseFormatsCollapseToSameKey() {
        System.assertEquals('81336032251', AccountNormalizer.normalizePhone('03-3603-2251'));
        System.assertEquals('81336032251', AccountNormalizer.normalizePhone('+81-3-3603-2251'));
        System.assertEquals('81336032251', AccountNormalizer.normalizePhone('+81 (0)3-3603-2251'));
        System.assertEquals('81336032251', AccountNormalizer.normalizePhone('０３－３６０３－２２５１')); // full-width
        System.assertEquals('81336032251', AccountNormalizer.normalizePhone('(03) 3603 2251'));
        System.assertEquals('81864261473', AccountNormalizer.normalizePhone('086-426-1473'));
    }

    @IsTest
    static void phone_internationalKeepsCountryCode() {
        System.assertEquals('14156702000', AccountNormalizer.normalizePhone('+1 415 670 2000'));
        System.assertEquals('497383828', AccountNormalizer.normalizePhone('+497383828'));
        // no leading 0, no '+': kept as is
        System.assertEquals('14156702000', AccountNormalizer.normalizePhone('1 415 670 2000'));
    }

    @IsTest
    static void phone_placeholdersAreNull() {
        System.assertEquals(null, AccountNormalizer.normalizePhone(null));
        System.assertEquals(null, AccountNormalizer.normalizePhone(''));
        System.assertEquals(null, AccountNormalizer.normalizePhone('+--'));
        System.assertEquals(null, AccountNormalizer.normalizePhone('-'));
        System.assertEquals(null, AccountNormalizer.normalizePhone('0'));
        System.assertEquals(null, AccountNormalizer.normalizePhone('03-0000-0000'));
        System.assertEquals(null, AccountNormalizer.normalizePhone('000-000-0000'));
        System.assertEquals(null, AccountNormalizer.normalizePhone('1111111111'));
        System.assertEquals(null, AccountNormalizer.normalizePhone('03-1234'));          // too short
    }

    // ---------------------------------------------------------- Website

    @IsTest
    static void website_variantsCollapseToHost() {
        System.assertEquals('iij.ad.jp', AccountNormalizer.normalizeWebsite('www.iij.ad.jp'));
        System.assertEquals('iij.ad.jp', AccountNormalizer.normalizeWebsite('https://www.iij.ad.jp/'));
        System.assertEquals('iij.ad.jp', AccountNormalizer.normalizeWebsite('http://iij.ad.jp/company/index.html?x=1'));
        System.assertEquals('iij.ad.jp', AccountNormalizer.normalizeWebsite('HTTPS://WWW.IIJ.AD.JP:443/'));
        System.assertEquals('iij.ad.jp', AccountNormalizer.normalizeWebsite('ｗｗｗ．ｉｉｊ．ａｄ．ｊｐ'));  // full-width
        System.assertEquals('toyota.com', AccountNormalizer.normalizeWebsite('www.toyota.com'));
        // subdomains are kept on purpose (group companies)
        System.assertEquals('html5.mail.10086.cn', AccountNormalizer.normalizeWebsite('html5.mail.10086.cn'));
        System.assertEquals('example.co.jp', AccountNormalizer.normalizeWebsite('www2.example.co.jp'));
    }

    @IsTest
    static void website_placeholdersAreNull() {
        System.assertEquals(null, AccountNormalizer.normalizeWebsite(null));
        System.assertEquals(null, AccountNormalizer.normalizeWebsite('None'));
        System.assertEquals(null, AccountNormalizer.normalizeWebsite('none'));
        System.assertEquals(null, AccountNormalizer.normalizeWebsite('http://none'));
        System.assertEquals(null, AccountNormalizer.normalizeWebsite('なし'));
        System.assertEquals(null, AccountNormalizer.normalizeWebsite('-'));
        System.assertEquals(null, AccountNormalizer.normalizeWebsite('http://'));
        System.assertEquals(null, AccountNormalizer.normalizeWebsite('https://'));
        System.assertEquals(null, AccountNormalizer.normalizeWebsite('no website'));
        System.assertEquals(null, AccountNormalizer.normalizeWebsite('info@example.com'));
    }

    // ----------------------------------------------------------- Postal

    @IsTest
    static void postal_formatsAndSourcePriority() {
        System.assertEquals('0510023', AccountNormalizer.normalizePostal('051-0023', null, null));
        System.assertEquals('0510023', AccountNormalizer.normalizePostal('0510023', null, null));
        System.assertEquals('0510023', AccountNormalizer.normalizePostal('〒051-0023', null, null));
        System.assertEquals('0510023', AccountNormalizer.normalizePostal('０５１－００２３', null, null));  // full-width
        System.assertEquals('SW1A1AA', AccountNormalizer.normalizePostal(null, null, 'SW1A 1AA'));
        System.assertEquals('518000', AccountNormalizer.normalizePostal(null, null, '51800-0'));
        // priority: TDB, then TSR, then CB
        System.assertEquals('1000001', AccountNormalizer.normalizePostal('100-0001', '160-0023', '2000'));
        System.assertEquals('1600023', AccountNormalizer.normalizePostal('', '160-0023', '2000'));
        System.assertEquals('2000', AccountNormalizer.normalizePostal(null, ' ', '2000'));
    }

    @IsTest
    static void postal_placeholdersAreNull() {
        System.assertEquals(null, AccountNormalizer.normalizePostal(null, null, null));
        System.assertEquals(null, AccountNormalizer.normalizePostal('-', null, null));
        System.assertEquals(null, AccountNormalizer.normalizePostal('000-0000', null, null));
        System.assertEquals(null, AccountNormalizer.normalizePostal('12', null, null));
    }

    // ------------------------------------------------- Corporate Number

    @IsTest
    static void corporateNumber_checkDigitMatchesRealNumbers() {
        // 13-digit numbers seen in prod: first digit is the NTA check digit of the remaining 12
        System.assertEquals(7, AccountNormalizer.corporateNumberCheckDigit('030001026885'));
        System.assertEquals(8, AccountNormalizer.corporateNumberCheckDigit('010001061719'));
        System.assertEquals(5, AccountNormalizer.corporateNumberCheckDigit('011001019206'));
        System.assertEquals(2, AccountNormalizer.corporateNumberCheckDigit('030001034983'));
        System.assertEquals(3, AccountNormalizer.corporateNumberCheckDigit('370001024685'));
    }

    @IsTest
    static void corporateNumber_thirteenKeptTwelveCompleted() {
        System.assertEquals('7030001026885', AccountNormalizer.normalizeCorporateNumber('7030001026885'));
        System.assertEquals('7030001026885', AccountNormalizer.normalizeCorporateNumber('030001026885'));      // 12 digits
        System.assertEquals('7030001026885', AccountNormalizer.normalizeCorporateNumber('7-0300-0102-6885'));
        System.assertEquals('7030001026885', AccountNormalizer.normalizeCorporateNumber('７０３０００１０２６８８５')); // full-width
        System.assertEquals('7030001026885', AccountNormalizer.normalizeCorporateNumber(' 7030001026885 '));
    }

    @IsTest
    static void corporateNumber_invalidIsNull() {
        System.assertEquals(null, AccountNormalizer.normalizeCorporateNumber(null));
        System.assertEquals(null, AccountNormalizer.normalizeCorporateNumber('0000000000000'));
        System.assertEquals(null, AccountNormalizer.normalizeCorporateNumber('000000000000'));   // 12 zeros
        System.assertEquals(null, AccountNormalizer.normalizeCorporateNumber('12345'));
        System.assertEquals(null, AccountNormalizer.normalizeCorporateNumber('70300010268851234'));
        System.assertEquals(null, AccountNormalizer.normalizeCorporateNumber('-'));
    }

    // ------------------------------------------------------------ Utils

    @IsTest
    static void toHalfWidth_convertsAsciiRangeAndIdeographicSpace() {
        System.assertEquals('ABC abc 123 (x)', AccountNormalizer.toHalfWidth('ＡＢＣ　ａｂｃ　１２３　（ｘ）'));
        System.assertEquals('トヨタ', AccountNormalizer.toHalfWidth('トヨタ'));    // katakana untouched
        System.assertEquals(null, AccountNormalizer.toHalfWidth(null));
    }
}
