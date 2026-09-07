# TinEye commercial activation checklist

Status: director and counsel action required — 7 September 2026

This is an execution checklist, not legal advice and not authority to enable production scanning. The live scanner stays blocked until every applicable item is genuinely approved.

## What is already evidenced

- TinEye gave White Eagles Digital Marketing LTD written permission for legal searches, including lawfully obtained still frames extracted from video, subject to the customer's rights/authorisation. Evidence reference: `TINEYE-EMAIL-2026-09-07-3442129711-164694`.
- TinEye stated that its DPA applies to API customers, it is subject to PIPEDA, it retains uploaded/retrieved query images for no more than 24 hours and it has no third-party image-processing processors.
- ICO guidance states that UK adequacy regulations for Canada apply only where PIPEDA applies to the transferred information. TinEye's written confirmation supports that precondition, but the company still needs to document the decision for its own processing.

## Director: commercial account and spend controls

1. Open the commercial TinEye API account under White Eagles Digital Marketing LTD, using `white.eagles.dm@gmail.com` as the business contact.
2. Select the smallest paid package that supports a controlled pilot. Do not enable automatic top-ups, stored-card renewal changes or high-volume commitments at this stage.
3. Before accepting, save the current API Customer Agreement, DPA and price/usage page to the restricted vendor file. Record date, account owner, package, currency, query allowance, renewal date and cancellation process.
4. Do not paste the API key into chat, email, GitHub or the repository. Copy it only into Render's encrypted environment-variable screen once all privacy approvals below are complete.

## Privacy/counsel: decision record

Counsel or the designated privacy owner should record the answer to each item below in the restricted company record:

| Question | Required result before still-image activation |
| --- | --- |
| Controller/processor roles | White Eagles/Content Protect is controller; TinEye processes only documented API-search instructions. |
| Contract | API Customer Agreement and DPA version/date accepted and retained. |
| Canada transfer | Record why the UK Canada adequacy route applies to this exact PIPEDA-covered commercial processing, or document another safeguard if counsel does not agree. |
| Data minimisation | Only resized, metadata-stripped JPEG copies; never encrypted originals, full videos, audio, identity documents or facial templates. |
| Retention | Provider's 24-hour maximum reconciled with the contract and communicated in the Privacy Notice. |
| Creator notice/consent | Current Privacy Notice, Terms and per-file declaration accurately cover the search and creator authority. |
| Safety | Minors, illegal content and unverified/unauthorised uploads remain prohibited; incident and deletion routes are named. |

For video frames, make a separate approval: maximum three frames, no full video/audio, cost cap, updated public wording and documented residual-risk acceptance. Do not use the still-image approval as a substitute.

## Engineering: safe configuration after written approval

Only after the director and privacy owner supply their opaque evidence references:

1. Store `TINEYE_API_KEY` as a Render secret.
2. Store an opaque reference such as `TINEYE-DPA-2026-09-07-APPROVED` in `TINEYE_DATA_PROTECTION_APPROVAL_REFERENCE`; it must identify the approved internal record, not contain its text, a URL or personal data.
3. Store the TinEye written-permission evidence reference in `TINEYE_ADULT_CONTENT_APPROVAL_REFERENCE`.
4. Keep `TINEYE_VIDEO_FRAME_APPROVAL_REFERENCE` empty until the separate video decision is complete.
5. Redeploy, then confirm `/api/health/ready` reports commercial image scanning ready while video scanning remains privacy-blocked.

## Controlled live acceptance test

Use one non-explicit, creator-consented test image owned by the creator or company. Verify:

- exactly one provider request is made;
- EXIF/GPS metadata was stripped and no original object, account data or identity data left the service;
- the provider result is recorded as a lead, not proof of infringement;
- the result can be marked confirmed, authorised, false-positive or uncertain in the private operator queue;
- deleting the test account follows the approved retention/deletion workflow;
- costs and query allowance reconcile with TinEye's account dashboard.

Document the result by opaque acceptance-test reference. Only then invite a small, consented pilot group. No real external notice is authorised by this test.

## References

- TinEye API Customer Agreement: <https://tineye.com/api_terms>
- TinEye DPA: <https://tineye.com/dpa>
- ICO Canada adequacy guidance: <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/adequacy-regulations/is-the-restricted-transfer-covered-by-adequacy-regulations/>
