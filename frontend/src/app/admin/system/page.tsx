"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, serviceTone, type AdminSystemReport } from "@/lib/admin";

interface TrustIssue {
  field: string;
  severity: "high" | "medium" | "low";
  detail: string;
  whyItMatters: string;
}
interface TrustReport {
  issues: TrustIssue[];
  neverBuild: string[];
  whatHelps: string[];
}
interface LogoProbe {
  status: "ok" | "not_saved" | "unreachable" | "unusable";
  message: string;
  format?: string;
  width?: number;
  height?: number;
}

const STATUS_LABEL: Record<string, string> = {
  ok: "Operational",
  degraded: "Needs attention",
  down: "Down",
  not_configured: "Not configured",
};

const DOT: Record<string, string> = {
  ok: "bg-success",
  degraded: "bg-amber",
  down: "bg-ember",
  not_configured: "bg-steel-light",
};

/** Every third-party service this store depends on, checked live. */
export default function SystemPage() {
  const [report, setReport] = useState<AdminSystemReport | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [cronMsg, setCronMsg] = useState("");
  const [trust, setTrust] = useState<TrustReport | null>(null);
  const [logo, setLogo] = useState<LogoProbe | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      setReport(await adminFetch<AdminSystemReport>("/system"));
      // Both fail soft: a missing trust report must not blank the page.
      void adminFetch<TrustReport>("/trust").then(setTrust).catch(() => setTrust(null));
      void adminFetch<LogoProbe>("/settings/logo-probe").then(setLogo).catch(() => setLogo(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load system status");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runCron() {
    setCronMsg("Running…");
    try {
      const result = await adminFetch<{ checked: number; sent: unknown[]; skipped: number }>(
        "/system/run-delivery-cron",
        { method: "POST", body: "{}" },
      );
      setCronMsg(
        `Swept ${result.checked} order${result.checked === 1 ? "" : "s"} — ${result.sent.length} update${
          result.sent.length === 1 ? "" : "s"
        } sent, ${result.skipped} skipped.`,
      );
      void load();
    } catch (e) {
      setCronMsg(e instanceof Error ? e.message : "Sweep failed");
    }
  }

  if (error && !report) return <p className="font-mono text-sm text-ember">{error}</p>;
  if (!report) return <p className="label-caps text-silver">Checking connected services…</p>;

  const { app } = report;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="display text-3xl md:text-4xl">System</h1>
          <p className="mt-1 font-mono text-xs text-silver">
            Live status of every service {app.brand} is connected to. Checked{" "}
            {new Date(report.checkedAt).toLocaleTimeString("en-US", { timeStyle: "medium" })}.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[report.overall]}`} />
            <span className={`label-caps ${serviceTone(report.overall)}`}>
              {STATUS_LABEL[report.overall]}
            </span>
          </span>
          <button
            onClick={() => void load()}
            disabled={refreshing}
            className="label-caps border border-steel-light px-4 py-2 text-chrome hover:border-ember hover:text-ember disabled:opacity-40"
          >
            {refreshing ? "Checking…" : "Re-check"}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 font-mono text-xs text-ember">{error}</p>}

      <div className="mt-8 space-y-4">
        {report.services.map((service) => (
          <div key={service.key} className="border border-steel bg-carbon p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[service.status]}`} />
                  <h2 className="display text-xl">{service.name}</h2>
                </div>
                <p className="mt-1 font-mono text-xs text-silver">{service.role}</p>
              </div>
              <span className={`label-caps shrink-0 ${serviceTone(service.status)}`}>
                {STATUS_LABEL[service.status]}
              </span>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-chrome">{service.detail}</p>

            {service.meta && Object.keys(service.meta).length > 0 && (
              <dl className="mt-4 grid gap-x-8 gap-y-2 border-t border-steel/60 pt-4 sm:grid-cols-2">
                {Object.entries(service.meta).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-4">
                    <dt className="label-caps shrink-0 text-silver">{key.replace(/_/g, " ")}</dt>
                    <dd className="min-w-0 break-all text-right font-mono text-xs text-chrome">
                      {Array.isArray(value)
                        ? value.join(", ") || "—"
                        : typeof value === "boolean"
                          ? value
                            ? "yes"
                            : "no"
                          : String(value ?? "—")}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-4">
              {service.docs && (
                <a
                  href={service.docs}
                  target="_blank"
                  rel="noreferrer"
                  className="label-caps text-ember hover:text-blush"
                >
                  Open dashboard →
                </a>
              )}
              {service.key === "cron" && (
                <button onClick={runCron} className="label-caps text-ember hover:text-blush">
                  Run the sweep now →
                </button>
              )}
            </div>
            {service.key === "cron" && cronMsg && (
              <p className="mt-2 font-mono text-xs text-success">{cronMsg}</p>
            )}
          </div>
        ))}
      </div>

      <h2 className="display mt-12 text-2xl">Configuration</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <dl className="space-y-3 border border-steel bg-carbon p-5">
          {[
            ["Brand", app.brand],
            ["Domain", app.domain],
            ["Storefront", app.frontendUrl],
            ["Environment", app.environment],
          ].map(([label, value]) => (
            <div key={label} className="spec-row">
              <dt className="label-caps text-silver">{label}</dt>
              <span className="spec-leader" />
              <dd className="break-all font-mono text-xs text-chrome">{value}</dd>
            </div>
          ))}
        </dl>
        <dl className="space-y-3 border border-steel bg-carbon p-5">
          {[
            ["Sends as", app.emailFrom],
            ["Support inbox", app.supportEmail],
            ["Admin inbox", app.adminEmail],
            [
              "Delivery window",
              `${app.deliveryWindowDays.min}–${app.deliveryWindowDays.max} days`,
            ],
            ["Update days", app.deliveryUpdateDays.join(", ")],
          ].map(([label, value]) => (
            <div key={label} className="spec-row">
              <dt className="label-caps text-silver">{label}</dt>
              <span className="spec-leader" />
              <dd className="break-all font-mono text-xs text-chrome">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Trust checklist — what is still a placeholder, and why it costs. */}
      {trust && (
        <>
          <h2 className="display mt-12 text-2xl">Trust checklist</h2>
          <p className="mt-1 font-mono text-xs text-on-surface-muted">
            A new domain scores badly on trust checkers, and the fix is real signals rather than
            clever ones. Anything below is currently omitted from the site&apos;s structured data —
            a fictional detail a checker follows and cannot find scores lower than nothing at all.
          </p>

          {trust.issues.length === 0 ? (
            <p className="mt-4 border border-signal-positive/40 bg-signal-positive/5 p-4 font-mono text-sm text-signal-positive">
              Nothing is a placeholder. Every detail is being published.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {trust.issues.map((issue) => (
                <div key={issue.field} className="border border-outline bg-surface-container p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="label-caps text-on-surface">{issue.field}</p>
                    <span
                      className={`label-caps ${
                        issue.severity === "high"
                          ? "text-error"
                          : issue.severity === "medium"
                            ? "text-signal-orange"
                            : "text-on-surface-muted"
                      }`}
                    >
                      {issue.severity}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-xs text-on-surface-muted">{issue.detail}</p>
                  <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{issue.whyItMatters}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="border border-error/40 bg-error/5 p-5">
              <p className="label-caps text-error">Never build these</p>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-on-surface-variant">
                {trust.neverBuild.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </div>
            <div className="border border-signal-positive/40 bg-signal-positive/5 p-5">
              <p className="label-caps text-signal-positive">What actually moves the number</p>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-on-surface-variant">
                {trust.whatHelps.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}

      {/* The stored logo, probed with the PDF writer's own decoder. */}
      {logo && (
        <div className="mt-4 border border-outline bg-surface-container p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="label-caps text-on-surface">Logo (as the spec sheets will read it)</p>
            <span className={`label-caps ${logo.status === "ok" ? "text-signal-positive" : logo.status === "not_saved" ? "text-on-surface-muted" : "text-error"}`}>
              {logo.status.replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{logo.message}</p>
          {logo.width && (
            <p className="mt-1 font-mono text-xs text-on-surface-muted">
              {logo.format} · {logo.width}×{logo.height}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 border border-crimson/40 bg-crimson/5 p-5">
        <p className="label-caps text-blush">Payment policy</p>
        <p className="mt-2 text-sm leading-relaxed text-chrome">
          Stripe webhooks are <strong>{app.stripeWebhooks ? "enabled" : "disabled by design"}</strong>.
          Nothing marks an order paid automatically — the storefront pulls the Checkout Session from
          Stripe when the buyer returns, and an admin confirms the payment in{" "}
          <span className="font-mono text-xs">/admin/orders</span>. Confirming is also what links the
          order to the buyer&apos;s account, or emails them an invitation to create one.
        </p>
      </div>
    </div>
  );
}
