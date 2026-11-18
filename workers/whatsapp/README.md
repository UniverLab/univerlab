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
- `INTERNAL_CALL_SECRET`: shared secret for the booking worker's
  `POST /internal/call`, set to the same value as the booking worker's
  `BOOKING_INTERNAL_CALL_SECRET`. Without it every calendar read and
  write answers calendar-down.

Booking configuration (calendar id, windows, digest) lives in the
`deploy-booking` workflow: this worker reaches the calendar over the
`BOOKING` service binding to `univerlab-booking`, never a local
Durable Object. The booking worker owns availability, holds,
confirmation, cancellation, Turnstile verification and the Google
Calendar integration; the site's Workbench booking form talks to it
at `https://booking.univerlab.org` (`/slots`, `/book`, `/cancel`).
The WhatsApp agent books through `POST /internal/call` over the
service binding, with no public round trip and no Turnstile in that
path: the same action envelope the owner speaks, guarded by the
shared binding secret.

- `WORKBENCH_CALENDAR_ID`: the calendar id where sessions are booked.
  Set on the booking worker (`BOOKING_CALENDAR_ID`), kept here for the
  record of what a booking means. A slot is free only when it overlaps nothing in the primary
  calendar, in this calendar, or in another booking still on hold.
- `BOOKING_CONFIG`: the booking rules the owner enforces. Set on the
booking worker (`BOOKING_CONFIG_JSON`); the agent keeps no booking
deploy variables of its own and falls back to the built-in defaults
for display only (the hold message payment sentence arrives with the
reservation instead).
A slot is free only when it overlaps nothing in the primary
calendar, in the Workbench calendar, or in another booking still on
hold. Example (from the booking worker README):

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

Consultations are created as holds whose title the booking worker
stores with the `[Por confirmar]` prefix; the operator confirms by
removing that prefix in the calendar, and the agent notices on its
next check. A hold still
unconfirmed 24 hours after creation is deleted and the client is told
the hold expired. A client who writes BORRAR MIS DATOS or
DELETE MY DATA also releases their held or booked event. Every event
the agent creates has no attendees and sends no notifications; its
description carries the client's name, number, service, language and
intake brief.

Public booking API (no model): the standalone booking worker answers
`https://booking.univerlab.org` so the site's booking form can offer the
free 15-minute first call while the WhatsApp number is not approved
(full route contract in `workers/booking/README.md`). It shares the one
serialized calendar owner and the same configuration and rules as the
agent's offers: slot reads, Turnstile-guarded bookings and signed
cancel links. The WhatsApp webhook and the agent's behaviour do not
change, and the agent itself serves no public booking route.

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

Spending limits (configuration, not code): the `production`
environment's variable `WA_GUARD_CONFIG` reaches the Worker as
`GUARD_CONFIG` (a JSON object). Counters in Durable Object storage
bound what one number and all numbers together may spend, before any
model runs: one number gets at most 12 answered bursts an hour and 40
a Bogota day (past either the client gets one fixed notice per window
and the messages are only stored), 5 voice transcriptions a day (later
notes go to a person untranscribed) and 3 receipt readings per hold
(later files are forwarded unread); client text reaching any model is
capped at 2,000 characters a burst and 1,000 a history turn (storage
keeps the full text); the Worker makes at most 1,500 model calls a
Bogota day (past it every client gets the fixed sentence and a handoff
until the next day, and the operator is told once); the operator gets
at most one handoff notice per client every 10 minutes and 30 agent
messages an hour; a passthrough with no message in either direction
for `passthroughIdleMs` (15 minutes) closes on its own. A deletion written as the exact phrase BORRAR MIS
DATOS / DELETE MY DATA is honoured even over a limit. Unset, the agent
uses the defaults below. To switch, set the variable and re-run the
deploy workflow:

```json
{
  "burstsPerHour": 12,
  "burstsPerDay": 40,
  "voicePerDay": 5,
  "proofsPerHold": 3,
  "burstChars": 2000,
  "historyChars": 1000,
  "modelsPerDay": 1500,
  "handoffMs": 600000,
  "opMsgsPerHour": 30,
  "passthroughIdleMs": 900000
}
```

Morning booking digest (configuration, not code): the booking worker's
Cron Trigger wakes it every 30 minutes, and from the configured time on
it sends the operator one message with that day's bookings through this
worker's `POST /internal/booking-notify` door — time, service,
conversation name and payment state, in time order, read from the same
Workbench calendar events the booking code writes. A day with nothing
booked sends nothing. Later-day bookings, moves and cancellations wait
for their own day's digest; a same-day one that lands after the digest
went out is sent at once as one line. The `production` environment's
variable `BOOKING_DIGEST_JSON` reaches the booking worker as
`BOOKING_DIGEST_CONFIG` (a
JSON object). Unset, it runs at 06:30 America/Bogota (inside quiet
hours, so it uses the gate's quiet-hours exemption; while the operator
is away it waits like any other note and goes out on `/active`). A
retried run on the same day sends nothing twice:

```json
{ "hour": 6, "minute": 30, "enabled": true }
```

It deploys only through `.github/workflows/deploy-whatsapp.yml`
(manual run from `main`). Webhook path: `/webhook`.

Operator (commands, not chat): the lab answers clients from one
WhatsApp chat with the `OPERATOR_PHONE` number. Messages from that
number are commands; every other number never runs them.

- Every open conversation has a short name (the client's cleaned
  profile name, lowercased without accents, at most 16 characters,
  with `-2`, `-3` on collision). Every agent note starts with
  `[name]`, the tag and the priority; no codes travel anywhere.
- `/help` lists the commands. `/recap` lists the open conversations
  (name, tag, priority, minutes since the last client message, booking
  state); `/recap <name>` asks the text model for a Spanish summary of
  that conversation (nothing reaches the client). `/response <name>
  <texto>` sends one message to the client; the agent stays in charge.
  `/take <name>` opens a passthrough: every operator message that is
  not a command goes to the client as is, every client message is
  relayed as `[name] <texto>`. `/release` closes it and the agent takes
  over. `/confirm <name>` and `/cancel <name>` settle a held booking.
- Only one passthrough can be open. While it is open, notes about
  other conversations are queued and delivered in order, highest
  priority first, right after the release. A passthrough with no
  message in either direction for 15 minutes closes on its own (see
  `passthroughIdleMs` below); the operator is told
  `[name] liberada por inactividad` and the queued notes follow.

A client who writes BORRAR MIS DATOS or DELETE MY DATA has
everything their number's Durable Object stores erased at
once, and gets a same-chat confirmation noting that what
they sent stays in their own WhatsApp; after a handoff the
operator is told to delete that chat too. Every incoming
message also sets an alarm for six months later, so silence
erases the object on its own, and writing again after any
erasure starts a fresh conversation.
