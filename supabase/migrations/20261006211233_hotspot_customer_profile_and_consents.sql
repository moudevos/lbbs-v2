-- Hotspot registration intentionally collects only the minimum profile data.
-- Existing channels that require phone numbers keep their own validations.
alter table public.customers alter column phone drop not null;
alter table public.customers alter column phone_normalized drop not null;

create table if not exists public.customer_consents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  consent_type text not null check (consent_type in ('privacy_notice', 'wifi_terms', 'club_marketing')),
  document_version text not null,
  granted boolean not null,
  source text not null check (source in ('hotspot')),
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((granted and revoked_at is null) or not granted)
);

create index if not exists customer_consents_customer_type_accepted_idx
  on public.customer_consents(customer_id, consent_type, accepted_at desc);

alter table public.customer_consents enable row level security;
revoke all on table public.customer_consents from public, anon;
grant select on table public.customer_consents to authenticated;

drop policy if exists customer_consents_admin_select on public.customer_consents;
create policy customer_consents_admin_select on public.customer_consents
  for select to authenticated using (public.is_admin());
