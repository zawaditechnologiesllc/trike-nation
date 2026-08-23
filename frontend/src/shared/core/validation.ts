/**
 * ONE address validation module, used by the browser form and by the server
 * route that creates the order.
 *
 * The browser check is a courtesy — it stops a round trip. The server check
 * decides. Two separate implementations drift, and the drift always surfaces
 * as "the form said it was fine and the order failed".
 *
 * Errors carry the field name so the form can highlight the offending input
 * rather than printing a sentence above a form of eight identical boxes.
 */

import { addressVocabulary, isKnownCountry } from "./countries";

export interface AddressInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  address2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

export interface FieldError {
  field: keyof AddressInput;
  message: string;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
// Deliberately loose: international numbers vary wildly and a strict pattern
// rejects real customers. We only insist it could be dialled.
const PHONE = /^[+()\d][\d\s().-]{5,24}$/;

const trim = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export function validateAddress(input: AddressInput): FieldError[] {
  const errors: FieldError[] = [];
  const country = trim(input.country).toUpperCase();

  // Country first: everything below depends on it.
  if (!country) {
    errors.push({ field: "country", message: "Choose a delivery country." });
  } else if (!isKnownCountry(country)) {
    errors.push({ field: "country", message: "That country code is not one we recognise." });
  }

  const vocabulary = addressVocabulary(country);

  if (!trim(input.firstName)) errors.push({ field: "firstName", message: "First name is required." });
  if (!trim(input.lastName)) errors.push({ field: "lastName", message: "Last name is required." });

  const email = trim(input.email);
  if (!email) errors.push({ field: "email", message: "Email address is required." });
  else if (!EMAIL.test(email)) errors.push({ field: "email", message: "That email address does not look right." });

  const phone = trim(input.phone);
  if (!phone) errors.push({ field: "phone", message: "Phone number is required — couriers call before a freight delivery." });
  else if (!PHONE.test(phone)) errors.push({ field: "phone", message: "That phone number does not look right." });

  if (!trim(input.address)) errors.push({ field: "address", message: "Street address is required." });
  if (!trim(input.city)) errors.push({ field: "city", message: "City is required." });

  if (vocabulary.regionRequired && !trim(input.region)) {
    errors.push({ field: "region", message: `${vocabulary.regionLabel} is required.` });
  }

  const postal = trim(input.postalCode);
  if (!postal) {
    errors.push({ field: "postalCode", message: `${vocabulary.postalLabel} is required.` });
  } else if (vocabulary.postalPattern && !vocabulary.postalPattern.test(postal)) {
    errors.push({
      field: "postalCode",
      message: vocabulary.postalExample
        ? `That ${vocabulary.postalLabel.toLowerCase()} does not look right — e.g. ${vocabulary.postalExample}.`
        : `That ${vocabulary.postalLabel.toLowerCase()} does not look right.`,
    });
  }

  return errors;
}

export function isValidAddress(input: AddressInput): boolean {
  return validateAddress(input).length === 0;
}

/** Normalised shape stored on the order. */
export function normaliseAddress(input: AddressInput) {
  return {
    firstName: trim(input.firstName),
    lastName: trim(input.lastName),
    email: trim(input.email).toLowerCase(),
    phone: trim(input.phone),
    address: trim(input.address),
    address2: trim(input.address2),
    city: trim(input.city),
    region: trim(input.region),
    postalCode: trim(input.postalCode),
    country: trim(input.country).toUpperCase(),
  };
}

/** Search input sanitiser — strips PostgREST/ILIKE metacharacters. */
export function sanitiseSearch(raw: string | null | undefined): string {
  return trim(raw).replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}
