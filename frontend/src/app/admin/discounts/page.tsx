"use client";

import { useEffect, useState } from "react";
import { adminFetch, type AdminDiscount } from "@/lib/admin";

export default function AdminDiscountsPage() {
  const [codes, setCodes] = useState<AdminDiscount[] | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newPct, setNewPct] = useState("10");
  const [error, setError] = useState("");

  function load() {
    adminFetch<AdminDiscount[]>("/discounts").then(setCodes).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await adminFetch("/discounts", {
        method: "POST",
        body: JSON.stringify({ code: newCode, percentOff: Number(newPct) }),
      });
      setNewCode("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function toggle(code: AdminDiscount) {
    await adminFetch(`/discounts/${code.code}`, { method: "PATCH", body: JSON.stringify({ active: !code.active }) });
    load();
  }

  async function remove(code: AdminDiscount) {
    if (!window.confirm(`Delete code ${code.code}?`)) return;
    await adminFetch(`/discounts/${code.code}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1 className="display text-3xl md:text-4xl">Discount Codes</h1>

      <form onSubmit={create} className="mt-8 flex flex-wrap items-end gap-4 border border-steel bg-carbon p-5">
        <label className="block">
          <span className="label-caps text-silver">Code</span>
          <input required className="input-tech mt-2 uppercase" placeholder="SUMMER20" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
        </label>
        <label className="block">
          <span className="label-caps text-silver">% Off</span>
          <input required type="number" min="1" max="100" className="input-tech mt-2 w-24" value={newPct} onChange={(e) => setNewPct(e.target.value)} />
        </label>
        <button type="submit" className="display glow-red bg-crimson px-6 py-3 text-offwhite hover:bg-ember">
          Create Code
        </button>
      </form>
      {error && <p className="mt-4 font-mono text-sm text-ember">{error}</p>}

      <div className="mt-6 space-y-3">
        {codes?.map((code) => (
          <div key={code.code} className="flex flex-wrap items-center gap-4 border border-steel bg-carbon p-4">
            <span className="border-2 border-dashed border-crimson px-3 py-1 font-mono text-sm font-bold tracking-widest text-blush">
              {code.code}
            </span>
            <span className="font-mono text-sm text-chrome">{code.percent_off}% off</span>
            <span className={`label-caps ${code.active ? "text-success" : "text-silver"}`}>
              {code.active ? "Active" : "Disabled"}
            </span>
            <div className="ml-auto flex gap-4">
              <button onClick={() => toggle(code)} className="label-caps text-ember hover:text-blush">
                {code.active ? "Disable" : "Enable"}
              </button>
              <button onClick={() => remove(code)} className="label-caps text-silver hover:text-ember">
                Delete
              </button>
            </div>
          </div>
        ))}
        {codes && codes.length === 0 && <p className="font-mono text-sm text-silver">No discount codes yet.</p>}
      </div>
    </div>
  );
}
