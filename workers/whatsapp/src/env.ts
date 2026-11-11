export interface Env {
  AI: Ai;
  CONVERSATION: DurableObjectNamespace<import('./conversation').Conversation>;
  WA_APP_SECRET: string;
  WA_VERIFY_TOKEN: string;
  WA_ACCESS_TOKEN: string;
  WA_PHONE_NUMBER_ID: string;
  OPERATOR_PHONE: string;
}
