-- Reparacion de permisos para beneficios internos en POS.
-- Owner, admin y recepcion pueden operar POS en su sede. La elegibilidad del
-- beneficio se determina exclusivamente por el cliente-vinculo y la regla.

alter function public.get_pos_internal_options(uuid, uuid) security definer;
alter function public.checkout_pos_sale(jsonb) security definer;

revoke all on function public.get_pos_internal_options(uuid, uuid) from public, anon;
grant execute on function public.get_pos_internal_options(uuid, uuid) to authenticated, service_role;

revoke all on function public.checkout_pos_sale(jsonb) from public, anon;
grant execute on function public.checkout_pos_sale(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
