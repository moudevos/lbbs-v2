-- Busqueda operativa insensible a mayusculas, minusculas y acentos.
create extension if not exists unaccent;
create extension if not exists pg_trgm;

create or replace function public.normalize_search_text(value text)
returns text
language sql
immutable
set search_path = public, extensions
as $$ select lower(unaccent('unaccent', coalesce(value, ''))) $$;

alter table public.customers add column if not exists search_normalized text;

update public.customers
set search_normalized = public.normalize_search_text(concat_ws(' ', full_name, first_name, last_name, business_name, phone, phone_normalized, document_number, email));

create or replace function public.set_customer_search_normalized()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_normalized := public.normalize_search_text(concat_ws(' ', new.full_name, new.first_name, new.last_name, new.business_name, new.phone, new.phone_normalized, new.document_number, new.email));
  return new;
end;
$$;

drop trigger if exists customers_search_normalized on public.customers;
create trigger customers_search_normalized before insert or update of full_name, first_name, last_name, business_name, phone, phone_normalized, document_number, email on public.customers for each row execute function public.set_customer_search_normalized();

create index if not exists customers_search_normalized_idx on public.customers using gin (search_normalized gin_trgm_ops);
notify pgrst, 'reload schema';
