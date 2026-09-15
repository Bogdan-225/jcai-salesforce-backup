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
    static void name_stripsAsianAndEuropeanDesignators() {
        // seen in the partial sandbox: Pvt/Pty/Sdn Bhd/Pte are on ~93K prod accounts
        System.assertEquals('vighnahartatechnologies', AccountNormalizer.normalizeName('Vighnaharta Technologies Pvt Ltd'));
        System.assertEquals('elixirengineering', AccountNormalizer.normalizeName('ELIXIR ENGINEERING PVT.LTD'));
        System.assertEquals('ninetwofiveinteriors', AccountNormalizer.normalizeName('Ninetwofive Interiors Pty Ltd.'));
        System.assertEquals('maybank', AccountNormalizer.normalizeName('Maybank Sdn. Bhd.'));
        System.assertEquals('dbs', AccountNormalizer.normalizeName('DBS Pte. Ltd.'));
        System.assertEquals('siemens', AccountNormalizer.normalizeName('Siemens AG'));
        System.assertEquals('philips', AccountNormalizer.normalizeName('Philips N.V.'));
        System.assertEquals('volvo', AccountNormalizer.normalizeName('AB Volvo'));
        // "Sabre" keeps "sa" inside the word
        System.assertEquals('sabre', AccountNormalizer.normalizeName('Sabre Inc.'));
    }

    @IsTest
    static void name_stripsMultiWordDesignatorsAndLeadingThe() {
        // from the full prod export: 61K "Company", 33K "Private Limited", 8K "Joint Stock Company", 6K "Ooo"
        System.assertEquals('sunchemical', AccountNormalizer.normalizeName('THE SUN CHEMICAL CO., LTD.'));
        System.assertEquals('sunchemical', AccountNormalizer.normalizeName('Sun Chemical Co. Ltd'));
        System.assertEquals('brandstudiolifestyle', AccountNormalizer.normalizeName('BRAND STUDIO LIFESTYLE PRIVATE LIMITED'));
        System.assertEquals('tvl', AccountNormalizer.normalizeName('TVL Joint Stock Company'));
        System.assertEquals('valueholdings', AccountNormalizer.normalizeName('Value Holdings, Limited Liability Company'));
        System.assertEquals('spektrum', AccountNormalizer.normalizeName('Spektrum, Ooo'));
        System.assertEquals('straitswine', AccountNormalizer.normalizeName('Straits Wine Company'));
        System.assertEquals('bangkokgen', AccountNormalizer.normalizeName('BANGKOKGEN COMPANY LIMITED'));
        System.assertEquals('kaczmarekelectric', AccountNormalizer.normalizeName('Kaczmarek Electric S A'));
        System.assertEquals('spepenergynetherlands', AccountNormalizer.normalizeName('Spep Energy Netherlands B V'));
        System.assertEquals('grupofinancierocitibanamex', AccountNormalizer.normalizeName('Grupo Financiero Citibanamex, S. A. de C. V.'));
        System.assertEquals('brf', AccountNormalizer.normalizeName('BRF S.A.'));
        System.assertEquals('brembo', AccountNormalizer.normalizeName('Brembo S.p.A.'));
        // "the" only at the start; "company" only as a whole word
        System.assertEquals('thermofisher', AccountNormalizer.normalizeName('Thermo Fisher Inc.'));
        System.assertEquals('companionpet', AccountNormalizer.normalizeName('Companion Pet Ltd'));
    }

    @IsTest
    static void name_doesNotStripDesignatorInsideWords() {
        // "co" inside "Coca" must survive; only whole-word tokens go
        System.assertEquals('cocacola', AccountNormalizer.normalizeName('Coca-Cola Co.'));
        System.assertEquals('limitless', AccountNormalizer.normalizeName('Limitless Ltd'));
        System.assertEquals(null, AccountNormalizer.normalizeName('Incorporated'));   // a lone designator is no key
    }

    @IsTest
    static void name_keepsDesignatorWhenStrippedKeyIsTooShort() {
        // real 1-2 letter names: stripping the designator would leave a key that collides with every other "LA"/"TC"
        System.assertEquals('lacorporation', AccountNormalizer.normalizeName('L&A CORPORATION'));
        System.assertEquals('tclimited', AccountNormalizer.normalizeName('TC Limited'));
        System.assertEquals('kxinc', AccountNormalizer.normalizeName('KX Inc.'));
        System.assertEquals('株式会社ab', AccountNormalizer.normalizeName('株式会社AB'));
        // nothing to strip: the short key stays as it is
        System.assertEquals('om', AccountNormalizer.normalizeName('O&M'));
        System.assertEquals('5b', AccountNormalizer.normalizeName('5B'));
        // 3+ chars after stripping: designator goes as usual
        System.assertEquals('tks', AccountNormalizer.normalizeName('TKS株式会社'));
        System.assertEquals('abc', AccountNormalizer.normalizeName('ABC Ltd.'));
    }

    @IsTest
    static void name_twoKanjiJapaneseNamesKeepStrippingDesignators() {
        // 2-character Japanese names are real names (4,109 such groups in prod); the minimum applies to Latin keys only
        System.assertEquals('東武', AccountNormalizer.normalizeName('株式会社東武'));
        System.assertEquals('東武', AccountNormalizer.normalizeName('(株)東武'));
        System.assertEquals('東武', AccountNormalizer.normalizeName('東武(株)'));
        System.assertEquals('共立', AccountNormalizer.normalizeName('有限会社共立'));
        System.assertEquals('サン', AccountNormalizer.normalizeName('株式会社サン'));
        System.assertEquals('大', AccountNormalizer.normalizeName('株式会社大'));
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

    @IsTest
    static void postal_japaneseSourceMustBeSevenDigitsElseFallsThrough() {
        // seen in the partial sandbox: a street address typed into TDBPostalCode__c
        System.assertEquals(null, AccountNormalizer.normalizePostal('東京都北区東十条6−4−2', null, null));
        System.assertEquals('1600023', AccountNormalizer.normalizePostal('東京都北区東十条6−4−2', '160-0023', null));
        System.assertEquals(null, AccountNormalizer.normalizePostal('160-002', null, null));      // 6 digits
        System.assertEquals(null, AccountNormalizer.normalizePostal('1600-0023', null, null));    // 8 digits
        // international source rejects Japanese address text but accepts short codes
        System.assertEquals(null, AccountNormalizer.normalizePostal(null, null, '大阪市北区'));
        System.assertEquals('2609', AccountNormalizer.normalizePostal(null, null, '2609'));
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
