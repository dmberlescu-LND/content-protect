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
- A new schema-bound, non-destructive production retention preview completed successfully on 20 July 2026 against revision `41c375aa4c1b` and migration `022_subscription_consent_binding.sql`. It found no customer/content, evidence-capture, closed consumer-case or closed-security-incident deletion candidates and only 37 expired rate-limit entries. Render ran `node scripts/retention.mjs` with `execute: false`; the transaction rolled back, no database row or storage object was deleted, and execution remains disabled pending policy, legal and operational approval.
- Execute data-processing agreements and international-transfer safeguards with every provider.
- Before TinEye activation, complete `docs/vendor-due-diligence/TINEYE-ACTIVATION.md`; record the approved privacy/transfer review and the provider's written lawful-adult-content confirmation in the two fail-closed Render variables. An API key alone must never activate scanning.
- Before video-frame scanning, obtain written confirmation covering derived video frames, approve the DPIA and the maximum three paid queries per video, publish counsel-approved Privacy Notice and Service Terms versions describing the flow, and only then set `TINEYE_VIDEO_FRAME_APPROVAL_REFERENCE`. Stored videos must remain unsearched while this value is absent, and the production readiness gate must remain closed.
- Commission independent penetration testing before commercial launch.
- The encrypted incident register and 72-hour personal-data-breach workflow are implemented in `/operator`: automatic non-overridable ICO deadline, named roles, append-only event timeline, fresh-MFA critical decisions, minimised audit metadata and fail-closed recovery/notification/closure rules. Complete the emergency contact list in `docs/compliance/INCIDENT-RESPONSE-PLAN.md`, obtain management/counsel approval and run a documented tabletop exercise before launch.
- The signed UK launch-governance gate is implemented and fail-closed. It requires an offline Ed25519 signature over the current migration, every current compliance version, a maximum 370-day approval period and ten exact evidence controls. Production holds only the public key and manifest; the private key must remain outside Render/GitHub/repository. The gate is intentionally unconfigured until every item in `docs/compliance/UK-LAUNCH-GOVERNANCE.md` has real retained evidence and director/board approval.
- The encrypted, signed, non-overwriting audit-export job is implemented and fail-closed. Before launch, select a separately administered S3-compatible destination, approve its DPA/transfer and custody record, configure a 400-day lifecycle and isolated read/write-without-delete credentials, run `pnpm audit:export`, and confirm fresh verified evidence opens the `auditExport` readiness gate.
- Production-monitor alert delivery was acceptance-tested on 19 July 2026: deliberately failed GitHub run #27 (`29704210377`) generated a notification received by the director on-call mailbox at 22:22 BST, and recovery run #28 (`29704238669`) succeeded. Re-test after any recipient, notification-setting or workflow-ownership change.
- Schema-bound disaster recovery was re-tested after migration `019_incident_register.sql` on 20 July 2026. Render job `content-protect-backup` created encrypted database/media snapshots, restored the database into an isolated PostgreSQL identity, compared all 17 durable tables including both incident-register tables with zero discrepancies, reported authenticated evidence and reopened the live `backupRestore` gate. Evidence is recorded in `docs/OPERATIONS-RUNBOOK.md`.

## Creator safety

- Restrict the service to verified adults aged 18+.
- Use a specialist age/identity provider; do not retain raw identity documents unless strictly necessary.
- The official Yoti Node SDK 4.13.2 pins vulnerable `form-data` 4.0.4 and `protobufjs` 8.2.1 releases. The frozen lockfile now safely overrides them to `form-data` 4.0.6 and `protobufjs` 8.7.1; the production dependency audit reported no known moderate/high/critical vulnerabilities on 20 July 2026. Content Protect refuses Yoti live mode if the resolved versions fall below 4.0.6 and 8.5.1 respectively, and CI now fails closed on a moderate-or-higher production-dependency advisory.
- Separate identity verification data from creator content.
- Keep Sandbox testing restricted to the expressly approved test-account allowlist. A Sandbox result must be labelled test-only, require password reauthentication and stop counting automatically when the application changes to live Yoti mode.
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
- Deploy migration `022_subscription_consent_binding.sql`, verify that legacy subscriptions are fail-closed as `unverified`, and complete a real Stripe test-mode Checkout proving the retained consent/session/subscription binding before enabling live prices.
- Verify that account deletion cancels the exact test subscription first, persists the ended state, rejects any pending invoice item or automatically advancing open/draft invoice, fails closed during a Stripe outage, and that an unverified non-terminal subscription cannot create a duplicate checkout.
- Document refund, failed-payment and complaint handling.
- The encrypted complaint workflow now executes refunds through Stripe rather than accepting a manually typed completion reference. It verifies the payment and paid subscription invoice belong to the case account and a configured Content Protect price, enforces GBP/mode/remaining-balance checks, binds the exact approved amount to an idempotent numbered attempt, tracks pending/failed results and permits resolution only after Stripe reports a matching succeeded refund. Complete a real Stripe test-mode acceptance run and retain its non-personal evidence before live billing approval.
- Test checkout, webhooks and cancellation entirely in sandbox before live mode.

## Release gate

Live launch remains blocked until the company filings, privacy notice, terms, DPIA, provider contracts, incident plan, payment account, specialist legal review and every signed UK launch-governance control are complete.

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
