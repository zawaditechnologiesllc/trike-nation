"use client";

import { useEffect, useState } from "react";
import { adminFetch, type AdminTestimonial } from "@/lib/admin";
import Stars from "@/components/Stars";

export default function AdminTestimonialsPage() {
  const [items, setItems] = useState<AdminTestimonial[] | null>(null);
  const [form, setForm] = useState({ name: "", role: "Verified Buyer", quote: "", rating: "5" });
  const [error, setError] = useState("");

  function load() {
    adminFetch<AdminTestimonial[]>("/testimonials").then(setItems).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await adminFetch("/testimonials", {
        method: "POST",
        body: JSON.stringify({ ...form, rating: Number(form.rating) }),
      });
      setForm({ name: "", role: "Verified Buyer", quote: "", rating: "5" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function remove(item: AdminTestimonial) {
    if (!window.confirm(`Delete testimonial from ${item.name}?`)) return;
    await adminFetch(`/testimonials/${item.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1 className="display text-3xl md:text-4xl">Testimonials</h1>

      <form onSubmit={create} className="mt-8 grid gap-4 border border-steel bg-carbon p-5 sm:grid-cols-2">
        <label className="block">
          <span className="label-caps text-silver">Name</span>
          <input required className="input-tech mt-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="block">
          <span className="label-caps text-silver">Role</span>
          <input className="input-tech mt-2" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
        </label>
        <label className="block sm:col-span-2">
          <span className="label-caps text-silver">Quote</span>
          <textarea required rows={3} className="input-tech mt-2 resize-y" value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })} />
        </label>
        <label className="block">
          <span className="label-caps text-silver">Rating (1–5)</span>
          <input type="number" min="1" max="5" className="input-tech mt-2 w-24" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} />
        </label>
        <div className="flex items-end">
          <button type="submit" className="display glow-red bg-crimson px-6 py-3 text-offwhite hover:bg-ember">
            Add Testimonial
          </button>
        </div>
      </form>
      {error && <p className="mt-4 font-mono text-sm text-ember">{error}</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {items?.map((item) => (
          <figure key={item.id} className="border border-steel bg-carbon p-5">
            <Stars rating={item.rating} />
            <blockquote className="mt-3 text-sm italic text-chrome">&ldquo;{item.quote}&rdquo;</blockquote>
            <figcaption className="mt-4 flex items-center justify-between">
              <span className="label-caps text-offwhite">
                {item.name} <span className="text-silver">· {item.role}</span>
              </span>
              <button onClick={() => remove(item)} className="label-caps text-silver hover:text-ember">
                Delete
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
