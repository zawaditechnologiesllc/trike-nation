import { db } from "../supabase";

/**
 * Claiming a step IS the insert.
 *
 * Every "did we already do this?" question here is answered by the UNIQUE
 * (order_id, stage) constraint on order_events, never by a SELECT followed by
 * an INSERT. That race fires exactly when two cron runs overlap — the window
 * between the read and the write — and the symptom is a customer receiving the
 * same email twice.
 *
 * Postgres error 23505 means someone else got there first, which is a normal
 * outcome, not a failure.
 */

export const UNIQUE_VIOLATION = "23505";

export interface StageClaim {
  orderId: string;
  /** The idempotency key. Must be distinct per thing-that-happens-once. */
  stage: string;
  type: string;
  title?: string;
  message?: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actor?: { id?: string | null; email?: string | null } | null;
  metadata?: Record<string, unknown>;
}

export interface ClaimResult {
  /** True when THIS caller won the claim and should do the work. */
  claimed: boolean;
  eventId?: string;
  error?: string;
}

/**
 * Attempts to claim a stage. Returns claimed:false when another run already
 * holds it — the caller must then do nothing, not retry.
 */
export async function claimStage(claim: StageClaim): Promise<ClaimResult> {
  const { data, error } = await db()
    .from("order_events")
    .insert({
      order_id: claim.orderId,
      stage: claim.stage,
      type: claim.type,
      title: claim.title ?? "",
      message: claim.message ?? "",
      from_status: claim.fromStatus ?? null,
      to_status: claim.toStatus ?? null,
      actor_id: claim.actor?.id ?? null,
      actor_email: claim.actor?.email ?? null,
      metadata: claim.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { claimed: false };
    console.error("[events] claim failed", error);
    return { claimed: false, error: error.message };
  }
  return { claimed: true, eventId: data?.id as string | undefined };
}

/** Records the outcome of the work a claim authorised. */
export async function markClaimResult(
  eventId: string,
  outcome: { emailSent: boolean; emailTo?: string | null; emailSubject?: string | null; error?: string },
): Promise<void> {
  const { error } = await db()
    .from("order_events")
    .update({
      email_sent: outcome.emailSent,
      notified: outcome.emailSent,
      email_to: outcome.emailTo ?? null,
      email_subject: outcome.emailSubject ?? null,
      ...(outcome.error ? { metadata: { email_error: outcome.error } } : {}),
    })
    .eq("id", eventId);
  if (error) console.error("[events] could not record claim result", error);
}

/**
 * A stage that is recorded but never emailed — history, not a notification.
 * Still goes through the same lock so the timeline has no duplicate rows.
 */
export async function recordStage(claim: StageClaim): Promise<boolean> {
  const result = await claimStage(claim);
  return result.claimed;
}
