-- Privater Chat nur nach angenommener Kontaktanfrage
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  workshop_id bigint references public.workshops(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

-- Falls die Tabelle schon existiert, sicherstellen, dass workshop_id vorhanden ist.
alter table public.messages
  add column if not exists workshop_id bigint references public.workshops(id) on delete set null;

alter table public.messages enable row level security;

drop policy if exists "messages_select_participants" on public.messages;
create policy "messages_select_participants" on public.messages
for select to authenticated
using (
  exists (
    select 1 from public.contact_requests cr
    where cr.status = 'accepted'
      and ((cr.requester_id = auth.uid() and cr.recipient_id = messages.recipient_id)
        or (cr.recipient_id = auth.uid() and cr.requester_id = messages.recipient_id))
      and (cr.workshop_id is not distinct from messages.workshop_id)
  )
);

drop policy if exists "messages_insert_sender" on public.messages;
create policy "messages_insert_sender" on public.messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.contact_requests cr
    where cr.status = 'accepted'
      and cr.requester_id = least(sender_id, recipient_id)
      and cr.recipient_id = greatest(sender_id, recipient_id)
      and (cr.workshop_id is not distinct from messages.workshop_id)
  )
);

create index if not exists idx_messages_conversation
on public.messages(sender_id, recipient_id, workshop_id, created_at);

-- Realtime fuer den privaten Chat aktivieren.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;
