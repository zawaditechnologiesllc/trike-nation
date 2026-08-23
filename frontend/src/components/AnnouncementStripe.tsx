"use client";

import Link from "next/link";
import type { Announcement } from "@/lib/types";

/**
 * The scrolling notice stripe.
 *
 * Duration is computed from the content length rather than fixed, so a longer
 * list scrolls at the SAME speed instead of racing. The track is duplicated
 * once and translated by exactly -50%, which is what makes the loop seamless.
 *
 * Respects prefers-reduced-motion (see globals.css): the animation stops and
 * the notices simply sit there, still readable.
 */
export default function AnnouncementStripe({ announcements }: { announcements: Announcement[] }) {
  if (announcements.length === 0) return null;

  const characters = announcements.reduce((total, a) => total + a.message.length, 0);
  // ~18 characters a second reads comfortably without feeling slow.
  const durationSeconds = Math.max(18, Math.round((characters * 2) / 18));

  const item = (announcement: Announcement, key: string) => {
    const content = <span className="px-6 font-mono text-xs tracking-wide">{announcement.message}</span>;
    return announcement.href ? (
      <Link key={key} href={announcement.href} className="hover:text-on-surface">
        {content}
      </Link>
    ) : (
      <span key={key}>{content}</span>
    );
  };

  return (
    <div className="overflow-hidden border-b border-outline bg-primary/90 py-2 text-on-primary">
      <div className="stripe-track" style={{ animationDuration: `${durationSeconds}s` }}>
        {/* Rendered twice: the second copy is what the -50% translate reveals. */}
        {announcements.map((a, i) => item(a, `a-${i}`))}
        {announcements.map((a, i) => item(a, `b-${i}`))}
      </div>
    </div>
  );
}
