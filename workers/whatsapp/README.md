# univerlab-whatsapp

Cloudflare Worker that receives the lab's WhatsApp messages
through Meta's WhatsApp Cloud API.

It answers webhook verification, rejects deliveries
whose signature does not match the app secret, routes
each message to a Durable Object named after the
sender's number, stores it once, marks it read, then
answers text messages with Qwen 3.8 27B on Workers AI
from the Workbench copy in the site's dictionaries
(src/i18n), in the client's language, and forwards the
chat to OPERATOR_PHONE when a person is needed
(bookings, payments, cancellations, unknown questions,
non-text messages).

Secrets (set in the deploy workflow, never in code):

- `WA_APP_SECRET`
- `WA_VERIFY_TOKEN`
- `WA_ACCESS_TOKEN`
- `WA_PHONE_NUMBER_ID`
- `OPERATOR_PHONE`

It deploys only through `.github/workflows/deploy-whatsapp.yml`
(manual run from `main`). Webhook path: `/webhook`.
