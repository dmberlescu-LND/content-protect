# Content Protect UK launch checklist

Status: implementation checklist, not legal advice. Company identity is verified; overdue statutory filings, counsel approval and provider approvals remain release gates.

## Company and tax

- Companies House was checked on 19 July 2026 and confirms **WHITE EAGLES DIGITAL MARKETING LTD**, company **14978662**, as an active private limited company incorporated on 4 July 2023. The registered office is **The Spaceworks, Flat 7, Plumbers Row, London, England, E1 1AG**. Evidence: [official Companies House record](https://find-and-update.company-information.service.gov.uk/company/14978662).
- **Commercial launch blocker:** Companies House reports the accounts made up to 31 July 2025 as overdue; they were due by 30 April 2026. File them and confirm the register no longer shows the warning before launch.
- **Commercial launch blocker:** Companies House reports the confirmation statement dated 3 July 2026 as overdue; it was due by 17 July 2026. File it and confirm the register no longer shows the warning before launch.
- Confirm the UK business bank account and responsible directors operationally; do not store bank details in this repository.
- Confirm corporation tax, VAT threshold and cross-border digital-service treatment with an accountant.
- Use “Content Protect is a trading name of White Eagles Digital Marketing LTD” in the next counsel-approved version of each customer-facing legal page.

## Privacy and security

- Complete a data inventory and Record of Processing Activities.
- Determine the Article 6 lawful basis for each processing purpose.
- Determine the Article 9 condition before processing biometric templates or information revealing sex life/sexual orientation.
- Complete and approve a Data Protection Impact Assessment before facial matching or large-scale monitoring.
- Register/pay the ICO data protection fee if applicable.
- Appoint owners for access requests, deletion, correction, restriction and portability.
- Define retention periods for source media, embeddings, evidence, notices and audit logs.
- A non-destructive production retention preview completed successfully on 19 July 2026 against revision `95edfbd`: it found no customer/content deletion candidates and only 12 expired rate-limit entries. The Render command remains preview-only, and execution is still disabled pending policy, legal and operational approval.
- Execute data-processing agreements and international-transfer safeguards with every provider.
- Before TinEye activation, complete `docs/vendor-due-diligence/TINEYE-ACTIVATION.md`; record the approved privacy/transfer review and the provider's written lawful-adult-content confirmation in the two fail-closed Render variables. An API key alone must never activate scanning.
- Before video-frame scanning, obtain written confirmation covering derived video frames, approve the DPIA and the maximum three paid queries per video, publish counsel-approved Privacy Notice and Service Terms versions describing the flow, and only then set `TINEYE_VIDEO_FRAME_APPROVAL_REFERENCE`. Stored videos must remain unsearched while this value is absent.
- Commission penetration testing and create a 72-hour personal-data-breach response procedure.
- The encrypted, signed, non-overwriting audit-export job is implemented and fail-closed. Before launch, select a separately administered S3-compatible destination, approve its DPA/transfer and custody record, configure a 400-day lifecycle and isolated read/write-without-delete credentials, run `pnpm audit:export`, and confirm fresh verified evidence opens the `auditExport` readiness gate.
- Confirm the named on-call recipient actually received the deliberately failed GitHub production-monitor notification from run #27; the successful recovery run alone does not prove alert delivery.

## Creator safety

- Restrict the service to verified adults aged 18+.
- Use a specialist age/identity provider; do not retain raw identity documents unless strictly necessary.
- Separate identity verification data from creator content.
- Require explicit creator approval before the first real takedown.
- Provide emergency paths for intimate-image abuse, doxxing, stalking and credible threats.
- Prohibit searches for people who have not authorised the account.

## Copyright and takedowns

- Obtain specialist counsel approval for notice template `2026-07-19-v3` and record the same version in `TAKEDOWN_LEGAL_APPROVED_VERSION`; do not enable live delivery before this evidence exists. The review must cover disclosure of the claimant's legal name, optional professional name, rights holder and claimant capacity.

- Verify ownership/authority before acting.
- Require a versioned declaration for every reference file and an operator-reviewed restricted evidence reference before notice preparation; never treat the registration checkbox alone as proof.
- Preserve URL, timestamp, content-match evidence and a creator-supplied JPEG/PNG/WebP page capture. The capture must be encrypted, SHA-256 bound to the exact case evidence and immutable after case creation; the operator must still review the live URL because the capture is not an independent notarisation.
- Route notices by the recipient's jurisdiction: UK copyright complaint, US DMCA, platform-specific report, host/CDN/registrar escalation.
- The counter-notice/dispute intake and operator-review workflow is implemented: non-enumerating public intake, exact delivered-case/URL binding, application encryption, rate limits, immediate follow-up freeze, metadata-only queues, TOTP-gated access/outcome, creator-safe views and counsel-gated continuation. Before live delivery, counsel must approve the workflow and operational owners must complete acceptance tests.
- Never describe delisting as deletion from the source website.
- Maintain an auditable record of every notice and response.

## Payments and consumer terms

- Connect a UK-supported payment processor only after the company account is approved.
- Display GBP prices, billing frequency, trial/discount expiry and VAT treatment clearly.
- Obtain explicit consent for recurring billing and provide self-service cancellation.
- Document refund, failed-payment and complaint handling.
- Test checkout, webhooks and cancellation entirely in sandbox before live mode.

## Release gate

Live launch remains blocked until the company identity, privacy notice, terms, DPIA, provider contracts, incident plan, payment account and specialist legal review are complete.

## SEO launch status

- Google Search Console domain ownership was verified through Porkbun DNS on 19 July 2026.
- The production sitemap was accepted with status **Success** and six discovered public pages.
- Follow `docs/SEO-LAUNCH-RUNBOOK.md`; keep the Google verification TXT record and authenticated/private routes out of the index.
- Initial indexing and performance data are still pending Google processing and must not be described as guaranteed rankings.

## Official starting points

- ICO UK GDPR guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/
- ICO data protection fee: https://ico.org.uk/for-organisations/data-protection-fee/
- UK copyright guidance: https://www.gov.uk/copyright
- Companies House incorporation: https://www.gov.uk/limited-company-formation
- Ofcom online-safety guidance: https://www.ofcom.org.uk/online-safety/
