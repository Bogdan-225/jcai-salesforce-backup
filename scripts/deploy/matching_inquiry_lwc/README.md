# Matching "Inquiry Message" tab via without-sharing LWC (2026-10-15)

Goal: IS_Buy users must read the Project's (Opportunity) Inquiry fields from a Matching record even when the
Project is sealed by the T-002 criteria sharing rule. The Matching pages previously showed the Inquiry tab as
Dynamic Forms cross-object fields (Record.Sell__r.Inquiry_*), which go blank without record access.

Parts (source of truth in force-app/):
- classes/MatchingInquiryController.cls (+Test): with-sharing read of the Matching, then without-sharing read of
  the 23 Inquiry_* fields of Sell__c; FLS enforced with stripInaccessible; labels from Schema describe.
- lwc/matchingInquiryMessage: read-only two-section view (JP / EN), section titles are design properties.
- transform_pages.js: rewrites a Matching FlexiPage: replaces the Inquiry tab body with the component, drops the
  orphaned field facets, keeps the page's own section titles, strips the cosmetic tabset "label" property
  (rejected on deploy with "Invalid null property [label] in component [flexipage:tabset]").

Sandbox (partial): sandbox/ = package built from sandbox-retrieved pages. Deployed 0AfBK00000Cu3Qw0AJ,
tests 3/3 pass, MatchingInquiryController coverage 51/54. Test data for the visual check: Opportunity
006RA00001MdDMsYAN "Pj Rapid" moved ISマッチング中 -> Pre Top MTG (sealed for IS); Matching a00RA00001gGXDwYAO.

Prod: build prod/ from freshly retrieved prod pages (never reuse sandbox/ pages: prod revision differs):
  sf project retrieve start -o prod -m FlexiPage:Matching_Advisor -m FlexiPage:Matching_Advisor_M_CB -m FlexiPage:Matching_IS_Buy -r <tmp>
  node scripts/deploy/matching_inquiry_lwc/transform_pages.js <tmp>/flexipages/X.flexipage-meta.xml prod/flexipages/X.flexipage-meta.xml  (x3)
  sf project deploy start -o prod --metadata-dir scripts/deploy/matching_inquiry_lwc/prod --test-level RunSpecifiedTests --tests MatchingInquiryControllerTest --wait 15
Then re-enable T-002: deploy scripts/deploy/is_opp_stage_sharing/pkg (13-stage criteria rule) and run access_test.sh prod prod.
