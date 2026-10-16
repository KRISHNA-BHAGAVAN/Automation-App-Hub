# Automation Hub

Automation Hub keeps mini automation apps organized by category. Authenticated
users can browse and launch app cards; admins can manage categories and cards.

## Supabase setup

1. In the Supabase SQL Editor, run
   `supabase/migrations/001_automation_hub.sql`.
2. Create your initial users under **Authentication → Users**. The migration
   creates each user's profile with the `user` role.
3. Promote the first admin in the SQL Editor, replacing the email:

   ```sql
   update public.profiles
   set role = 'admin'
   where lower(email) = lower('admin@example.com');
   ```

   Profile roles cannot be changed through the app. Use the Supabase SQL Editor
   for trusted role changes.
4. In **Authentication → URL Configuration**, add the app's Replit preview
   origin and published origin to **Redirect URLs**. The recovery link returns
   to `/reset-password`.
5. Add and verify at least one sender in Brevo. The reset service sends from an
   active verified sender on the connected Brevo account.

## Secrets

The project uses:

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — public Supabase client key
- `SUPABASE_SERVICE_ROLE_KEY` — server-only key used to create recovery links

Never expose the service-role key to frontend code. Password-reset requests are
sent through the API server and Brevo; the response does not reveal whether an
email has an account.
