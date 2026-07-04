-- Promote a user to admin. The user must have signed up first
-- (email/password) so a profile row exists. Replace the email below.

update public.profiles
set is_admin = true
where email = 'you@example.com';

select id, email, is_admin from public.profiles where is_admin;
