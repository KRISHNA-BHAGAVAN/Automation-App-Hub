# Automation Hub

Automation Hub keeps mini automation apps organized by category. Authenticated
users can browse and launch app cards; admins can manage categories and cards.

## Supabase setup

1. In the Supabase SQL Editor, run
   `supabase/migrations/001_automation_hub.sql`, then run
   `supabase/migrations/002_signup_requests_and_user_blocks.sql`.
2. Create the first account from the app’s **Create an account** page using an
   `@one-line.com` address and verify it from the email.
3. Promote the first admin in the SQL Editor, replacing the email:

   ```sql
   update public.profiles
   set role = 'admin'
   where lower(email) = lower('admin@one-line.com');
   ```

   Wait for the email to be verified before signing in as the first admin.
   Profile roles cannot be changed through the app; use the Supabase SQL Editor
   for trusted role changes.
4. Anyone with an `@one-line.com` email can sign up, but must verify their
   email before accessing the workspace. Other email addresses can only submit
   an access request. Admins review these under **Access requests**; accepting
   sends an invitation email. The **People** section lets admins block and
   unblock approved accounts.
5. **Invite user** is available to admins for `@one-line.com` teammates.
6. In **Authentication → URL Configuration**, allow the app's Replit preview
   and published redirect URLs, including `/login?verified=1` and
   `/reset-password?invite=1`.
7. Add and verify at least one sender in Brevo. Signup verification,
   access-approval invitations, password resets, and admin invitations use an
   active verified sender on the connected Brevo account.

## Secrets

The project uses:

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — public Supabase client key
- `SUPABASE_SERVICE_ROLE_KEY` — server-only key used to validate admin access
  and create recovery and invitation links

Never expose the service-role key to frontend code. Signup, access-request
reviews, password resets, and invitations are handled by the API server and
emails are sent through Brevo. Admin actions require a verified, approved,
unblocked admin session.
