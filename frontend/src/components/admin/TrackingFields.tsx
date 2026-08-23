"use client";

import { useEffect, useState } from "react";
import { couriersByRegion, generateInternalReference, trackingLink } from "@shared/core/couriers";

/**
 * Courier picker and tracking number.
 *
 * The admin is told, BEFORE saving, whether the customer will get a clickable
 * link — because the alternative is finding out from a customer who followed a
 * link to "not found" and concluded nothing had shipped.
 */
export default function TrackingFields({
  courier,
  tracking,
  onCourierChange,
  onTrackingChange,
}: {
  courier: string;
  tracking: string;
  onCourierChange: (value: string) => void;
  onTrackingChange: (value: string) => void;
}) {
  const [groups] = useState(() => couriersByRegion());
  const [state, setState] = useState(() => trackingLink(courier, tracking));

  useEffect(() => {
    setState(trackingLink(courier, tracking));
  }, [courier, tracking]);

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="label-caps text-on-surface-muted">Courier</span>
        <select value={courier} onChange={(e) => onCourierChange(e.target.value)} className="input-tech mt-2">
          <option value="">Not selected</option>
          {groups.map((group) => (
            <optgroup key={group.region} label={group.region}>
              {group.couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.trackingUrl ? "" : " (no tracking link)"}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="label-caps text-on-surface-muted">Tracking Number</span>
        <div className="mt-2 flex gap-2">
          <input
            className="input-tech flex-1"
            placeholder="Carrier tracking #"
            value={tracking}
            onChange={(e) => onTrackingChange(e.target.value)}
          />
          <button
            type="button"
            onClick={() => onTrackingChange(generateInternalReference())}
            title="Generate an internal reference for an order with no carrier number yet"
            className="label-caps border border-outline-variant px-3 text-on-surface-variant hover:border-secondary hover:text-secondary"
          >
            Generate
          </button>
        </div>
      </label>

      {/* The honest preview. */}
      <p
        className={`border-l-2 pl-3 font-mono text-xs leading-relaxed ${
          state.url ? "border-signal-positive text-signal-positive" : "border-outline-variant text-on-surface-muted"
        }`}
      >
        {state.url ? "The customer gets a link: " : ""}
        {state.url ? (
          <a href={state.url} target="_blank" rel="noreferrer" className="underline">
            {state.url.slice(0, 70)}…
          </a>
        ) : (
          state.explanation
        )}
      </p>
    </div>
  );
}
