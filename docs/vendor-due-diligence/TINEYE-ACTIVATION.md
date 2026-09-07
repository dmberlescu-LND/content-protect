# TinEye production activation record

Status: **vendor permission received; blocked pending contract, privacy and launch approval**
Owner: White Eagles Digital Marketing LTD  
Last technical review: 7 September 2026

## Verified technical facts

- TinEye API searches its web index; MatchEngine searches only a customer's private collection and is not a substitute for this product.
- The commercial API accepts HTTPS JSON responses and authenticates with `x-api-key`. The application uploads a resized, EXIF/GPS-stripped JPEG under 1 MB only from the server. For a separately approved video feature, the server can derive at most three resized, metadata-stripped JPEG frames from a video no longer than ten minutes; it never sends the full video or audio.
- TinEye says uploaded images are not added to its index and are deleted within 24 hours. Its security statement says client data is processed and stored in three TinEye-controlled data centres in Toronto, Canada.
- The current API terms prohibit illegal use and infringement of privacy, personality and intellectual-property rights.
- TinEye publishes a DPA. Its opening clause says it forms part of the Services License Agreement, while the API is governed by a separately named API Customer Agreement.
- A generated-image sandbox request completed successfully on 19 July 2026. The sandbox returns fixed demonstration matches and does not prove live index quality.

## Written vendor response — 7 September 2026

**Restricted evidence reference:** `TINEYE-EMAIL-2026-09-07-3442129711-164694`
**Sender:** TinEye API team (`hi@tineye.com`)
**Scope:** written response to White Eagles Digital Marketing LTD's pre-purchase use-case questions.

TinEye confirmed in writing that:

1. There are no content-category restrictions for legal searches under its API Customer Agreement.
2. Still images extracted from videos may be searched if the source material was legally obtained and the customer has the appropriate rights or authorisation. TinEye is image-search optimised and does not analyse a submitted video frame-by-frame; extracted frames may match where the same or a substantially similar still exists in its index.
3. Its published DPA applies to TinEye API customers.
4. Idée Inc. (TinEye) is a commercial organisation subject to PIPEDA.
5. Query images, including images retrieved from submitted URLs, are held on TinEye's internal servers for a maximum of 24 hours for repeat-search efficiency, then deleted. TinEye stated that it uses no third-party processors for image processing.

This closes the **vendor-permission evidence** portion of both the still-image and derived-video-frame gates. It does **not** approve production activation: the company must still execute/review the contract and DPA, complete the UK privacy/transfer decision and DPIA, approve pricing/query limits, configure safe credentials, and perform a consented live acceptance test.

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

1. Review and accept the API Customer Agreement and DPA in the company contract file; record the versions and effective date.
2. Privacy counsel must record whether UK partial adequacy can be relied on for this processing; otherwise execute an appropriate UK safeguard and transfer assessment.
3. Record the provider's retention, deletion, incident-notification, subprocessor/onward-transfer and support commitments in the processor register. Reconcile the written maximum 24-hour upload retention with the contract terms.
4. Approve the Article 6 basis, Article 9 condition, DPIA, privacy wording and explicit upload consent for adult/intimate reference media. Before video-frame activation, publish counsel-approved Privacy Notice and Service Terms wording describing local frame extraction, the maximum of three provider queries per video and the absence of full-video/audio transfer.
5. Revalidate the approved launch limits (Monitor 10 files/30 days, Protect 25 files/day, Pro 50 files/day) against the current per-search price before every pricing or provider change. Each still image consumes one paid search and each approved video can consume up to three paid searches. Automatic retry must not silently exceed this allowance.
6. Purchase the smallest approved commercial bundle with automatic top-up disabled initially. Record the invoice, contract version, API account owner and renewal/expiry date in the restricted vendor file.
7. Store only opaque evidence references in Render. Never paste the legal correspondence itself into an environment variable.

## Required vendor questions

Send these questions from the company account before purchase:

> Content Protect is a UK service for verified adult creators. Users submit only content they own or are authorised to protect, and explicitly consent to private reverse-image matching. Reference images may contain lawful nudity or sexually explicit depictions of adults; minors and illegal content are prohibited. For an optional video feature, our server would derive and submit no more than three metadata-stripped JPEG still frames from each creator-submitted video of no more than ten minutes; no audio or full video would be submitted. Please confirm in writing that both the image and derived-frame uses are permitted for the commercial TinEye API. Please also confirm that your published DPA applies to TinEye API customers, that our search-image processing is subject to PIPEDA in Canada, the maximum search-image retention, and any subprocessors or onward transfers that can access search images or metadata.

## Fail-closed activation

Production still-image scanning becomes available only when all three Render secrets exist:

- `TINEYE_API_KEY`
- `TINEYE_DATA_PROTECTION_APPROVAL_REFERENCE`
- `TINEYE_ADULT_CONTENT_APPROVAL_REFERENCE`

The latter two values must be 12–160 character opaque references to approved, retained evidence, using only letters, numbers, `.`, `_`, `:`, `/` or `-`. Boolean placeholders, URLs and email addresses are rejected. Missing or invalid references keep the application in `compliance-blocked` and no image is transmitted.

Video-frame scanning has an additional independent gate:

- `TINEYE_VIDEO_FRAME_APPROVAL_REFERENCE`

This value must reference retained evidence that the provider authorization covers derived frames, the current DPIA and public legal wording have been approved, and the per-video query cost has been accepted. Without it, health reports `videoScanning: privacy-blocked`; stored videos remain encrypted and are not decoded or transmitted even when still-image scanning is live.
