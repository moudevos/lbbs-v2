-- When several general rules match, the closest eligible amount wins.
-- Example: a S/ 60 service chooses the S/ 60 rule over the S/ 0 fallback.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.validate_completed_sale_courtesies()'::regprocedure)
  into v_definition;

  if position('r.priority desc, r.created_at desc' in v_definition) > 0 then
    execute replace(
      v_definition,
      'r.priority desc, r.created_at desc',
      'r.minimum_unit_amount desc, r.priority desc, r.created_at desc'
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';
