# Takedown, counter-notice and dispute procedure

Status: operational draft; no real notice may be sent until counsel approves jurisdiction templates.

## Case opening

1. Confirm the account is adult- and email-verified; do not claim identity verification unless a separately approved identity flow is active.
2. Require a versioned declaration for the specific reference file: claimant capacity, legal/business rights-holder name, a restricted evidence reference, authority and accuracy confirmations, and an optional original-publication HTTPS URL. A general registration checkbox is not sufficient.
3. Require a current creator-supplied JPEG, PNG or WebP capture of the matched page. Record separate evidence-processing consent and the creator's confirmation that it depicts the matched URL and has not been manipulated except to crop unrelated material. Encrypt the capture, bind its SHA-256 checksum, URL, host and UTC timestamp into evidence snapshot version 3, and prohibit replacement after case creation. Do not describe this creator-supplied capture as independent notarisation.
4. Preserve the rights declaration with the source URL, host, UTC timestamp, matched asset reference, provider evidence, page-capture checksum and complete evidence-object hash.
5. Record why the content appears unauthorised and identify ambiguity, licence or fair-dealing risks.
6. Redact unrelated personal data and intimate thumbnails from routine staff views. Supporting contracts or identity documents stay in the separately restricted company record and are referenced by an opaque identifier; they are not uploaded through the creator form.

## Human review and approval

1. A new case starts in `Awaiting operator preparation`; nothing can be approved or sent yet.
2. A trained reviewer confirms the per-file rights declaration and restricted supporting record, then records a non-public review reference. Missing rights review blocks preparation.
3. Access to the sensitive capture requires a current non-reusable operator TOTP step-up and is audited. The reviewer compares the preserved capture with the live URL, confirms its SHA-256 binding and records that review before notice preparation.
4. The reviewer confirms evidence quality, the recipient from an HTTPS source, jurisdiction/channel and legal basis.
5. The notice uses the legal claimant name, separately labels any professional name, identifies the reviewed rights holder and claimant capacity, and stores the SHA-256 hash before creator review.
6. The creator sees the evidence, recipient, verification source, legal basis, jurisdiction and exact notice text—including the legal name that will be disclosed—then explicitly approves that hash. Any later mutation invalidates approval.
7. A separate final operator review can dispatch only the stored recipient and the exact creator-approved hash.
8. High-risk, disputed or unclear ownership cases require specialist escalation. Automated bulk dispatch is prohibited.

## Delivery and tracking

1. Send only to the platform/host/registrar channel appropriate to the jurisdiction.
2. Store the delivered notice, transport result and provider reference.
3. Statuses distinguish reported, delisted, disabled and verified removed; never equate delisting with source deletion.
4. Follow-ups use documented intervals and stop on dispute or legal escalation.

## Counter-notice/dispute

1. Freeze automated follow-ups immediately.
2. Notify the creator and preserve the counter-notice unchanged.
3. Re-verify ownership/authority, licences, claimant assurance and jurisdiction; do not claim full identity verification unless separately enabled and approved.
4. Do not disclose private creator contact details beyond legal necessity.
5. Route contested legal assertions to qualified counsel; Content Protect does not decide court claims.
6. Record outcome, reasoning, communications and any reinstatement.

## Abuse controls

- Suspend accounts submitting false, harassing or unauthorised claims.
- Provide an independent channel for reported parties to dispute a notice.
- Measure reversals, disputes and false-positive rates by provider and matching version.
- Require management approval before changing live notice templates or automation thresholds.
