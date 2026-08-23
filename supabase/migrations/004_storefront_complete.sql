-- Go Cart Grip — the full storefront schema: human order numbers, the
-- fulfilment stage engine, product colours and status, announcements,
-- articles, wishlists, settings, and the advisory fraud-review fields.
--
-- Run after 003_manual_approval.sql.
--
-- EVERY statement here is safe to run twice. Migrations get re-applied by
-- accident — during a restore, on a second environment, by an admin who is not
-- sure whether it ran. A migration that fails the second time is a migration
-- nobody dares run at all.

-- ---------------------------------------------------------------------------
-- Products: the fields the catalogue and the product sheet importer need
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists tagline         text not null default '',
  -- draft | active | archived. Archived keeps order history intact while
  -- removing the product from the shop; deleting would orphan past orders.
  add column if not exists status          text not null default 'active',
  add column if not exists is_new          boolean not null default false,
  add column if not exists badge           text,
  add column if not exists shipping_cents  int not null default 0,
  add column if not exists free_shipping   boolean not null default true,
  -- [{ "name": "Midnight Black", "hex": "#101010" }, …]
  add column if not exists colors          jsonb not null default '[]',
  -- True once an admin has edited the list by hand, so the backfill pass
  -- never overwrites a human decision with a parsed guess.
  add column if not exists colors_edited   boolean not null default false,
  add column if not exists attributes      jsonb not null default '{}',
  add column if not exists stock           int not null default 0,
  add column if not exists updated_at      timestamptz not null default now();

alter table public.products drop constraint if exists products_status_check;
alter table public.products add constraint products_status_check
  check (status in ('draft', 'active', 'archived'));

create index if not exists products_status_idx on public.products (status);
create index if not exists products_price_idx  on public.products (price_cents);

-- Existing rows predate `status`; in_stock was the only signal.
update public.products set status = 'active' where status is null;

alter table public.categories
  add column if not exists description text not null default '',
  add column if not exists position    int  not null default 0;

-- `sort_order` was the 001 name for the same idea. Copy it once, then both
-- names agree and either can be read.
update public.categories set position = sort_order where position = 0 and sort_order <> 0;

-- ---------------------------------------------------------------------------
-- Orders: human number, fulfilment stage, courier, and origin/risk
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists order_number          text,
  -- confirmed | building | shipped | arriving | delivered (see lib/core/stages)
  add column if not exists fulfillment_stage     text not null default 'confirmed',
  add column if not exists stage_updated_at      timestamptz,
  add column if not exists estimated_delivery_at timestamptz,
  add column if not exists courier               text,
  add column if not exists shipping_cents        int not null default 0,
  add column if not exists tax_cents             int not null default 0,
  -- Advisory only. NEVER used to refuse an order, and deliberately WITHOUT an
  -- ip_address column: most sensitive field, least useful for review.
  add column if not exists origin_country        text,
  add column if not exists origin_region         text,
  add column if not exists origin_city           text,
  add column if not exists origin_network        text,
  add column if not exists origin_timezone       text,
  add column if not exists origin_is_tor         boolean,
  add column if not exists origin_is_vpn         boolean,
  add column if not exists origin_is_datacenter  boolean,
  add column if not exists risk_level            text,
  add column if not exists risk_score            int,
  add column if not exists risk_flags            jsonb not null default '[]';

create unique index if not exists orders_order_number_key on public.orders (order_number)
  where order_number is not null;
create index if not exists orders_stage_idx on public.orders (fulfillment_stage);

-- Human order numbers: GCG-2026-0148. Allocation lives in the database so two
-- concurrent checkouts cannot be handed the same number.
create sequence if not exists public.order_number_seq;

create or replace function public.next_order_number()
returns text
language plpgsql
as $$
declare
  next_value bigint;
begin
  next_value := nextval('public.order_number_seq');
  return 'GCG-' || to_char(now(), 'YYYY') || '-' || lpad(next_value::text, 4, '0');
end;
$$;

create or replace function public.set_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is null then
    new.order_number := public.next_order_number();
  end if;
  return new;
end;
$$;

drop trigger if exists orders_set_order_number on public.orders;
create trigger orders_set_order_number
  before insert on public.orders
  for each row execute function public.set_order_number();

-- Backfill: existing orders get numbers in the order they were placed.
do $$
declare
  row_record record;
begin
  for row_record in
    select id from public.orders where order_number is null order by created_at
  loop
    update public.orders
       set order_number = public.next_order_number()
     where id = row_record.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- order_events: the idempotency lock
--
-- "Did we already send this?" is answered by a UNIQUE constraint, never by a
-- SELECT followed by an INSERT — two cron runs overlapping is exactly when
-- that race fires, and the symptom is a customer getting the same email twice.
-- Claiming a step IS the insert; error 23505 means someone else claimed it.
-- ---------------------------------------------------------------------------

alter table public.order_events
  add column if not exists stage      text,
  add column if not exists title      text not null default '',
  add column if not exists email_sent boolean not null default false;

-- Existing rows have no stage; give them a unique one so the index can be
-- created without collapsing genuine history.
update public.order_events
   set stage = coalesce(stage, 'legacy:' || id::text)
 where stage is null;

alter table public.order_events alter column stage set not null;

create unique index if not exists order_events_order_stage_key
  on public.order_events (order_id, stage);

-- ---------------------------------------------------------------------------
-- Announcements — the scrolling stripe, admin-authored and scheduled
-- ---------------------------------------------------------------------------

create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  href       text,
  active     boolean not null default true,
  starts_at  timestamptz,
  ends_at    timestamptz,
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists announcements_active_idx on public.announcements (active, position);

alter table public.announcements enable row level security;
drop policy if exists "announcements are public" on public.announcements;
create policy "announcements are public" on public.announcements for select using (true);

-- ---------------------------------------------------------------------------
-- Articles — build guides and news, for a new domain with no inbound links
-- ---------------------------------------------------------------------------

create table if not exists public.articles (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  excerpt      text not null default '',
  body         text not null default '',
  cover_url    text,
  published    boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists articles_published_idx on public.articles (published, published_at desc);

alter table public.articles enable row level security;
drop policy if exists "published articles are public" on public.articles;
create policy "published articles are public" on public.articles
  for select using (published = true);

-- ---------------------------------------------------------------------------
-- Wishlists
-- ---------------------------------------------------------------------------

create table if not exists public.wishlists (
  user_id    uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

alter table public.wishlists enable row level security;
drop policy if exists "read own wishlist"   on public.wishlists;
drop policy if exists "insert own wishlist" on public.wishlists;
drop policy if exists "delete own wishlist" on public.wishlists;
create policy "read own wishlist"   on public.wishlists for select using (auth.uid() = user_id);
create policy "insert own wishlist" on public.wishlists for insert with check (auth.uid() = user_id);
create policy "delete own wishlist" on public.wishlists for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Site settings — the single source the footer AND the structured data read,
-- so the business name, address and phone can never disagree across the site.
-- ---------------------------------------------------------------------------

alter table public.site_settings
  add column if not exists legal_name           text not null default '',
  add column if not exists logo_url             text,
  add column if not exists default_shipping_cents int not null default 0,
  add column if not exists tax_rate_bps         int not null default 0,
  add column if not exists free_shipping        boolean not null default true;

-- ---------------------------------------------------------------------------
-- Order items: colour is part of the line identity — the same product in two
-- colours is two lines, and the colour has to reach the email and the PDF.
-- ---------------------------------------------------------------------------

alter table public.order_items
  add column if not exists color     text,
  add column if not exists image_url text;

-- ---------------------------------------------------------------------------
-- Contact messages: replied_at, so the inbox can show what still needs a reply
-- ---------------------------------------------------------------------------

alter table public.contact_messages
  add column if not exists replied_at timestamptz;
