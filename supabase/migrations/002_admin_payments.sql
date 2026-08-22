-- Go Cart Grip — admin panel, site settings, payments, and messaging.
-- Run after 001_init.sql.

-- ---------------------------------------------------------------------------
-- Admin flag
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- ---------------------------------------------------------------------------
-- Editable site settings (hero section, contact details, announcements)
-- Single-row table; written by the backend with the service-role key.
-- ---------------------------------------------------------------------------

create table public.site_settings (
  id            int primary key default 1 check (id = 1),
  hero          jsonb not null default '{}',
  announcements jsonb not null default '[]',
  contact       jsonb not null default '{}',
  social        jsonb not null default '{}',
  updated_at    timestamptz not null default now()
);

alter table public.site_settings enable row level security;
create policy "site settings are public" on public.site_settings for select using (true);

-- ---------------------------------------------------------------------------
-- Contact form inbox
-- ---------------------------------------------------------------------------

create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  subject    text not null default '',
  message    text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;
-- No anon/auth policies on purpose: only the backend (service role) touches these.

-- ---------------------------------------------------------------------------
-- Payment + fulfilment fields on orders
-- status lifecycle: pending_payment -> paid -> processing -> shipped ->
--                   delivered | cancelled | refunded
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists payment_provider text,
  add column if not exists payment_status   text not null default 'unpaid',
  add column if not exists payment_ref      text,
  add column if not exists tracking_number  text,
  add column if not exists admin_notes      text;

alter table public.orders alter column status set default 'pending_payment';

create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

-- ---------------------------------------------------------------------------
-- Product image storage (public bucket; uploads go through the backend
-- with the service-role key, which bypasses storage RLS)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;
