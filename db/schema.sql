-- db/schema.sql (P1) — record of the LIVE Supabase schema (project made-of-her, id mbwjeoqpppwltixmxely, us-west-1).
-- Already applied as migration "members_connections". Kept here for reference / to recreate the DB.
-- No auth in this demo: the browser uses the publishable key and RLS limits what it can do.
-- avatar = 96px MOSAIC snapshot (data URL), never the raw photo. Only shareInNetwork members are upserted.

create table public.members (
  id uuid primary key,
  name text not null check (char_length(name) <= 60),
  city text check (char_length(city) <= 80),
  track text not null,
  interests text[] default '{}',
  goal text check (char_length(goal) <= 300),
  stage text,               -- high_school | college | early | mid | senior | returning | switching
  years int default 0,
  role text check (char_length(role) <= 120),
  open_to_mentor boolean default false,
  pct int default 0,
  women int default 0,
  avatar text check (char_length(avatar) <= 40000),
  is_sample boolean default false,
  updated_at timestamptz default now()
);

create table public.connections (
  id bigserial primary key,
  from_id uuid not null references public.members(id),
  to_id uuid not null references public.members(id),
  note text check (char_length(note) <= 280),
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz default now(),
  unique (from_id, to_id)
);

alter table public.members enable row level security;
alter table public.connections enable row level security;

create policy "read members"   on public.members for select to anon, authenticated using (true);
create policy "insert members" on public.members for insert to anon, authenticated with check (is_sample = false);
create policy "update members" on public.members for update to anon, authenticated using (is_sample = false) with check (is_sample = false);

create policy "read connections"   on public.connections for select to anon, authenticated using (true);
create policy "insert connections" on public.connections for insert to anon, authenticated with check (status = 'pending');
create policy "accept connections" on public.connections for update to anon, authenticated using (true) with check (status = 'accepted');

-- 12 fictional sample members are seeded live (names end in "(sample)", is_sample = true):
--   law: Dr. Joanne Kim (senior 31y, mentor), Ana Ruiz (college) · medicine: Dr. Helen Brooks (senior 27y, mentor), Grace Okafor (college)
--   business: Rachel Stein (senior 22y, mentor), Sofia Marquez (early 3y) · policy: Tasha Williams (returning 12y, mentor)
--   cs: Priya Natarajan (mid 9y, mentor), Leila Haddad (college) · media: Nadia Rahman (mid 7y, mentor)
--   engineering: Maya Chen (early 2y) · science: Emily Park (high_school)
