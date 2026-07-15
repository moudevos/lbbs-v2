alter table if exists public.services
  add column if not exists allow_custom_price boolean not null default false;
