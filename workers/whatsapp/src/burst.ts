/** One open burst of client messages waiting for the quiet window to close. */
export interface BurstState {
  /** Date.now() when the first message of the burst arrived. */
  firstAt: number;
  /** Date.now() after the last message after which the burst is answered. */
  quietDue: number;
  /** Date.now() after the first message after which the burst is answered. */
  maxDue: number;
  /** Storage ids of the burst messages, in arrival order. */
  ids: string[];
  /** Sender of the latest burst message. */
  from: string;
  /** Contact name of the latest burst message, if known. */
  name?: string;
}

/** The earliest pending deadline wins: the one alarm fires for whichever is
 *  due first. Non-positive deadlines are not pending. */
export function nextAlarm(burstDueMs: number, retentionMs: number, holdDueMs?: number): number {
  const pending = [burstDueMs, retentionMs, holdDueMs].filter(
    (n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
  );
  return Math.min(...pending);
}

/** Whether the burst window has closed: no message arrived during the quiet
 *  window, or the burst reached the longest it may stay open. */
export function burstDue(burst: BurstState | null, now: number = Date.now()): boolean {
  if (burst === null) return false;
  if (!Number.isFinite(burst.quietDue) || !Number.isFinite(burst.maxDue)) return false;
  return now >= Math.min(burst.quietDue, burst.maxDue);
}

/** Every message of the burst as one client turn, oldest first. */
export function joinBurst(texts: Array<{ at: number; text: string }>): string {
  return texts
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((t) => t.text)
    .join('\n');
}
