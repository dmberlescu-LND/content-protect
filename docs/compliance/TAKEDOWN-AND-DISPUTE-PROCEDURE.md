# Takedown, counter-notice and dispute procedure

Status: operational draft; no real notice may be sent until counsel approves jurisdiction templates.

## Case opening

1. Confirm the account is adult-, email- and authority-verified; do not claim identity verification unless a separately approved identity flow is active.
2. Preserve source URL, host, UTC timestamp, matched asset reference, provider evidence and evidence-object hash. A page-capture hash must not be claimed until page capture is implemented.
3. Record why the content appears unauthorised and identify ambiguity, licence or fair-dealing risks.
4. Redact unrelated personal data and intimate thumbnails from routine staff views.

## Human review and approval

1. A new case starts in `Awaiting operator preparation`; nothing can be approved or sent yet.
2. A trained reviewer confirms evidence quality, the recipient from an HTTPS source, jurisdiction/channel and legal basis.
3. Those fields are inserted into the exact rendered notice and its SHA-256 hash is stored before creator review.
4. The creator sees the evidence, recipient, verification source, legal basis, jurisdiction and exact notice text, then explicitly approves that hash. Any later mutation invalidates approval.
5. A separate final operator review can dispatch only the stored recipient and the exact creator-approved hash.
6. High-risk, disputed or unclear ownership cases require specialist escalation. Automated bulk dispatch is prohibited.

## Delivery and tracking

1. Send only to the platform/host/registrar channel appropriate to the jurisdiction.
2. Store the delivered notice, transport result and provider reference.
3. Statuses distinguish reported, delisted, disabled and verified removed; never equate delisting with source deletion.
4. Follow-ups use documented intervals and stop on dispute or legal escalation.

## Counter-notice/dispute

1. Freeze automated follow-ups immediately.
2. Notify the creator and preserve the counter-notice unchanged.
3. Re-verify ownership/authority, licences, identity and jurisdiction.
4. Do not disclose private creator contact details beyond legal necessity.
5. Route contested legal assertions to qualified counsel; Content Protect does not decide court claims.
6. Record outcome, reasoning, communications and any reinstatement.

## Abuse controls

- Suspend accounts submitting false, harassing or unauthorised claims.
- Provide an independent channel for reported parties to dispute a notice.
- Measure reversals, disputes and false-positive rates by provider and matching version.
- Require management approval before changing live notice templates or automation thresholds.
