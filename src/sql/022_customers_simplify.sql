alter table public.customers
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists business_name text;
