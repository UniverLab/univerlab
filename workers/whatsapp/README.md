# univerlab-whatsapp

Cloudflare Worker that receives the lab's WhatsApp messages
through Meta's WhatsApp Cloud API.

It answers webhook verification, rejects deliveries
whose signature does not match the app secret, routes
each message to a Durable Object named after the
sender's number, stores it once, marks it read, then
answers text messages with a Workers AI model
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

Text model (configuration, not code): the `production`
environment's variables `WA_TEXT_MODEL` and
`WA_TEXT_MODEL_OPTIONS` reach the Worker as `TEXT_MODEL`
and `TEXT_MODEL_OPTIONS` (a JSON object merged into the
request). Unset, it uses `@cf/zai-org/glm-4.7-flash`.
To switch, set them and re-run the deploy workflow:

```sh
gh variable set WA_TEXT_MODEL --env production --body '@cf/qwen/qwen3.8-27b'
gh variable set WA_TEXT_MODEL_OPTIONS --env production --body '{"reasoning_effort":"low"}'
gh workflow run deploy-whatsapp.yml --ref main
```

Options differ per model: Qwen 3.8 reasons at `xhigh`
unless `reasoning_effort` is set; GLM-4.7 Flash takes
`{"chat_template_kwargs":{"enable_thinking":false}}`
instead; its schema has no `reasoning_effort`.

It deploys only through `.github/workflows/deploy-whatsapp.yml`
(manual run from `main`). Webhook path: `/webhook`.

A client who writes BORRAR MIS DATOS or DELETE MY DATA has
everything their number's Durable Object stores erased at
once, and gets a same-chat confirmation noting that what
they sent stays in their own WhatsApp; after a handoff the
operator is told to delete that chat too. Every incoming
message also sets an alarm for six months later, so silence
erases the object on its own, and writing again after any
erasure starts a fresh conversation.
