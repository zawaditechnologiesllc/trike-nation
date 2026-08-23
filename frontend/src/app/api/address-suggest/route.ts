import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { sanitiseSearch } from "@/shared/core/validation";

/**
 * Address autocomplete, proxied.
 *
 * The provider key stays on the server — a key shipped to the browser is a key
 * anyone can lift and bill to us. The browser only ever talks to this route.
 *
 * Degrades to an empty list rather than an error: autocomplete is a
 * convenience, and a broken one must not stop somebody checking out.
 */
export const dynamic = "force-dynamic";

interface Suggestion {
  label: string;
  address: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = sanitiseSearch(url.searchParams.get("q"));
  const country = (url.searchParams.get("country") ?? "").slice(0, 2).toUpperCase();

  if (query.length < 3) return NextResponse.json({ suggestions: [] });

  const key = serverEnv("MAPS_API_KEY");
  if (!key) {
    // Not configured is not an error: the field stays a plain text input.
    return NextResponse.json({ suggestions: [], configured: false });
  }

  try {
    const endpoint = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
    endpoint.searchParams.set("text", query);
    endpoint.searchParams.set("format", "json");
    endpoint.searchParams.set("limit", "5");
    if (country) endpoint.searchParams.set("filter", `countrycode:${country.toLowerCase()}`);
    endpoint.searchParams.set("apiKey", key);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return NextResponse.json({ suggestions: [] });

    const data = (await res.json()) as {
      results?: {
        formatted?: string;
        address_line1?: string;
        city?: string;
        state?: string;
        county?: string;
        postcode?: string;
        country_code?: string;
      }[];
    };

    const suggestions: Suggestion[] = (data.results ?? []).map((r) => ({
      label: r.formatted ?? "",
      address: r.address_line1 ?? "",
      city: r.city ?? "",
      region: r.state ?? r.county ?? "",
      postalCode: r.postcode ?? "",
      country: (r.country_code ?? "").toUpperCase(),
    }));

    return NextResponse.json({ suggestions, configured: true });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
