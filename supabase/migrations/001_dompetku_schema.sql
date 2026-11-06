create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  created_at timestamptz not null default now(),
  unique (user_id, name, type)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  type text not null check (type in ('income', 'expense')),
  description text not null,
  amount numeric(15,2) not null check (amount > 0),
  transaction_date date not null,
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists categories_user_idx on public.categories (user_id, type);
create index if not exists transactions_user_idx on public.transactions (user_id, transaction_date);
create index if not exists transactions_type_idx on public.transactions (user_id, type, transaction_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(profiles.full_name, excluded.full_name),
    updated_at = now();

  insert into public.categories (user_id, name, type)
  values
    (new.id, 'Gaji', 'income'),
    (new.id, 'Freelance', 'income'),
    (new.id, 'Bonus', 'income'),
    (new.id, 'Investasi', 'income'),
    (new.id, 'Bisnis', 'income'),
    (new.id, 'Hadiah', 'income'),
    (new.id, 'Lain-lain', 'income'),
    (new.id, 'Makan', 'expense'),
    (new.id, 'Jajan', 'expense'),
    (new.id, 'Hiburan', 'expense'),
    (new.id, 'Transportasi', 'expense'),
    (new.id, 'Belanja', 'expense'),
    (new.id, 'Tagihan', 'expense'),
    (new.id, 'Kesehatan', 'expense'),
    (new.id, 'Pendidikan', 'expense'),
    (new.id, 'Lain-lain', 'expense')
  on conflict (user_id, name, type) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy "Profiles are viewable by owner"
on public.profiles for select
using (auth.uid() = id);

create policy "Profiles can be inserted by owner"
on public.profiles for insert
with check (auth.uid() = id);

create policy "Profiles can be updated by owner"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Profiles can be deleted by owner"
on public.profiles for delete
using (auth.uid() = id);

create policy "Categories are viewable by owner"
on public.categories for select
using (auth.uid() = user_id);

create policy "Categories can be inserted by owner"
on public.categories for insert
with check (auth.uid() = user_id);

create policy "Categories can be updated by owner"
on public.categories for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Categories can be deleted by owner"
on public.categories for delete
using (auth.uid() = user_id);

create policy "Transactions are viewable by owner"
on public.transactions for select
using (auth.uid() = user_id);

create policy "Transactions can be inserted by owner"
on public.transactions for insert
with check (
  auth.uid() = user_id and exists (
    select 1 from public.categories c
    where c.id = category_id and c.user_id = auth.uid()
  )
);

create policy "Transactions can be updated by owner"
on public.transactions for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id and exists (
    select 1 from public.categories c
    where c.id = category_id and c.user_id = auth.uid()
  )
);

create policy "Transactions can be deleted by owner"
on public.transactions for delete
using (auth.uid() = user_id);
