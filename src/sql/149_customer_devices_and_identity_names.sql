-- Fase 1 posterior a 147/148: nombres separados y dispositivos PWA propios.
create table if not exists public.customer_devices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  installation_id uuid not null unique,
  platform text not null default 'unknown',
  browser text,
  language text,
  timezone text,
  is_pwa boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customer_devices_customer_seen_idx on public.customer_devices(customer_id, last_seen_at desc);
alter table public.customer_devices enable row level security;
drop policy if exists customer_devices_self_select on public.customer_devices;
create policy customer_devices_self_select on public.customer_devices for select to authenticated using (customer_id in (select customer_id from public.customer_accounts where auth_user_id = (select auth.uid()) and status = 'active'));
drop policy if exists customer_devices_self_insert on public.customer_devices;
create policy customer_devices_self_insert on public.customer_devices for insert to authenticated with check (customer_id in (select customer_id from public.customer_accounts where auth_user_id = (select auth.uid()) and status = 'active'));
drop policy if exists customer_devices_self_update on public.customer_devices;
create policy customer_devices_self_update on public.customer_devices for update to authenticated using (customer_id in (select customer_id from public.customer_accounts where auth_user_id = (select auth.uid()) and status = 'active')) with check (customer_id in (select customer_id from public.customer_accounts where auth_user_id = (select auth.uid()) and status = 'active'));
revoke all on public.customer_devices from public, anon;
grant select, insert, update on public.customer_devices to authenticated;

create or replace function public.register_customer_identity_v2(p_document_type text, p_document_number text, p_phone text, p_first_name text, p_last_name text, p_email text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_doc text := public.normalize_customer_identity_document(p_document_number); v_doc_type text := nullif(btrim(p_document_type), ''); v_phone text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g'); v_first text := regexp_replace(btrim(coalesce(p_first_name,'')), '\s+', ' ', 'g'); v_last text := regexp_replace(btrim(coalesce(p_last_name,'')), '\s+', ' ', 'g'); v_full text; v_count integer; v_type_count integer; v_customer_id uuid; v_request_id uuid;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión con Google.'; end if;
  if length(v_doc)<4 or length(v_phone)<9 or length(v_first)<1 or length(v_last)<1 then raise exception 'Documento, teléfono, nombres y apellidos son obligatorios.'; end if;
  v_full := btrim(v_first || ' ' || v_last);
  perform pg_advisory_xact_lock(hashtextextended('customer_identity:' || coalesce(v_doc_type,'') || ':' || v_doc, 0));
  if exists(select 1 from public.customer_accounts where auth_user_id=v_uid and status='active') then return jsonb_build_object('status','linked'); end if;
  select count(*) into v_count from public.customers where public.normalize_customer_identity_document(document_number)=v_doc and is_active;
  if v_count=0 then
    insert into public.customers(first_name,last_name,full_name,phone,phone_normalized,email,document_type,document_number,source,is_active) values(v_first,v_last,v_full,btrim(p_phone),v_phone,nullif(lower(btrim(p_email)),''),v_doc_type,v_doc,'manual',true) returning id into v_customer_id;
    insert into public.customer_accounts(customer_id,auth_user_id,status,verified_at) values(v_customer_id,v_uid,'active',now());
    return jsonb_build_object('status','created');
  end if;
  if v_count>1 then select count(*) into v_type_count from public.customers where public.normalize_customer_identity_document(document_number)=v_doc and document_type=v_doc_type and is_active; if v_type_count<>1 then raise exception 'Encontramos varias fichas con ese documento; el personal debe resolver la duplicidad.'; end if; end if;
  select id into v_customer_id from public.customers where public.normalize_customer_identity_document(document_number)=v_doc and is_active and (v_count=1 or document_type=v_doc_type) order by created_at asc limit 1;
  insert into public.customer_link_requests(customer_id,auth_user_id,requested_document_type,requested_document_number,requested_phone,requested_email,requested_name) values(v_customer_id,v_uid,v_doc_type,v_doc,btrim(p_phone),nullif(lower(btrim(p_email)),''),v_full) on conflict do nothing returning id into v_request_id;
  return jsonb_build_object('status','pending','request_id',v_request_id);
end; $$;

create or replace function public.register_customer_device(p_installation_id uuid, p_platform text, p_language text, p_timezone text, p_is_pwa boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_customer_id uuid;
begin
  select customer_id into v_customer_id from public.customer_accounts where auth_user_id=auth.uid() and status='active';
  if v_customer_id is null then raise exception 'La cuenta de cliente no está vinculada.'; end if;
  if exists(select 1 from public.customer_devices where installation_id=p_installation_id and customer_id<>v_customer_id) then raise exception 'Esta instalación pertenece a otra cuenta.'; end if;
  insert into public.customer_devices(customer_id,installation_id,platform,language,timezone,is_pwa,last_seen_at) values(v_customer_id,p_installation_id,left(coalesce(p_platform,'unknown'),80),left(coalesce(p_language,'unknown'),20),left(coalesce(p_timezone,'unknown'),80),coalesce(p_is_pwa,false),now()) on conflict(installation_id) do update set platform=excluded.platform,language=excluded.language,timezone=excluded.timezone,is_pwa=excluded.is_pwa,last_seen_at=now(),updated_at=now();
end; $$;
revoke all on function public.register_customer_identity_v2(text,text,text,text,text,text), public.register_customer_device(uuid,text,text,text,boolean) from public, anon;
grant execute on function public.register_customer_identity_v2(text,text,text,text,text,text), public.register_customer_device(uuid,text,text,text,boolean) to authenticated;
notify pgrst, 'reload schema';
