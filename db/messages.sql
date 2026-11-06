-- db/messages.sql (P1) — 1:1 messages between connected members. NOT YET APPLIED: run once in Supabase SQL editor
-- (project mbwjeoqpppwltixmxely). Additive: nothing existing changes. network.js hides messaging until this exists.
create table public.messages (
  id bigserial primary key,
  connection_id bigint not null references public.connections(id) on delete cascade,
  from_id uuid not null references public.members(id),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz default now()
);
create index messages_conn_idx on public.messages(connection_id, created_at);
alter table public.messages enable row level security;
-- Same demo posture as connections (no auth yet): anyone can read; only an accepted connection's two members can post.
create policy "read messages" on public.messages for select to anon, authenticated using (true);
create policy "send messages" on public.messages for insert to anon, authenticated
  with check (exists (select 1 from public.connections c
    where c.id = connection_id and c.status = 'accepted' and (c.from_id = messages.from_id or c.to_id = messages.from_id)));
