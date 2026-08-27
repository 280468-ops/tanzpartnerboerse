-- Gegenseitige Freigabe von Kontaktdaten
create table if not exists public.contact_details (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text,
  phone text,
  share_contacts boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.contact_details enable row level security;

drop policy if exists "contact_details_select_private" on public.contact_details;
create policy "contact_details_select_private"
on public.contact_details
for select to authenticated
using (
  user_id = auth.uid()
  or (
    share_contacts = true
    and exists (
      select 1 from public.contact_details mine
      where mine.user_id = auth.uid()
        and mine.share_contacts = true
    )
    and exists (
      select 1 from public.workshop_pairs p
      where (p.user1_id = auth.uid() and p.user2_id = contact_details.user_id)
         or (p.user2_id = auth.uid() and p.user1_id = contact_details.user_id)
    )
  )
);

drop policy if exists "contact_details_insert_self" on public.contact_details;
create policy "contact_details_insert_self"
on public.contact_details
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "contact_details_update_self" on public.contact_details;
create policy "contact_details_update_self"
on public.contact_details
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index if not exists idx_contact_details_share on public.contact_details(user_id, share_contacts);
