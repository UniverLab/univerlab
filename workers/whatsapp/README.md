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
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`:
  the lab's Google OAuth client and refresh token (calendar events
  and free/busy scopes). The agent uses them to read the primary
  calendar's free/busy and to create, read and delete events in the
  Workbench calendar. Without them booking falls back to today's
  behavior: the intake brief goes to the operator, who books by hand.

Booking (configuration, not code): the `production` environment's
variables `WA_WORKBENCH_CALENDAR_ID` and `WA_BOOKING_CONFIG` reach
the Worker as `WORKBENCH_CALENDAR_ID` and `BOOKING_CONFIG`.

- `WORKBENCH_CALENDAR_ID`: the calendar id where sessions are booked.
  A slot is free only when it overlaps nothing in the primary
  calendar, in this calendar, or in another booking still on hold.
- `BOOKING_CONFIG`: a JSON object with the bookable hours and limits.
  Unset, the agent uses weekdays 07:00–08:00 and 15:00–19:00
  America/Bogota (never Colombian holidays), 15 minutes of margin
  between sessions, at most 3 sessions per day, at least 12 hours of
  notice, and slots up to 14 days ahead. Example:

```json
{
  "windows": [[7, 8], [15, 19]],
  "marginMin": 15,
  "maxPerDay": 3,
  "noticeHours": 12,
  "horizonDays": 14,
  "freeCallDays": 90,
  "expiredHoldDays": 14,
  "expiredHoldsMax": 2,
  "movesMax": 2,
  "openHoldsMax": 4,
  "bookingsPerDay": 4,
  "payments": {
    "es": "Bre-B en Colombia o PayPal desde el exterior",
    "en": "Bre-B in Colombia or PayPal from abroad"
  },
  "payee": "Laboratorio UniverLab"
}
```

`windows` are `[startHour, endHour)` pairs in Bogota wall time;
`payments` overrides the sentence telling the client how to pay
(Bre-B in Colombia, PayPal from abroad); `payee` names the expected
recipient of the payment, matched against the name on the receipt.
`freeCallDays` blocks a second free first call inside that many days;
`expiredHoldDays`/`expiredHoldsMax` block a further hold after that many
unpaid holds expired inside the window; `movesMax` caps how many times one
booking may be moved; `openHoldsMax` caps unconfirmed holds across all
contacts; `bookingsPerDay` caps new holds and bookings created per Bogota
calendar day across all contacts (a hold counts toward it).

Every write to the Workbench calendar goes through one serialized owner,
the `Calendar` Durable Object (one `calendar` instance shared by all client
conversations), which re-checks the slot free at write time: when two
clients pick the same slot at once exactly one gets it and the other is
offered what remains. The same owner enforces one upcoming booking or hold
per contact, the free-call, expired-hold, move and global caps above, and
identifies a contact by an opaque key (`wa:<phone>`, so a second channel can
use an email address instead). Refusals are fixed Spanish/English sentences
in code, never the text model, and the client is told a person from the lab
takes over with their notes. Contact records live no longer than the longest
limit window, and BORRAR MIS DATOS / DELETE MY DATA removes them too.

Consultations are created as holds whose title starts with
`[Por confirmar]`; the operator confirms by removing that prefix in
the calendar, and the agent notices on its next check. A hold still
unconfirmed 24 hours after creation is deleted and the client is told
the hold expired. A client who writes BORRAR MIS DATOS or
DELETE MY DATA also releases their held or booked event. Every event
the agent creates has no attendees and sends no notifications; its
description carries the client's name, number, service, language and
intake brief.

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

Voice model (configuration, not code): a voice note is downloaded
from the WhatsApp media endpoint and transcribed by a
speech-to-text model on Cloudflare Workers AI, and the transcript
is processed exactly as if the client had typed it. The
`production` environment's variables `WA_VOICE_MODEL`,
`WA_VOICE_MODEL_OPTIONS` (a JSON object merged into the request)
and `WA_VOICE_MAX_SECONDS` reach the Worker as `VOICE_MODEL`,
`VOICE_MODEL_OPTIONS` and `VOICE_MAX_SECONDS`. Unset, it uses
`@cf/openai/whisper` with a 180-second limit. A note longer than
the limit, or one that fails to download or transcribe, goes to a
person at the lab untranscribed, like any other non-text message.
To switch, set them and re-run the deploy workflow:

```sh
gh variable set WA_VOICE_MODEL --env production --body '@cf/openai/whisper-large-v3-turbo'
gh variable set WA_VOICE_MODEL_OPTIONS --env production --body '{}'
gh variable set WA_VOICE_MAX_SECONDS --env production --body '180'
gh workflow run deploy-whatsapp.yml --ref main
```

Payment proofs (configuration, not code): when a client with a held
consultation sends an image or a PDF, a vision model on Cloudflare
Workers AI reads the receipt and the agent forwards the file to
OPERATOR_PHONE next to the extraction (amount, date, method, reference,
payee), flagging any mismatch against the expected price (COP 150,000,
USD 45 over PayPal) and the `payee` above. The client is told a person
checks it; the agent never confirms a payment by itself. Receipts from
clients without a held booking keep today's handoff. The `production`
environment's variables `WA_PROOF_MODEL` and `WA_PROOF_MODEL_OPTIONS`
(a JSON object merged into the request) reach the Worker as
`PROOF_MODEL` and `PROOF_MODEL_OPTIONS`. Unset, it uses
`@cf/meta/llama-3.2-11b-vision-instruct`. To switch, set them and
re-run the deploy workflow:

```sh
gh variable set WA_PROOF_MODEL --env production --body '@cf/meta/llama-3.2-11b-vision-instruct'
gh variable set WA_PROOF_MODEL_OPTIONS --env production --body '{}'
gh workflow run deploy-whatsapp.yml --ref main
```

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
