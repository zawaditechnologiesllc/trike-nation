-- Trike Nation — initial schema.
-- Run in the Supabase SQL editor (or `supabase db push`) before seed.sql.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table public.categories (
  slug        text primary key,
  name        text not null,
  tagline     text not null default '',
  badge       text,
  count       int  not null default 0,
  image       text not null default '',
  sort_order  int  not null default 0
);

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  category_slug    text not null references public.categories(slug),
  price_cents      int  not null check (price_cents >= 0),
  compare_at_cents int  check (compare_at_cents >= 0),
  badges           jsonb not null default '[]',
  blurb            text not null default '',
  description      text not null default '',
  engine_size      text not null default 'N/A',
  specs            jsonb not null default '[]',
  box_contents     jsonb not null default '[]',
  features         jsonb not null default '[]',
  image            text not null default '',
  featured         boolean not null default false,
  in_stock         boolean not null default true,
  created_at       timestamptz not null default now()
);

create table public.testimonials (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  initials   text not null,
  role       text not null default 'Verified Buyer',
  quote      text not null,
  rating     int  not null default 5 check (rating between 1 and 5),
  sort_order int  not null default 0
);

create table public.discount_codes (
  code        text primary key,
  percent_off int  not null check (percent_off between 1 and 100),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.newsletter_subscribers (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles (mirrors auth.users; email/password auth only)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  first_name text,
  last_name  text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Orders (written by the Render backend with the service-role key)
-- ---------------------------------------------------------------------------

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete set null,
  email          text not null,
  shipping       jsonb not null,
  subtotal_cents int  not null,
  discount_cents int  not null default 0,
  total_cents    int  not null,
  discount_code  text,
  status         text not null default 'pending',
  created_at     timestamptz not null default now()
);

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  product_id       uuid references public.products(id) on delete set null,
  product_slug     text not null,
  product_name     text not null,
  unit_price_cents int  not null,
  qty              int  not null check (qty > 0)
);

create index orders_user_id_idx on public.orders(user_id);
create index order_items_order_id_idx on public.order_items(order_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.categories             enable row level security;
alter table public.products               enable row level security;
alter table public.testimonials           enable row level security;
alter table public.discount_codes         enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.profiles               enable row level security;
alter table public.orders                 enable row level security;
alter table public.order_items            enable row level security;

-- Catalog is publicly readable.
create policy "categories are public"   on public.categories   for select using (true);
create policy "products are public"     on public.products     for select using (true);
create policy "testimonials are public" on public.testimonials for select using (true);

-- Discount codes and newsletter emails are only touched by the backend
-- (service role bypasses RLS) — no anon policies on purpose.

-- Users can see and edit their own profile.
create policy "read own profile"   on public.profiles for select using (auth.uid() = id);
create policy "update own profile" on public.profiles for update using (auth.uid() = id);

-- Users can read their own orders + items. Inserts happen via service role.
create policy "read own orders" on public.orders
  for select using (auth.uid() = user_id);
create policy "read own order items" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );
