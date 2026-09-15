/*
# Demo account seed

Run this ONCE against a fresh project, after the two schema migrations and
the security-hardening migration have been applied, to create the four demo
accounts referenced by src/data/mockUsers.tsx.

IMPORTANT — this only works against a project where you have direct SQL
access to the `auth` schema (e.g. local Supabase via `supabase db reset`, or
the SQL editor on a project you own with sufficient privileges). Hosted
Supabase projects generally expect you to create users via the Auth Admin
API (`supabase.auth.admin.createUser`) or the Dashboard's
Authentication > Users > "Add user" screen instead — the direct-insert
approach below is a common local-dev convenience, not a guaranteed-portable
technique. If it fails on your project, create the four users via the
Dashboard with these emails/passwords, then run just the second half of this
script (the `UPDATE profiles ...` statements) to assign roles, since
`handle_new_auth_user()` will already have created default 'analyst'
profile rows for them.

Passwords are for local/demo use only — rotate them (or better, delete these
accounts) before using this schema for anything real.

Note: MFA is real Supabase TOTP now (see AuthContext.tsx / Mfa.tsx). The
first time you log in as the admin demo account, the app will walk you
through enrolling a TOTP factor (scan the QR code with any authenticator
app) — there is no seed step for this, it happens interactively on login.
*/

-- Create the four demo users directly in auth.users (local/dev only — see
-- note above). Supabase Auth requires the password to already be hashed
-- with bcrypt via crypt(); the pgcrypto extension provides that.
create extension if not exists pgcrypto;

do $$
declare
  v_id uuid;
begin
  -- Admin
  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'admin@casevault.com', crypt('Admin@123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Sarah Mitchell"}', 'authenticated', 'authenticated')
  on conflict (email) do nothing;

  -- Investigator
  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'investigator@casevault.com', crypt('Investigator@123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"David Chen"}', 'authenticated', 'authenticated')
  on conflict (email) do nothing;

  -- Officer
  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'officer@casevault.com', crypt('Officer@123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Robert Taylor"}', 'authenticated', 'authenticated')
  on conflict (email) do nothing;

  -- Analyst
  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'analyst@casevault.com', crypt('Analyst@123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"name":"Emily Watson"}', 'authenticated', 'authenticated')
  on conflict (email) do nothing;
end $$;

-- handle_new_auth_user() (from the security-hardening migration) will have
-- auto-created a `profiles` row for each with role='analyst'. Promote them
-- to their intended demo role:
update profiles set role = 'admin', name = 'Sarah Mitchell' where email = 'admin@casevault.com';
update profiles set role = 'investigator', name = 'David Chen' where email = 'investigator@casevault.com';
update profiles set role = 'officer', name = 'Robert Taylor' where email = 'officer@casevault.com';
update profiles set role = 'analyst', name = 'Emily Watson' where email = 'analyst@casevault.com';
