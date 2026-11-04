-- Public signup is limited in the API to @one-line.com. External addresses
-- need an approved access request before they can use workspace data.

alter table public.profiles
  add column if not exists is_blocked boolean not null default false,
  add column if not exists access_approved boolean not null default true,
  add column if not exists email_verified boolean not null default false;

update public.profiles as profile
set
  email = coalesce(profile.email, auth_user.email),
  email_verified = auth_user.email_confirmed_at is not null,
  access_approved = true
from auth.users as auth_user
where auth_user.id = profile.id;

alter table public.profiles
  alter column access_approved set default false;

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null check (lower(email) !~ '@one-line[.]com$'),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists access_requests_pending_email_idx
  on public.access_requests (lower(email))
  where status = 'pending';

create index if not exists access_requests_status_created_at_idx
  on public.access_requests (status, created_at desc);

drop trigger if exists access_requests_set_updated_at on public.access_requests;
create trigger access_requests_set_updated_at
  before update on public.access_requests
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.profiles (id, email, email_verified, access_approved)
  values (
    new.id,
    new.email,
    new.email_confirmed_at is not null,
    lower(coalesce(new.email, '')) like '%@one-line.com'
  )
  on conflict (id) do update
    set email = excluded.email,
        email_verified = excluded.email_verified;
  return new;
end;
$function$;

create or replace function public.handle_auth_user_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  update public.profiles
  set
    email = new.email,
    email_verified = new.email_confirmed_at is not null,
    access_approved = case
      when lower(coalesce(new.email, '')) like '%@one-line.com' then true
      when lower(coalesce(old.email, '')) = lower(coalesce(new.email, ''))
        then access_approved
      else false
    end
  where id = new.id;
  return new;
end;
$function$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute function public.handle_auth_user_update();

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_blocked = false
      and access_approved = true
      and email_verified = true
  );
$function$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and is_blocked = false
      and access_approved = true
      and email_verified = true
  );
$function$;

revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.access_requests enable row level security;

drop policy if exists "Admins can view access requests"
  on public.access_requests;
create policy "Admins can view access requests"
  on public.access_requests
  for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "Active users can view categories"
  on public.categories;
create policy "Active users can view categories"
  on public.categories
  for select
  to authenticated
  using ((select public.is_active_user()));

drop policy if exists "Active users can view app cards"
  on public.app_cards;
create policy "Active users can view app cards"
  on public.app_cards
  for select
  to authenticated
  using ((select public.is_active_user()));

grant select on public.access_requests to authenticated;
