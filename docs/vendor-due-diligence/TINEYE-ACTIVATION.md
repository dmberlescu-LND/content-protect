# TinEye production activation record

Status: **blocked pending vendor and privacy approval**  
Owner: White Eagles Digital Marketing LTD  
Last technical review: 19 July 2026

## Verified technical facts

- TinEye API searches its web index; MatchEngine searches only a customer's private collection and is not a substitute for this product.
- The commercial API accepts HTTPS JSON responses and authenticates with `x-api-key`. The application uploads a resized, EXIF/GPS-stripped JPEG under 1 MB only from the server.
- TinEye says uploaded images are not added to its index and are deleted within 24 hours. Its security statement says client data is processed and stored in three TinEye-controlled data centres in Toronto, Canada.
- The current API terms prohibit illegal use and infringement of privacy, personality and intellectual-property rights. They do not expressly prohibit lawful adult material, but they also do not expressly approve this use case.
- TinEye publishes a DPA, but its opening clause says it forms part of the Services License Agreement. The TinEye API is governed by a separately named API Customer Agreement. Coverage of the API must therefore be confirmed rather than assumed.
- A generated-image sandbox request completed successfully on 19 July 2026. The sandbox returns fixed demonstration matches and does not prove live index quality.

Official sources reviewed:

- <https://services.tineye.com/TinEyeAPI>
- <https://help.tineye.com/article/278-transitioning-authentication-methods>
- <https://help.tineye.com/article/276-image-requirements>
- <https://help.tineye.com/article/289-tineye-api-results-querymatchpercent>
- <https://help.tineye.com/article/293-tineye-api-error-messages>
- <https://tineye.com/api_terms>
- <https://tineye.com/privacy>
- <https://tineye.com/security>
- <https://tineye.com/dpa>
- <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/adequacy-regulations/is-the-restricted-transfer-covered-by-adequacy-regulations/>

## Evidence required before purchase or production use

1. Obtain written TinEye confirmation that the commercial TinEye API may process lawful, consensually submitted images of verified adults that can include nudity or sexually explicit content for copyright and abuse-protection matching.
2. Obtain written confirmation that the published DPA applies to the TinEye API account, or execute an API-specific DPA.
3. Obtain written confirmation that TinEye's processing of this customer data is subject to PIPEDA. Privacy counsel must record whether UK partial adequacy can be relied on; otherwise execute an appropriate UK safeguard and assessment.
4. Record retention, deletion, incident-notification, subprocessor/onward-transfer and support commitments. Reconcile the privacy statement's maximum 24-hour upload retention with any account-specific terms.
5. Approve the Article 6 basis, Article 9 condition, DPIA, privacy wording and explicit upload consent for adult/intimate reference media.
6. Approve plan asset limits and scan frequency against the current per-search cost. Each asset searched consumes one paid search; a scan over multiple assets consumes multiple searches.
7. Purchase the smallest approved commercial bundle with automatic top-up disabled initially. Record the invoice, contract version, API account owner and renewal/expiry date in the restricted vendor file.
8. Store only opaque evidence references in Render. Never paste the legal correspondence itself into an environment variable.

## Required vendor questions

Send these questions from the company account before purchase:

> Content Protect is a UK service for verified adult creators. Users submit only content they own or are authorised to protect, and explicitly consent to private reverse-image matching. Reference images may contain lawful nudity or sexually explicit depictions of adults; minors and illegal content are prohibited. Please confirm in writing that this use is permitted for the commercial TinEye API. Please also confirm that your published DPA applies to TinEye API customers, that our search-image processing is subject to PIPEDA in Canada, the maximum search-image retention, and any subprocessors or onward transfers that can access search images or metadata.

## Fail-closed activation

Production scanning becomes available only when all three Render secrets exist:

- `TINEYE_API_KEY`
- `TINEYE_DATA_PROTECTION_APPROVAL_REFERENCE`
- `TINEYE_ADULT_CONTENT_APPROVAL_REFERENCE`

The latter two values must be opaque references to approved, retained evidence. Missing either reference keeps the application in `compliance-blocked` and no image is transmitted.
