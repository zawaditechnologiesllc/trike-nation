/**
 * The internal fulfilment stage schedule — when each tracking email fires.
 *
 * Distinct from the quoted delivery window (delivery.ts). Days are counted
 * from the moment payment was CONFIRMED, not from checkout, because an order
 * whose payment is still being verified has not started its build.
 */

export const STAGES = ["confirmed", "building", "shipped", "arriving", "delivered"] as const;
export type Stage = (typeof STAGES)[number];

export interface StageDefinition {
  stage: Stage;
  /** Days after confirmed payment at which this stage becomes due. */
  day: number;
  title: string;
  /** Body copy. Kept here so the app and the mail service cannot disagree. */
  body: string;
  /** Whether reaching this stage emails the customer. */
  emails: boolean;
}

/**
 * Day 7 / 12 / 20 are the customer-facing progress updates. `confirmed` is day
 * 0 and is emailed by the payment confirmation itself, so it does not email
 * again here.
 */
export const SCHEDULE: StageDefinition[] = [
  {
    stage: "confirmed",
    day: 0,
    title: "Payment confirmed",
    body: "Your payment is confirmed and your machine is in the build queue.",
    emails: false,
  },
  {
    stage: "building",
    day: 7,
    title: "Week one: your build is underway",
    body: "Your machine has cleared frame prep and is being assembled. Nothing needed from you — this is just us keeping you in the loop.",
    emails: true,
  },
  {
    stage: "shipped",
    day: 12,
    title: "Assembled and heading for the crate",
    body: "Assembly and the pre-ship shakedown are done or close to it. Next stop is crating and the freight handoff.",
    emails: true,
  },
  {
    stage: "arriving",
    day: 20,
    title: "In transit — final stretch",
    body: "Your crate is with the carrier and moving. If it has already landed, ignore this — and if the tracking looks stuck, tell us and we'll chase it.",
    emails: true,
  },
];

const DAY_MS = 86_400_000;

export function daysSince(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / DAY_MS);
}

/**
 * The LAST stage that is due, not the next one.
 *
 * This is what makes a cron outage harmless: an order paid 40 days ago lands
 * on its correct stage in a single step instead of firing four emails in a
 * minute as the runner catches up.
 */
export function dueStage(paidAt: Date, now: Date): StageDefinition | null {
  const elapsed = daysSince(paidAt, now);
  let due: StageDefinition | null = null;
  for (const definition of SCHEDULE) {
    if (elapsed >= definition.day) due = definition;
  }
  return due;
}

/** Every stage due at `now`, oldest first — for recording skipped history. */
export function dueStages(paidAt: Date, now: Date): StageDefinition[] {
  const elapsed = daysSince(paidAt, now);
  return SCHEDULE.filter((definition) => elapsed >= definition.day);
}

export function stageDefinition(stage: string): StageDefinition | undefined {
  return SCHEDULE.find((definition) => definition.stage === stage);
}

/** Ordering helper: is `a` further along than `b`? */
export function isAfter(a: string, b: string): boolean {
  return STAGES.indexOf(a as Stage) > STAGES.indexOf(b as Stage);
}

/**
 * Abandoned-order chase schedule: first email immediately, then these. After
 * day 12 we stop — a fourth reminder converts nobody and costs the address.
 */
export const ABANDONED_REMINDER_DAYS = [3, 7, 12] as const;

/** The order_events stage key each reminder claims, so two runs cannot double-send. */
export function abandonedStageKey(day: number): string {
  return `abandoned_day_${day}`;
}

/** The last due reminder, same "last not next" rule as dueStage. */
export function dueAbandonedReminder(createdAt: Date, now: Date): number | null {
  const elapsed = daysSince(createdAt, now);
  let due: number | null = null;
  for (const day of ABANDONED_REMINDER_DAYS) {
    if (elapsed >= day) due = day;
  }
  return due;
}
