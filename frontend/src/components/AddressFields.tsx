"use client";

import { useEffect, useRef, useState } from "react";
import { addressVocabulary, countryOptions } from "@/shared/core/countries";
import type { AddressInput, FieldError } from "@/shared/core/validation";

/**
 * Country FIRST, then everything that depends on it.
 *
 * The labels and the validation both come from the country, so a customer in
 * Manchester is asked for a County and a Postcode rather than a State and a
 * ZIP. A form that gets that wrong reads as a shop that does not really ship
 * there.
 */

interface Suggestion {
  label: string;
  address: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export default function AddressFields({
  value,
  onChange,
  errors,
}: {
  value: AddressInput;
  onChange: (next: AddressInput) => void;
  errors: FieldError[];
}) {
  const { pinned, rest } = countryOptions();
  const vocabulary = addressVocabulary(value.country);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const errorFor = (field: keyof AddressInput) => errors.find((e) => e.field === field)?.message;
  const set = (field: keyof AddressInput) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [field]: event.target.value });

  // Autocomplete goes through our own route, so the provider key never
  // reaches the browser.
  useEffect(() => {
    const query = value.address ?? "";
    if (query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, country: value.country ?? "" });
        const res = await fetch(`/api/address-suggest?${params}`);
        const data = (await res.json()) as { suggestions?: Suggestion[] };
        setSuggestions(data.suggestions ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 350);
    return () => clearTimeout(debounce.current);
  }, [value.address, value.country]);

  function applySuggestion(suggestion: Suggestion) {
    onChange({
      ...value,
      address: suggestion.address || suggestion.label,
      city: suggestion.city || value.city,
      region: suggestion.region || value.region,
      postalCode: suggestion.postalCode || value.postalCode,
      country: suggestion.country || value.country,
    });
    setShowSuggestions(false);
  }

  const fieldClass = (field: keyof AddressInput) =>
    `input-tech mt-2 ${errorFor(field) ? "border-error" : ""}`;

  const Error = ({ field }: { field: keyof AddressInput }) => {
    const message = errorFor(field);
    return message ? <span className="mt-1 block font-mono text-xs text-error">{message}</span> : null;
  };

  return (
    <div className="mt-6 grid gap-6 sm:grid-cols-2">
      {/* Country first: it decides the labels and the rules below. */}
      <label className="block sm:col-span-2">
        <span className="label-caps text-on-surface-muted">Delivery Country</span>
        <select required className={fieldClass("country")} value={value.country ?? ""} onChange={set("country")}>
          <option value="">Choose a country…</option>
          <optgroup label="Popular destinations">
            {pinned.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="All countries">
            {rest.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </optgroup>
        </select>
        <Error field="country" />
      </label>

      <label className="block">
        <span className="label-caps text-on-surface-muted">First Name</span>
        <input required className={fieldClass("firstName")} placeholder="e.g. John" value={value.firstName ?? ""} onChange={set("firstName")} />
        <Error field="firstName" />
      </label>
      <label className="block">
        <span className="label-caps text-on-surface-muted">Last Name</span>
        <input required className={fieldClass("lastName")} placeholder="e.g. Doe" value={value.lastName ?? ""} onChange={set("lastName")} />
        <Error field="lastName" />
      </label>

      <label className="relative block sm:col-span-2">
        <span className="label-caps text-on-surface-muted">Street Address</span>
        <input
          required
          className={fieldClass("address")}
          placeholder="House number and street name"
          value={value.address ?? ""}
          onChange={(e) => {
            set("address")(e);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          autoComplete="street-address"
        />
        <Error field="address" />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full border border-outline-variant bg-surface-container-high">
            {suggestions.map((suggestion) => (
              <li key={suggestion.label}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applySuggestion(suggestion)}
                  className="block w-full px-4 py-3 text-left font-mono text-xs text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
                >
                  {suggestion.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </label>

      <label className="block sm:col-span-2">
        <span className="label-caps text-on-surface-muted">Apartment, suite, etc. (optional)</span>
        <input className="input-tech mt-2" value={value.address2 ?? ""} onChange={set("address2")} />
      </label>

      <label className="block">
        <span className="label-caps text-on-surface-muted">City</span>
        <input required className={fieldClass("city")} placeholder="City" value={value.city ?? ""} onChange={set("city")} autoComplete="address-level2" />
        <Error field="city" />
      </label>

      <label className="block">
        <span className="label-caps text-on-surface-muted">
          {vocabulary.regionLabel}
          {!vocabulary.regionRequired && <span className="text-on-surface-muted"> (optional)</span>}
        </span>
        <input
          required={vocabulary.regionRequired}
          className={fieldClass("region")}
          value={value.region ?? ""}
          onChange={set("region")}
          autoComplete="address-level1"
        />
        <Error field="region" />
      </label>

      <label className="block">
        <span className="label-caps text-on-surface-muted">{vocabulary.postalLabel}</span>
        <input
          required
          className={fieldClass("postalCode")}
          placeholder={vocabulary.postalExample ?? ""}
          value={value.postalCode ?? ""}
          onChange={set("postalCode")}
          autoComplete="postal-code"
        />
        <Error field="postalCode" />
      </label>

      <label className="block">
        <span className="label-caps text-on-surface-muted">Phone Number</span>
        <input required className={fieldClass("phone")} placeholder="+1 (000) 000-0000" value={value.phone ?? ""} onChange={set("phone")} autoComplete="tel" />
        <Error field="phone" />
      </label>

      <label className="block sm:col-span-2">
        <span className="label-caps text-on-surface-muted">Email</span>
        <input required type="email" className={fieldClass("email")} placeholder="you@example.com" value={value.email ?? ""} onChange={set("email")} autoComplete="email" />
        <Error field="email" />
      </label>
    </div>
  );
}
