# univerlab-booking

Standalone booking service for the free 15-minute first call, deployed on
its own at `booking.univerlab.org`. Two clients share one API:

- the site's Workbench booking form (`/slots`, `/book`, `/cancel`), guarded
  by Cloudflare Turnstile;
- the WhatsApp agent, through `POST /internal/call` over a Cloudflare
  service binding (no public round trip, no Turnstile on that path).

The worker owns availability, holds, confirmation, cancellation and the
Google Calendar integration, with its own `Calendar` and `Gate` Durable
Objects and its own deploy configuration. It needs no WhatsApp secret.

## Secrets

Set these as GitHub Actions secrets (the `deploy-booking` workflow maps
each one to the Wrangler secret of the same name):

| GitHub secret          | Wrangler secret          | What it is                              |
| ---------------------- | ------------------------ | --------------------------------------- |
| `GOOGLE_CLIENT_ID`     | `GOOGLE_CLIENT_ID`       | Google OAuth client id                  |
| `GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET`   | Google OAuth client secret              |
| `GOOGLE_REFRESH_TOKEN` | `GOOGLE_REFRESH_TOKEN`   | Google OAuth refresh token              |
| `TURNSTILE_SECRET`     | `TURNSTILE_SECRET`       | Cloudflare Turnstile secret key         |
| `BOOKING_INTERNAL_CALL_SECRET` | `INTERNAL_CALL_SECRET` | Shared secret for the WhatsApp worker's `POST /internal/call` |
| `CLOUDFLARE_API_TOKEN` | —                        | Token used by the deploy step itself    |
| `CLOUDFLARE_ACCOUNT_ID`| —                        | Account used by the deploy step itself  |

Calendar id and booking rules are configuration, not code: set them as
repository variables and re-run the workflow, no commit needed.

| Repository variable       | Wrangler var               | What it is                              |
| ------------------------- | -------------------------- | --------------------------------------- |
| `BOOKING_CALENDAR_ID`     | `WORKBENCH_CALENDAR_ID`    | Calendar the owner writes to            |
| `BOOKING_CONFIG_JSON`     | `BOOKING_CONFIG`           | Windows, margins, caps (JSON)           |
| `BOOKING_DIGEST_JSON`     | `BOOKING_DIGEST_CONFIG`    | Morning digest time/enabled flag (JSON) |

How to set them (repository settings, or the `gh` CLI):

```sh
gh secret set GOOGLE_CLIENT_ID --repos UniverLab/univerlab
gh secret set GOOGLE_CLIENT_SECRET --repos UniverLab/univerlab
gh secret set GOOGLE_REFRESH_TOKEN --repos UniverLab/univerlab
gh secret set TURNSTILE_SECRET --repos UniverLab/univerlab
gh secret set BOOKING_INTERNAL_CALL_SECRET --repos UniverLab/univerlab  # also set on the WhatsApp deploy workflow
gh variable set BOOKING_CALENDAR_ID --repos UniverLab/univerlab
gh variable set BOOKING_CONFIG_JSON --repos UniverLab/univerlab
gh variable set BOOKING_DIGEST_JSON --repos UniverLab/univerlab
```

## Operator notes

Same-day web bookings and the morning digest reach the operator through
the `OPERATOR` service binding to the WhatsApp worker
(`POST /internal/booking-notify`). Without that binding the worker still
serves slots, bookings and cancels; only the operator notes are skipped.

## Local checks

```sh
npm ci
npm run typecheck
npx jest test/<file>.test.ts   # from the repo root
```
