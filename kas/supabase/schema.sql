create extension if not exists pgcrypto;

create table if not exists public.settings (
  id integer primary key check (id = 1),
  title text not null default 'Kas Teknik Industri · Semester 1 Kelas D',
  start_date date not null default date '2026-11-02',
  end_date date not null default date '2027-12-31',
  weekly_amount integer not null default 2000 check (weekly_amount >= 0),
  late_fee integer not null default 2000 check (late_fee >= 0)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  week_index integer not null check (week_index >= 0),
  amount integer not null check (amount >= 0),
  paid_on date not null default (now() at time zone 'Asia/Jakarta')::date,
  acc boolean not null default false,
  unique (student_id, week_index)
);

create table if not exists public.holidays (
  week_index integer primary key check (week_index >= 0)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null,
  note text not null check (char_length(note) between 1 and 120),
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into public.settings (id)
values (1)
on conflict (id) do nothing;

create or replace function public.is_cash_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_cash_admin() from public;
grant execute on function public.is_cash_admin() to authenticated;

alter table public.settings enable row level security;
alter table public.students enable row level security;
alter table public.payments enable row level security;
alter table public.holidays enable row level security;
alter table public.expenses enable row level security;
alter table public.admins enable row level security;

drop policy if exists "Public can read settings" on public.settings;
create policy "Public can read settings"
  on public.settings for select to anon, authenticated using (true);
drop policy if exists "Admins manage settings" on public.settings;
create policy "Admins manage settings"
  on public.settings for all to authenticated
  using (public.is_cash_admin()) with check (public.is_cash_admin());

drop policy if exists "Public can read students" on public.students;
create policy "Public can read students"
  on public.students for select to anon, authenticated using (true);
drop policy if exists "Admins manage students" on public.students;
create policy "Admins manage students"
  on public.students for all to authenticated
  using (public.is_cash_admin()) with check (public.is_cash_admin());

drop policy if exists "Public can read payments" on public.payments;
create policy "Public can read payments"
  on public.payments for select to anon, authenticated using (true);
drop policy if exists "Admins manage payments" on public.payments;
create policy "Admins manage payments"
  on public.payments for all to authenticated
  using (public.is_cash_admin()) with check (public.is_cash_admin());

drop policy if exists "Public can read holidays" on public.holidays;
create policy "Public can read holidays"
  on public.holidays for select to anon, authenticated using (true);
drop policy if exists "Admins manage holidays" on public.holidays;
create policy "Admins manage holidays"
  on public.holidays for all to authenticated
  using (public.is_cash_admin()) with check (public.is_cash_admin());

drop policy if exists "Public can read expenses" on public.expenses;
create policy "Public can read expenses"
  on public.expenses for select to anon, authenticated using (true);
drop policy if exists "Admins manage expenses" on public.expenses;
create policy "Admins manage expenses"
  on public.expenses for all to authenticated
  using (public.is_cash_admin()) with check (public.is_cash_admin());

drop policy if exists "Admins can read own admin record" on public.admins;
create policy "Admins can read own admin record"
  on public.admins for select to authenticated using (user_id = (select auth.uid()));

grant select on public.settings, public.students, public.payments, public.holidays, public.expenses
  to anon, authenticated;
grant insert, update, delete on public.settings, public.students, public.payments, public.holidays, public.expenses
  to authenticated;
grant select on public.admins to authenticated;
