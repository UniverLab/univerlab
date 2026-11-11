export interface Env {
  AI: Ai;
  CONVERSATION: DurableObjectNamespace<import('./conversation').Conversation>;
  WA_APP_SECRET: string;
  WA_VERIFY_TOKEN: string;
  WA_ACCESS_TOKEN: string;
  WA_PHONE_NUMBER_ID: string;
  OPERATOR_PHONE: string;
  TEXT_MODEL?: string;
  TEXT_MODEL_OPTIONS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
  WORKBENCH_CALENDAR_ID?: string;
  BOOKING_CONFIG?: string;
}
