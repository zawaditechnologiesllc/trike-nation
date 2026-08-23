-- Go Cart Grip — physical dimensions on products.
--
-- Run after 004_storefront_complete.sql.
--
-- EVERY statement here is safe to run twice. Migrations get re-applied by
-- accident — during a restore, on a second environment, by an admin who is not
-- sure whether it ran. A migration that fails the second time is a migration
-- nobody dares run at all.

-- ---------------------------------------------------------------------------
-- Products: width and length, as the seller wrote them
-- ---------------------------------------------------------------------------
--
-- Text, not numeric, and deliberately so. A product sheet is typed by hand and
-- says "48 in", "120cm" or plain "48". Storing a number means this migration
-- has to pick a unit for the bare case, and a spec sheet that states the wrong
-- size with confidence is worse than one that repeats the seller's own words.
-- The buyer is deciding whether the machine fits in a garage or through a
-- door; being visibly approximate beats being precisely wrong.

alter table public.products
  add column if not exists width  text,
  add column if not exists length text;

comment on column public.products.width  is
  'Overall width as written on the product sheet, unit included (e.g. "34 in").';
comment on column public.products.length is
  'Overall length as written on the product sheet, unit included (e.g. "60 in").';
