# Content Protect — external approval pack

Status: prepared for controlled pre-launch. This is an operational checklist, not legal advice. Do not put passwords, API keys, ID documents, bank details, intimate media, customer information or full provider contracts in this repository.

## How to use this pack

1. Complete the workstream in the stated order where possible.
2. Save the original evidence in a restricted company folder outside this repository.
3. Record only an opaque reference, decision date, reviewer and expiry in the signed launch-governance manifest.
4. Ask engineering to run the stated acceptance test. A provider must remain disabled if the test fails or the evidence expires.

## 1. Company and UK data-protection baseline

**Owner:** director, accountant and UK privacy counsel.

**Accountant request**

- Confirm whether Companies House accounts and confirmation statement are current for company number 14978662.
- File every outstanding document, retain the filing receipt and confirm that no overdue marker remains on the public register.
- Confirm the current registered office and SIC codes are suitable for a software/content-protection service; obtain tax/accounting advice before changing them.

**Privacy/counsel package**

- Review the DPIA, ROPA, Privacy Notice, Terms, cookie notice and takedown/dispute procedure in `docs/compliance/`.
- Decide and document the UK GDPR Article 6 lawful basis, any Article 9 condition, transparency wording, retention periods and creator-safety escalation route.
- Decide whether ICO registration is required; retain the ICO reference or written exemption analysis.
- Approve processor DPAs, international-transfer safeguards and subprocessors for every provider in the processor register.

**Evidence to retain:** Companies House receipts, ICO reference/exemption memo, signed/privacy-counsel approval memo, current DPA/transfer references and a dated residual-risk decision.

**Engineering acceptance after approval:** create the signed launch-governance manifest only after all required control references are supplied. Never use the manifest to represent unreviewed evidence as approved.

## 2. Yoti live age assurance

**Owner:** director and Yoti account owner.

**Ask Yoti for**

- Approval of the live organisation and the specific adult creator/rightsholder use case.
- Live SDK/application credentials and the correct production callback/redirect configuration.
- Confirmation of the contracted data-processing terms, hosting/transfer details, retention and subprocessor information.

**Keep enabled until approval:** only the allowlisted sandbox journey. It is intentionally not evidence of a real identity verification.

**Engineering acceptance after approval:** configure live credentials as secrets, run one consented end-to-end verification, retain only the non-personal receipt/session reference and confirm that no raw document, date of birth or face data is stored. A sandbox result must still fail in live mode.

## 3. Stripe commercial launch

**Owner:** director and Stripe account owner.

**Complete in test mode first**

- Run Checkout, successful renewal, failed payment, customer portal, cancellation, account deletion and a verified refund using Stripe test objects.
- Confirm the webhook destination receives the configured signed events and rejection handling works.
- Confirm GBP price IDs, tax approach, refund/cooling-off wording and customer support/complaint process with counsel/accountant.

**Before live mode:** Stripe must approve the account; retain the approval/date, approved production price IDs and real webhook endpoint verification. Move only the approved live secrets and price IDs into Render. Do not send live payments until counsel signs off consumer terms and cancellation/refund wording.

**Engineering acceptance after approval:** run a constrained live checkout with an authorised test customer, then cancellation/refund reconciliation. Confirm no duplicate subscription or unverified consent can grant access.

## 4. TinEye image and video-frame matching

**Owner:** director, TinEye and privacy/copyright counsel.

**Send TinEye a written use-case summary**

- The service is for verified adult rights holders who submit content they own/control to identify suspected unauthorised public copies.
- Still images are resized and metadata-stripped before submission; the encrypted original is never sent.
- Video scanning, if approved separately, submits at most three resized JPEG keyframes per video, never audio, subtitles, metadata or the full video.
- Content Protect requires written confirmation that lawful explicit-adult creator media and the described video-keyframe processing are permitted under the API agreement/DPA.

**Evidence to retain:** API agreement/DPA, transfer review, still-image approval reference, video-frame approval reference if granted, cost approval and dates/reviewer.

**Engineering acceptance after approval:** configure the API key as a secret and add opaque approval references. Test one consented image first. Keep video scanning disabled unless its distinct approval reference exists.

## 5. Takedown, disputes and creator safety

**Owner:** specialist UK copyright/online-safety counsel and operations lead.

**Counsel should review**

- The exact notice template and jurisdiction routes.
- Claimant identity/capacity wording, authority declaration and evidence standard.
- Counter-notice/dispute handling, escalation, preservation and closure process.
- Handling of intimate content, threats, doxxing, coercion and vulnerable adult escalation.

**Engineering acceptance after approval:** upload the counsel-approved template/version reference, run a controlled notice preparation and dispute simulation, and retain only non-sensitive audit references.

## 6. Independent penetration test and operations

**Owner:** director and independent security provider.

**Minimum scope**

- Authenticated and unauthenticated web/API testing, account recovery, TOTP, CSRF/origin controls, rate limits and object access.
- Tenant isolation, media upload validation, signed URLs, evidence capture, takedown/dispute flows, Stripe/Yoti webhook verification and operator actions.
- Confirm that private media, secrets, audit exports and backup material cannot be accessed by ordinary accounts or public routes.

**Evidence to retain:** scope, tester independence, dated report, severity/risk rating, remediation proof and residual-risk approval.

**Engineering acceptance after approval:** remediate verified findings, rerun the affected tests and record the report reference in launch governance. No production launch with unresolved critical/high finding unless counsel/director issue an explicit documented risk acceptance.

## 7. Retention and independent audit custody

**Owner:** privacy counsel, operations and a separately administered storage/audit provider.

**Before enabling destructive retention**

- Approve the retention schedule, legal-hold process and deletion notification policy.
- Review a real production preview and approve the exact executing configuration.
- Run a controlled execution with fresh evidence; do not enable the flag merely because a preview succeeded.

**Before enabling independent audit export**

- Select a separate S3-compatible destination administered separately from the application.
- Approve DPA/transfer/subprocessor terms, encryption/key custody and 400-day lifecycle.
- Configure isolated write/read credentials unavailable to the web service and verify encrypted export plus independent read-back.

## Final sign-off

Only after every applicable workstream is approved and acceptance-tested should the director create the offline Ed25519-signed launch-governance manifest. The public readiness endpoint must then report every operational gate as `true` and `productionReady: true` before any commercial launch claim or customer invitation.
