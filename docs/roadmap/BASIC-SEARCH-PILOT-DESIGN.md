# Basic Search — pilot design

**Status:** internal design, not activated in production  
**Scope:** one controlled creator pilot, one still image at a time  
**Owner:** Content Protect product and security owner

## Decision

Do not unlock the current `/api/scans` route in the free pilot. It is deliberately
guarded because a real search sends a derived copy of the creator's reference
image to an external provider. A local hash or a simulated result cannot identify
where an image appears on the public web.

The first useful Basic Search is therefore a tightly capped TinEye image search,
with explicit provider and privacy approval, not a fake free scan.

## User-visible tiers

### Free controlled pilot

- encrypted reference vault and per-file rights declaration;
- approved sandbox age test;
- search-readiness explanation, with no public matches claimed;
- manual case intake for a URL the creator already knows;
- no external image search, billing or notice delivery.

### Basic Search (first paid/approved tier)

- still images only;
- one creator-approved image per search;
- hard monthly query allowance, shown before each search;
- TinEye result URLs, domains, match score, crawl date and provider evidence;
- duplicate-result de-duplication and an auditable scan record;
- creator review required before any case or notice;
- no automatic top-ups or silent retries.

### Protect / Pro

Monitoring, higher allowances, operator-assisted case preparation and priority
handling remain separate from discovery. Video-frame search stays disabled until
the provider, DPIA and public wording explicitly cover derived frames.

## Why public free reverse-image buttons are not the default

Google Lens, Bing Visual Search and TinEye's public website are interactive
consumer tools, not an approved Content Protect processing path. Sending an
intimate reference image to one of them would create a new controller/processor
and retention question, outside the current pilot approval. The product must not
silently redirect or upload the image there.

If a creator chooses to use a third-party public tool independently, Content
Protect should show a neutral warning and must not represent that result as an
audited Content Protect match.

## Activation gates

1. TinEye commercial account under White Eagles Digital Marketing LTD.
2. Written permission for lawful adult-content searches and the intended image
   processing.
3. DPA / international-transfer review and retained evidence reference.
4. Approved privacy notice, per-file consent and DPIA decision for the pilot.
5. Smallest provider allowance selected with automatic top-up disabled.
6. Render secrets added only as opaque approval references plus the provider key.
7. One acceptance search on a non-sensitive test image; verify result logging,
   duplicate handling, deletion/retention and cost reconciliation.

## Acceptance criteria

- A free-pilot account cannot create a provider scan or transmit an image.
- A Basic account cannot scan until all provider gates are present.
- A successful scan records provider, query reference, start/end time, count of
  returned backlinks and the exact result URLs without retaining raw provider
  payloads unnecessarily.
- No result is labelled “verified” until it has a source URL and review state.
- No takedown notice can be sent from a discovery result without creator approval,
  preserved page evidence and operator review.
- A failed, timed-out or exhausted search creates no simulated matches.

## Recommended commercial test

Start with the smallest TinEye allowance and one image for Luxandra. Measure:

- unique public URLs returned;
- proportion of relevant results after human review;
- duplicate rate;
- provider cost per reviewed result;
- time from match to preserved evidence;
- creator-confirmed false positives.

Only after those numbers are known should Basic pricing and included search volume
be fixed. This avoids promising “internet coverage” that has not been measured.
