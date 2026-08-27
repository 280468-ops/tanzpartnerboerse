-- Optionale Körpergröße im Profil
alter table public.profiles
  add column if not exists height_cm integer;

alter table public.profiles
  drop constraint if exists profiles_height_cm_check;

alter table public.profiles
  add constraint profiles_height_cm_check
  check (height_cm is null or (height_cm >= 120 and height_cm <= 230));
