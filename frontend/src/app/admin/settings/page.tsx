"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin";
import type { SiteSettings } from "@/lib/types";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [announcements, setAnnouncements] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    adminFetch<SiteSettings>("/settings")
      .then((data) => {
        setSettings(data);
        setAnnouncements(data.announcements.join("\n"));
      })
      .catch((e) => setFeedback({ ok: false, text: e.message }));
  }, []);

  function patchHero(fields: Partial<SiteSettings["hero"]>) {
    setSettings((s) => (s ? { ...s, hero: { ...s.hero, ...fields } } : s));
  }
  function patchContact(fields: Partial<SiteSettings["contact"]>) {
    setSettings((s) => (s ? { ...s, contact: { ...s.contact, ...fields } } : s));
  }
  function patchSocial(fields: Partial<SiteSettings["social"]>) {
    setSettings((s) => (s ? { ...s, social: { ...s.social, ...fields } } : s));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setFeedback(null);
    try {
      await adminFetch("/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...settings,
          announcements: announcements.split("\n").map((a) => a.trim()).filter(Boolean),
        }),
      });
      setFeedback({ ok: true, text: "Saved. Storefront pages refresh within ~2 minutes (cache)." });
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return feedback ? (
      <p className="font-mono text-sm text-ember">{feedback.text}</p>
    ) : (
      <p className="label-caps text-silver">Loading settings…</p>
    );
  }

  return (
    <form onSubmit={save}>
      <h1 className="display text-3xl md:text-4xl">Site Settings</h1>

      <div className="mt-8 space-y-8">
        {/* Hero */}
        <fieldset className="border border-steel bg-carbon p-6">
          <legend className="display border-l-4 border-crimson px-3 text-xl">Homepage Hero</legend>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="label-caps text-silver">Kicker (small line above title)</span>
              <input className="input-tech mt-2" value={settings.hero.kicker} onChange={(e) => patchHero({ kicker: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label-caps text-silver">Title</span>
                <input className="input-tech mt-2" value={settings.hero.title} onChange={(e) => patchHero({ title: e.target.value })} />
              </label>
              <label className="block">
                <span className="label-caps text-silver">Accent (red)</span>
                <input className="input-tech mt-2" value={settings.hero.accent} onChange={(e) => patchHero({ accent: e.target.value })} />
              </label>
            </div>
            <label className="block sm:col-span-2">
              <span className="label-caps text-silver">Subtitle</span>
              <textarea rows={2} className="input-tech mt-2 resize-y" value={settings.hero.subtitle} onChange={(e) => patchHero({ subtitle: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label-caps text-silver">Primary Button</span>
                <input className="input-tech mt-2" value={settings.hero.primaryLabel} onChange={(e) => patchHero({ primaryLabel: e.target.value })} />
              </label>
              <label className="block">
                <span className="label-caps text-silver">Link</span>
                <input className="input-tech mt-2" value={settings.hero.primaryHref} onChange={(e) => patchHero({ primaryHref: e.target.value })} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label-caps text-silver">Secondary Button</span>
                <input className="input-tech mt-2" value={settings.hero.secondaryLabel} onChange={(e) => patchHero({ secondaryLabel: e.target.value })} />
              </label>
              <label className="block">
                <span className="label-caps text-silver">Link</span>
                <input className="input-tech mt-2" value={settings.hero.secondaryHref} onChange={(e) => patchHero({ secondaryHref: e.target.value })} />
              </label>
            </div>
          </div>
          <div className="dotted-panel mt-6 border border-steel p-6">
            <p className="label-caps text-blush">{settings.hero.kicker}</p>
            <p className="display mt-2 text-3xl">
              {settings.hero.title} <span className="text-ember">{settings.hero.accent}</span>
            </p>
            <p className="mt-2 max-w-lg text-sm text-silver">{settings.hero.subtitle}</p>
          </div>
        </fieldset>

        {/* Announcements */}
        <fieldset className="border border-steel bg-carbon p-6">
          <legend className="display border-l-4 border-crimson px-3 text-xl">Announcement Ticker</legend>
          <label className="mt-4 block">
            <span className="label-caps text-silver">One announcement per line (scrolls on the homepage)</span>
            <textarea rows={3} className="input-tech mt-2 resize-y" value={announcements} onChange={(e) => setAnnouncements(e.target.value)} />
          </label>
        </fieldset>

        {/* Contact */}
        <fieldset className="border border-steel bg-carbon p-6">
          <legend className="display border-l-4 border-crimson px-3 text-xl">Contact Details</legend>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="label-caps text-silver">Phone</span>
              <input className="input-tech mt-2" value={settings.contact.phone} onChange={(e) => patchContact({ phone: e.target.value })} />
            </label>
            <label className="block">
              <span className="label-caps text-silver">Support Email</span>
              <input className="input-tech mt-2" value={settings.contact.email} onChange={(e) => patchContact({ email: e.target.value })} />
            </label>
            <label className="block">
              <span className="label-caps text-silver">Address</span>
              <input className="input-tech mt-2" value={settings.contact.address} onChange={(e) => patchContact({ address: e.target.value })} />
            </label>
            <label className="block">
              <span className="label-caps text-silver">Hours</span>
              <input className="input-tech mt-2" value={settings.contact.hours} onChange={(e) => patchContact({ hours: e.target.value })} />
            </label>
          </div>
        </fieldset>

        {/* Social */}
        <fieldset className="border border-steel bg-carbon p-6">
          <legend className="display border-l-4 border-crimson px-3 text-xl">Social Links</legend>
          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            <label className="block">
              <span className="label-caps text-silver">Facebook</span>
              <input className="input-tech mt-2" value={settings.social.facebook} onChange={(e) => patchSocial({ facebook: e.target.value })} />
            </label>
            <label className="block">
              <span className="label-caps text-silver">Instagram</span>
              <input className="input-tech mt-2" value={settings.social.instagram} onChange={(e) => patchSocial({ instagram: e.target.value })} />
            </label>
            <label className="block">
              <span className="label-caps text-silver">Threads</span>
              <input className="input-tech mt-2" value={settings.social.threads} onChange={(e) => patchSocial({ threads: e.target.value })} />
            </label>
          </div>
        </fieldset>

        {feedback && (
          <p className={`font-mono text-sm ${feedback.ok ? "text-success" : "text-ember"}`}>{feedback.text}</p>
        )}
        <button type="submit" disabled={saving} className="display glow-red bg-crimson px-10 py-3 text-lg text-offwhite hover:bg-ember disabled:opacity-50">
          {saving ? "Saving…" : "Save All Settings"}
        </button>
      </div>
    </form>
  );
}
