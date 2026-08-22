-- Un tope unitario vacío significa “sin tope”. Una versión anterior de la
-- interfaz lo convirtió en 0 al guardar, por lo que bloqueaba productos de
-- cualquier precio positivo aunque estuvieran habilitados en la regla.
update public.courtesy_rule_benefits
set max_unit_amount = null,
    updated_at = now()
where benefit_item_type = 'product'
  and max_unit_amount = 0;

notify pgrst, 'reload schema';
