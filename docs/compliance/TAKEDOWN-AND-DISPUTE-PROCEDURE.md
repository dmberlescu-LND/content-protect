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

1. The independent public form accepts only text and optional public HTTPS links. It requires the delivered notice's case reference and exact reported URL, a safe contact email, country, reason, 40–4,000 character statement, authority/accuracy/privacy confirmations and confirmation that no identity or intimate files were supplied. File uploads are prohibited.
2. Malformed submissions are rejected, while unknown or non-delivered cases receive the same generic `202` response as a valid intake so the endpoint cannot enumerate cases. Distributed IP/case limits, a honeypot and duplicate-contact suppression reduce abuse.
3. For a matching delivered case, application-encrypt the complete intake immediately. Store only category, country, keyed contact pseudonym, statement SHA-256 and encrypted ciphertext in the case event. HMAC-bind the event to the case and copy only that integrity hash into the tamper-evident audit chain. Do not copy contact email or statement into logs or audit metadata.
4. Freeze automated follow-ups immediately by clearing the next-action time and moving the case to `Disputed — review required`. Show the creator only the non-sensitive dispute summary and never the ciphertext, contact hash, internal note or counsel reference.
5. The operator queue exposes metadata only. Opening the encrypted statement requires a secure operator session, explicit need-to-review confirmation and a current non-reusable TOTP code; access is audited. Recording an outcome requires another new TOTP code.
6. Re-verify ownership/authority, licences, claimant assurance and jurisdiction; do not claim full identity verification unless separately enabled and approved. Escalation leaves the dispute open and follow-ups frozen. Acceptance closes the case. Continuation requires an opaque qualified-counsel approval reference plus confirmation that the creator was notified. When several disputes exist, the case remains frozen until every dispute is resolved; any accepted dispute closes the case.
7. Do not disclose private creator contact details beyond legal necessity. Content Protect does not decide court claims.
8. Record outcome, reasoning, communications and any reinstatement. Retain dispute communications with the associated case under the six-year case-communications schedule unless a documented legal hold applies.

## Abuse controls

- Suspend accounts submitting false, harassing or unauthorised claims.
- Provide an independent channel for reported parties to dispute a notice.
- Measure reversals, disputes and false-positive rates by provider and matching version.
- Require management approval before changing live notice templates or automation thresholds.
