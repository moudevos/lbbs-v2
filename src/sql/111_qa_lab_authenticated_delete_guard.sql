-- Sprint 9, iteracion 10: retira DELETE heredado de authenticated en el laboratorio QA.
-- Ejecutar manualmente una sola vez despues de 110. No elimina ni modifica evidencia.

revoke delete on public.qa_runs from authenticated;
revoke delete on public.qa_scenario_results from authenticated;
revoke delete on public.qa_entity_registry from authenticated;
revoke delete on public.qa_findings from authenticated;

notify pgrst, 'reload schema';
