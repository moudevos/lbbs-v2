-- Reparacion de permisos para beneficios internos en POS.
-- Ejecutar despues de 135_pin_authorization_and_internal_credit_reversal.sql.

alter function public.get_pos_internal_options(uuid, uuid) security definer;
alter function public.checkout_pos_sale(jsonb) security definer;

revoke all on function public.get_pos_internal_options(uuid, uuid) from public, anon;
grant execute on function public.get_pos_internal_options(uuid, uuid) to authenticated, service_role;

revoke all on function public.checkout_pos_sale(jsonb) from public, anon;
grant execute on function public.checkout_pos_sale(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
