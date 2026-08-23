-- Promote a user to admin on Go Cart Grip.
--
-- The user must have signed up at https://gocartgrip.shop/signup first
-- (email + password), so a profiles row exists to update. Running this for an
-- address that has never signed up updates nothing and reports 0 rows — that
-- is the usual reason "it did not work".
--
-- Replace the address on the next line with the one that signed up.

update public.profiles
set is_admin = true
where email = 'admin@gocartgrip.shop';

-- Should list every admin, including the one just promoted.
select id, email, is_admin from public.profiles where is_admin;
