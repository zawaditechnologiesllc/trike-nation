export interface Category {
  slug: string;
  name: string;
  tagline: string;
  badge?: string;
  count: number;
  image: string;
}

export interface ProductFeature {
  title: string;
  text: string;
}

export interface Product {
  id?: string;
  slug: string;
  name: string;
  category: string; // category slug
  priceCents: number;
  compareAtCents?: number;
  badges: string[];
  blurb: string;
  description: string;
  engineSize: "200CC" | "212CC" | "400CC" | "ELECTRIC" | "N/A";
  specs: { label: string; value: string }[];
  boxContents: string[];
  features: ProductFeature[];
  image: string;
  featured: boolean;
  inStock: boolean;
}

export interface Testimonial {
  name: string;
  initials: string;
  role: string;
  quote: string;
  rating: number;
}

export interface CartItem {
  slug: string;
  name: string;
  priceCents: number;
  image: string;
  qty: number;
}

export interface ShippingInfo {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  zip: string;
  phone: string;
  email: string;
}

export interface OrderLineItem {
  name: string;
  slug?: string;
  qty: number;
  unitCents: number;
}

export interface OrderTimelineEntry {
  type: string;
  status?: string | null;
  message: string;
  at: string;
}

export interface OrderSummary {
  id: string;
  status: string;
  paymentStatus?: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  discountCode?: string;
  trackingNumber?: string;
  createdAt?: string;
  paidAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  /** Whether the order is already attached to an account. */
  hasAccount?: boolean;
  /** Masked buyer address, e.g. j****@example.com. */
  emailHint?: string;
  items?: OrderLineItem[];
  timeline?: OrderTimelineEntry[];
  redirectUrl?: string;
}

export interface AccountOrder extends OrderSummary {
  items: OrderLineItem[];
}

/** Stripe is the only provider — payments are confirmed manually by an admin. */
export type PaymentProvider = "stripe";

export interface PaymentsConfig {
  stripe: boolean;
  publishableKey?: string | null;
  currency?: string;
  manualApproval?: boolean;
  deliveryDays?: { min: number; max: number };
}

export interface SiteSettings {
  hero: {
    kicker: string;
    title: string;
    accent: string;
    subtitle: string;
    primaryLabel: string;
    primaryHref: string;
    secondaryLabel: string;
    secondaryHref: string;
  };
  announcements: string[];
  contact: {
    phone: string;
    email: string;
    address: string;
    hours: string;
  };
  social: {
    facebook: string;
    instagram: string;
    threads: string;
  };
}
