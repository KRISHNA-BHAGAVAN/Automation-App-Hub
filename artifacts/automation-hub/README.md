# Automation Hub

Automation Hub keeps mini automation apps organized by category. Authenticated
users can browse and launch app cards; admins can manage categories and cards.

## Supabase setup

1. In the Supabase SQL Editor, run
   `supabase/migrations/001_automation_hub.sql`.
2. Create your first account under **Authentication → Users**. The migration
   creates its profile with the `user` role.
3. Promote the first admin in the SQL Editor, replacing the email:

   ```sql
   update public.profiles
   set role = 'admin'
   where lower(email) = lower('admin@example.com');
   ```

   Profile roles cannot be changed through the app. Use the Supabase SQL Editor
   for trusted role changes.
4. There is no public sign-up page. Once the first admin can sign in, use
   **Invite user** in the workspace. Invitations create standard `user` accounts
   and send a link to set a password.
5. In **Authentication → URL Configuration**, allow the app's Replit preview
   and published redirect URLs, including `/reset-password` and
   `/reset-password?invite=1`.
6. Add and verify at least one sender in Brevo. Password-reset and invitation
   emails are sent from an active verified sender on the connected Brevo
   account.

## Secrets

The project uses:

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — public Supabase client key
- `SUPABASE_SERVICE_ROLE_KEY` — server-only key used to validate admin access
  and create recovery and invitation links

Never expose the service-role key to frontend code. Password-reset requests
and admin-only invitations are handled by the API server and sent through
Brevo. Invitation requests require a valid admin session.
