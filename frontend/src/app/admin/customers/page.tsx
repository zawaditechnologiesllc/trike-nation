"use client";

import { useEffect, useState } from "react";
import { adminFetch, type AdminCustomer } from "@/lib/admin";
import { money } from "@/lib/format";

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomer[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch<AdminCustomer[]>("/customers").then(setCustomers).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <h1 className="display text-3xl md:text-4xl">Customers</h1>
      {error && <p className="mt-6 font-mono text-sm text-ember">{error}</p>}
      {!customers && !error && <p className="label-caps mt-6 text-silver">Loading customers…</p>}
      {customers && (
        <div className="mt-6 overflow-x-auto border border-steel">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-coal">
              <tr>
                {["Email", "Name", "Joined", "Orders", "Lifetime Spend", "Role"].map((h) => (
                  <th key={h} className="label-caps px-4 py-3 text-silver">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-steel/60 bg-carbon">
                  <td className="px-4 py-3 text-chrome">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-silver">
                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-silver">
                    {new Date(c.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
                  </td>
                  <td className="px-4 py-3 font-mono">{c.orders}</td>
                  <td className="px-4 py-3 font-mono font-bold text-ember">{money(c.spent_cents)}</td>
                  <td className={`label-caps px-4 py-3 ${c.is_admin ? "text-ember" : "text-silver"}`}>
                    {c.is_admin ? "Admin" : "Customer"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {customers.length === 0 && <p className="p-6 font-mono text-sm text-silver">No registered customers yet.</p>}
        </div>
      )}
    </div>
  );
}
