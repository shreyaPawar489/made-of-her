-- db/messages.sql (P1) — direct messages between ANY two members (connected or not).
-- APPLIED 2026-11-06 as migration "messages" (project mbwjeoqpppwltixmxely). Kept here to recreate the DB.
-- network.js shows "Messaging isn't switched on yet" if this table is ever missing.
create table public.messages (
  id bigserial primary key,
  from_id uuid not null references public.members(id),
  to_id uuid not null references public.members(id),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz default now(),
  check (from_id <> to_id)
);
create index messages_to_idx on public.messages(to_id, created_at);
create index messages_from_idx on public.messages(from_id, created_at);
alter table public.messages enable row level security;
-- Same demo posture as members/connections (no auth yet): readable by anyone with the publishable key.
create policy "read messages" on public.messages for select to anon, authenticated using (true);
create policy "send messages" on public.messages for insert to anon, authenticated with check (from_id <> to_id);
