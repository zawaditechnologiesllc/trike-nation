-- Go Cart Grip — manual payment approval, order notifications, guest-order
-- account linking, and the delivery-update cron. Run after 002_admin_payments.sql.
--
-- Lifecycle (no Stripe webhooks — an admin confirms every payment by hand):
--   pending_payment        customer created the order, has not returned from Stripe
--   awaiting_confirmation  customer came back from Stripe; waiting on admin review
--   paid                   an admin confirmed the money landed
--   processing → shipped → delivered
--   cancelled | refunded

-- ---------------------------------------------------------------------------
-- Orders: payment audit trail, fulfilment timestamps, cron bookkeeping
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists currency                 text not null default 'usd',
  add column if not exists stripe_session_id        text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id         text,
  add column if not exists stripe_reported_status   text,
  add column if not exists stripe_amount_total_cents int,
  add column if not exists stripe_checked_at        timestamptz,
  add column if not exists stripe_receipt_url       text,
  add column if not exists confirmed_by             uuid references auth.users(id) on delete set null,
  add column if not exists confirmed_by_email       text,
  add column if not exists paid_at                  timestamptz,
  add column if not exists processing_at            timestamptz,
  add column if not exists shipped_at               timestamptz,
  add column if not exists delivered_at             timestamptz,
  add column if not exists cancelled_at             timestamptz,
  add column if not exists refunded_at              timestamptz,
  add column if not exists refunded_cents           int,
  -- Milestones (in days since paid_at) already emailed, so the cron is idempotent.
  add column if not exists delivery_updates_sent    int[] not null default '{}',
  add column if not exists last_delivery_update_at  timestamptz,
  -- Guest orders: invite the buyer to create an account, then link it.
  add column if not exists account_invite_sent_at   timestamptz,
  add column if not exists account_linked_at        timestamptz,
  add column if not exists last_notified_at         timestamptz;

-- Normalise any legacy rows written before 002 set the new default.
update public.orders set status = 'pending_payment' where status = 'pending';

-- Statuses are validated in the API too; the constraint is the backstop.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (
  status in (
    'pending_payment', 'awaiting_confirmation', 'paid', 'processing',
    'shipped', 'delivered', 'cancelled', 'refunded'
  )
);

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check check (
  payment_status in ('unpaid', 'pending_review', 'paid', 'failed', 'refunded')
);

create index if not exists orders_email_idx        on public.orders (lower(email));
create index if not exists orders_paid_at_idx      on public.orders (paid_at desc);
create index if not exists orders_stripe_session_idx on public.orders (stripe_session_id);

-- Backfill: existing paid rows get a paid_at so the delivery cron can schedule them.
update public.orders set paid_at = coalesce(paid_at, created_at)
where payment_status = 'paid' and paid_at is null;

-- ---------------------------------------------------------------------------
-- Order events — the customer-visible timeline and the notification audit log
-- ---------------------------------------------------------------------------

create table if not exists public.order_events (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  -- status_change | payment_confirmed | delivery_update | account_invite |
  -- account_linked | note | refund
  type          text not null default 'status_change',
  from_status   text,
  to_status     text,
  message       text not null default '',
  notified      boolean not null default false,
  email_to      text,
  email_subject text,
  actor_id      uuid references auth.users(id) on delete set null,
  actor_email   text,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists order_events_order_id_idx on public.order_events (order_id, created_at desc);

-- ---------------------------------------------------------------------------
-- System state — cron heartbeats surfaced on /admin/system
-- ---------------------------------------------------------------------------

create table if not exists public.system_state (
  key        text primary key,
  value      jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.system_state enable row level security;
-- Backend-only (service role bypasses RLS): no anon/auth policies on purpose.

-- ---------------------------------------------------------------------------
-- Guest orders → accounts
-- Any order placed with an email address is adopted by the account created with
-- that same address, whether the account is created before or after the order.
-- ---------------------------------------------------------------------------

create or replace function public.link_guest_orders()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email is null then
    return new;
  end if;
  update public.orders
     set user_id = new.id,
         account_linked_at = now()
   where user_id is null
     and lower(email) = lower(new.email);
  return new;
end;
$$;

drop trigger if exists on_profile_created_link_orders on public.profiles;
create trigger on_profile_created_link_orders
  after insert on public.profiles
  for each row execute function public.link_guest_orders();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.order_events enable row level security;

-- Customers see an order if it is linked to them *or* it carries their email —
-- so a guest order shows up the moment they sign up, before the link lands.
drop policy if exists "read own orders" on public.orders;
create policy "read own orders" on public.orders
  for select using (
    auth.uid() = user_id
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "read own order items" on public.order_items;
create policy "read own order items" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.user_id = auth.uid()
          or lower(o.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

drop policy if exists "read own order events" on public.order_events;
create policy "read own order events" on public.order_events
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.user_id = auth.uid()
          or lower(o.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Product images are immutable once uploaded (the filename carries a
-- timestamp), so they are served with a one-year cache. The backend sets
-- cacheControl on upload; this keeps the bucket public for the CDN.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;
