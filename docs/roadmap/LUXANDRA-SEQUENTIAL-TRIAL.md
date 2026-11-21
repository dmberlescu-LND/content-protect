# Luxandra — sequential plan trial

**Status:** prepared; not enabled in production.

The runtime feature flag is off by default. It requires the explicit mode
`luxandra-sequential`, a single invited creator email and a UTC start timestamp;
malformed or incomplete configuration fails closed.

## Purpose

Let one explicitly invited creator evaluate the planned Monitor, Protect and Pro
experience before Stripe live billing or a commercial discovery provider is
activated. The trial is a product-validation entitlement, not a subscription.

## Schedule

| Period | Plan | Duration |
| --- | --- | ---: |
| 1 | Monitor | 30 days |
| 2 | Protect | 30 days |
| 3 | Pro | 30 days |

The periods are sequential and cannot overlap, restart, or be extended by a
client request. The account is invitation-only and the trial ends after the
third period.

## Guardrails

- No card, checkout session, invoice, renewal or automatic charge is created.
- Provider scanning remains disabled until the commercial provider, DPA,
  privacy decision and spending cap are approved.
- External notices and takedown delivery remain disabled or manual-review-only.
- Admission requires invitation, verified email, approved age/eligibility state
  and an explicit rights declaration for each uploaded reference file.
- Trial usage is logged with the active phase, limits, consent state and expiry.
- The UI must call the period a **trial evaluation**, never a paid subscription.
- The trial configuration is invitation-bound and is not enabled by setting a
  client-side value.

## Exit evidence

Before Stripe or TinEye activation, retain a non-personal report containing:

1. feature coverage and blocked-gate behaviour for all three phases;
2. upload, deletion, withdrawal and expiry tests;
3. per-phase usage and estimated provider cost (zero while scanning is disabled);
4. creator feedback and unresolved safety/privacy issues;
5. explicit approval for the next external gate.

## External gates still separate

This trial policy does not approve or activate TinEye, Stripe, Yoti live, legal
counsel/DPIA, retention automation, audit export or external takedown delivery.
