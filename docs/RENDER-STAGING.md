# Content Protect staging on Render

This configuration publishes the current application as a private-data-free staging environment.

## Render settings

- Blueprint file: `render.yaml`
- Runtime: Docker
- Region: Frankfurt, Germany
- Instance: Starter
- Persistent disk: 1 GB mounted at `/app/.traceguard-data`
- Health check: `/api/health/ready`
- Automatic deploys: enabled for new commits
- Payments, takedowns and biometrics: sandbox/disabled

Render generates the encryption master key as a secret. Never copy this key into GitHub or commit it to the repository.

## Safety boundary

Do not upload real intimate or commercially sensitive creator media to this staging deployment. The current JSON and encrypted-file storage is suitable for product demonstration and controlled testing only. Before accepting real customer content, complete the production migration described in `PRODUCTION-INFRASTRUCTURE.md`.

## Domain connection

After the Render deployment is healthy, add both `content-protect.com` and `www.content-protect.com` in the service's Custom Domains screen. Render will show the exact DNS records to copy into Porkbun. Do not change DNS before the deployment has passed its health check.
