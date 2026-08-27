-- Tanzpartner-Paarung pro Workshop

-- Kontaktanfragen können einem konkreten Workshop zugeordnet werden.
alter table public.contact_requests
  add column if not exists workshop_id bigint references public.workshops(id) on delete cascade;

-- Ein Paar ist immer an genau einen Workshop gebunden.
create table if not exists public.workshop_pairs (
  workshop_id bigint not null references public.workshops(id) on delete cascade,
  user1_id uuid not null references public.profiles(id) on delete cascade,
  user2_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workshop_id, user1_id, user2_id),
  check (user1_id <> user2_id)
);

alter table public.workshop_pairs enable row level security;

drop policy if exists "workshop_pairs_read" on public.workshop_pairs;
create policy "workshop_pairs_read" on public.workshop_pairs
for select to authenticated
using (true);

drop policy if exists "workshop_pairs_participants_insert" on public.workshop_pairs;
create policy "workshop_pairs_participants_insert" on public.workshop_pairs
for insert to authenticated
with check (user1_id = auth.uid() or user2_id = auth.uid());

drop policy if exists "workshop_pairs_participants_delete" on public.workshop_pairs;
create policy "workshop_pairs_participants_delete" on public.workshop_pairs
for delete to authenticated
using (user1_id = auth.uid() or user2_id = auth.uid());

create index if not exists idx_workshop_pairs_workshop on public.workshop_pairs(workshop_id);
create index if not exists idx_contact_requests_workshop on public.contact_requests(workshop_id, created_at);

create unique index if not exists uq_workshop_pairs_user1 on public.workshop_pairs(workshop_id, user1_id);
create unique index if not exists uq_workshop_pairs_user2 on public.workshop_pairs(workshop_id, user2_id);
