/**
 * Pure normalization functions for the hidden Account *_Normalized__c fields
 * used by the custom duplicate matching rules. No DML, no SOQL.
 *
 * Rules (see dup_rules.docx section 2):
 *  - empty or placeholder source -> null (never '')
 *  - full-width ASCII -> half-width before anything else
 */
public with sharing class AccountNormalizer {

    // Japanese corporate designators removed from names (after half-width conversion).
    private static final List<String> JP_TOKENS = new List<String>{
        '株式会社', '有限会社', '合同会社', '合資会社', '合名会社',
        '(株)', '(有)', '㈱', '㈲'
    };

    // English corporate designators removed as whole words (after punctuation -> space).
    private static final Pattern EN_TOKENS = Pattern.compile(
        '\\b(inc|corp|corporation|co|ltd|limited|kk|k k|llc|gmbh|plc)\\b'
    );

    private static final Set<String> WEBSITE_PLACEHOLDERS = new Set<String>{
        'none', 'nothing', 'na', 'n/a', 'null', 'なし', '無し', '-', '−', 'ー', '－'
    };

    // ---------------------------------------------------------------- Name

    public static String normalizeName(String raw) {
        if (String.isBlank(raw)) return null;
        String s = toHalfWidth(raw).toLowerCase();
        for (String t : JP_TOKENS) {
            s = s.replace(t, ' ');
        }
        s = s.replaceAll('[^\\p{L}\\p{N}]+', ' ');       // punctuation -> space
        s = EN_TOKENS.matcher(s).replaceAll(' ');        // drop inc/corp/co/ltd...
        s = s.replaceAll('\\s+', '');                    // remove all spaces
        if (String.isBlank(s)) return null;
        return s.length() > 255 ? s.substring(0, 255) : s;
    }

    // --------------------------------------------------------------- Phone

    public static String normalizePhone(String raw) {
        if (String.isBlank(raw)) return null;
        String s = toHalfWidth(raw).trim();
        Boolean international = s.startsWith('+');
        String digits = s.replaceAll('\\D', '');
        if (String.isBlank(digits)) return null;

        if (international) {
            // "+81 (0)3-..." -> drop the trunk zero after the country code
            if (digits.startsWith('810')) digits = '81' + digits.substring(3);
        } else if (digits.startsWith('0')) {
            // domestic Japanese number -> E.164 without '+'
            digits = '81' + digits.substring(1);
        }

        if (digits.length() < 8 || digits.length() > 20) return null;
        if (Pattern.matches('^(\\d)\\1*$', digits)) return null;      // all same digit
        if (digits.contains('0000000')) return null;                    // 03-0000-0000 style
        return digits;
    }

    // ------------------------------------------------------------- Website

    public static String normalizeWebsite(String raw) {
        if (String.isBlank(raw)) return null;
        String s = toHalfWidth(raw).trim().toLowerCase();
        if (WEBSITE_PLACEHOLDERS.contains(s)) return null;
        s = s.replaceFirst('^[a-z][a-z0-9+.\\-]*://', '');   // protocol
        s = s.replaceFirst('^www\\d*\\.', '');               // www. / www2.
        s = s.split('[/?#:]', 2)[0].trim();                  // host only
        while (s.endsWith('.')) s = s.substring(0, s.length() - 1);
        if (String.isBlank(s) || !s.contains('.') || s.contains('@') || s.contains(' ')) return null;
        if (WEBSITE_PLACEHOLDERS.contains(s)) return null;
        return s.length() > 255 ? s.substring(0, 255) : s;
    }

    // -------------------------------------------------------------- Postal

    /** Source priority: TDBPostalCode__c, then TSRPostalCode__c, then CB_Postalcode__c. */
    public static String normalizePostal(String tdb, String tsr, String cb) {
        String raw = String.isNotBlank(tdb) ? tdb : (String.isNotBlank(tsr) ? tsr : cb);
        if (String.isBlank(raw)) return null;
        String s = toHalfWidth(raw).toUpperCase().replaceAll('[^A-Z0-9]', '');
        if (s.length() < 3 || s.length() > 20) return null;
        if (Pattern.matches('^0+$', s)) return null;
        return s;
    }

    // ---------------------------------------------------- Corporate Number

    public static String normalizeCorporateNumber(String raw) {
        if (String.isBlank(raw)) return null;
        String digits = toHalfWidth(raw).replaceAll('\\D', '');
        if (String.isBlank(digits) || Pattern.matches('^0+$', digits)) return null;
        if (digits.length() == 12) {
            digits = String.valueOf(corporateNumberCheckDigit(digits)) + digits;
        }
        if (digits.length() != 13) return null;
        if (Pattern.matches('^0+$', digits)) return null;
        return digits;
    }

    /**
     * NTA (国税庁) check digit for a 12-digit 会社法人等番号.
     * P(n) = n-th digit counted from the RIGHT (n = 1..12).
     * check = 9 - ( ( sum(P(odd n)) * 1 + sum(P(even n)) * 2 ) mod 9 )
     */
    public static Integer corporateNumberCheckDigit(String body12) {
        Integer sum = 0;
        for (Integer n = 1; n <= 12; n++) {
            Integer digit = Integer.valueOf(body12.substring(12 - n, 13 - n));
            sum += digit * (Math.mod(n, 2) == 0 ? 2 : 1);
        }
        return 9 - Math.mod(sum, 9);
    }

    // -------------------------------------------------------------- Utils

    /** Full-width ASCII (U+FF01..U+FF5E) -> half-width; ideographic space (U+3000) -> space. */
    public static String toHalfWidth(String s) {
        if (s == null) return null;
        List<Integer> chars = s.getChars();
        Boolean changed = false;
        for (Integer i = 0; i < chars.size(); i++) {
            Integer c = chars[i];
            if (c >= 65281 && c <= 65374) {          // FF01..FF5E
                chars[i] = c - 65248;                // - FEE0
                changed = true;
            } else if (c == 12288) {                 // U+3000
                chars[i] = 32;
                changed = true;
            }
        }
        return changed ? String.fromCharArray(chars) : s;
    }
}
