/** Environment of the standalone booking worker (booking.univerlab.org).
 *
 *  The public booking door (/slots, /book, /cancel) and the agent door
 *  (POST /internal/call) share this env. There are no WhatsApp secrets
 *  here: the worker verifies web requests with its own Turnstile secret
 *  and reaches the operator through the OPERATOR service binding.
 */
export interface Env {
  CALENDAR: DurableObjectNamespace<import('./calendar').Calendar>;
  GATE?: DurableObjectNamespace<import('./gate').Gate>;
  /** Service binding to the WhatsApp worker: operator notes and digest state. */
  OPERATOR?: Fetcher;
  /** Shared secret with the WhatsApp worker's BOOKING binding: the only key
   *  to POST /internal/call. Without it every agent-door call is refused. */
  INTERNAL_CALL_SECRET?: string;
  TURNSTILE_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
  WORKBENCH_CALENDAR_ID?: string;
  BOOKING_CONFIG?: string;
  BOOKING_DIGEST_CONFIG?: string;
}
