-- Niveau gehört zum konkreten Workshop-Interesse, nicht zum allgemeinen Profil.
alter table public.workshop_interests
  add column if not exists level text;

update public.workshop_interests
set level = 'Mittelstufe'
where level is null;

alter table public.workshop_interests
  drop constraint if exists workshop_interests_level_check;

alter table public.workshop_interests
  add constraint workshop_interests_level_check
  check (level in ('Anfänger','Mittelstufe','Fortgeschritten'));
