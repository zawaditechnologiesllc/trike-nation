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

export interface OrderSummary {
  id: string;
  status: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  discountCode?: string;
  demo?: boolean;
}
