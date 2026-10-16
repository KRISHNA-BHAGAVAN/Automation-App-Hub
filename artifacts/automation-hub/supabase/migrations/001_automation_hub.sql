-- Run this migration in the Supabase SQL Editor for the project used by Automation Hub.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'user'
    check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_cards (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null
    references public.categories (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  link text not null
    check (link ~* '^https?://[^[:space:]]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_cards_category_id_idx
  on public.app_cards (category_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists app_cards_set_updated_at on public.app_cards;
create trigger app_cards_set_updated_at
  before update on public.app_cards
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

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
  );
$function$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.app_cards enable row level security;

drop policy if exists "Profiles are visible to their owner and admins"
  on public.profiles;
create policy "Profiles are visible to their owner and admins"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Authenticated users can view categories"
  on public.categories;
create policy "Authenticated users can view categories"
  on public.categories
  for select
  to authenticated
  using (true);

drop policy if exists "Admins can create categories"
  on public.categories;
create policy "Admins can create categories"
  on public.categories
  for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "Admins can edit categories"
  on public.categories;
create policy "Admins can edit categories"
  on public.categories
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can delete categories"
  on public.categories;
create policy "Admins can delete categories"
  on public.categories
  for delete
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "Authenticated users can view app cards"
  on public.app_cards;
create policy "Authenticated users can view app cards"
  on public.app_cards
  for select
  to authenticated
  using (true);

drop policy if exists "Admins can create app cards"
  on public.app_cards;
create policy "Admins can create app cards"
  on public.app_cards
  for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "Admins can edit app cards"
  on public.app_cards;
create policy "Admins can edit app cards"
  on public.app_cards
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can delete app cards"
  on public.app_cards;
create policy "Admins can delete app cards"
  on public.app_cards
  for delete
  to authenticated
  using ((select public.is_admin()));

grant select on public.profiles to authenticated;
grant select, insert, update, delete
  on public.categories, public.app_cards
  to authenticated;
