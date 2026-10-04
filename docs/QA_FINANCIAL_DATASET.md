# Dataset financiero QA

Los scripts de QA solo se ejecutan contra una base cuyo `system_environment.environment_name` sea `qa` o `staging`, con el token explícito `RESET_LBBS_QA_DATA`.

Fixtures esperados: `QA SAN JUAN`, `QA BARBERO COMISION`, `QA BARBERO FIJO`, `QA RECEPCION`, `QA CLIENTE NORMAL`, `QA CLIENTE REWARD`, `QA EMPLEADO CLIENTE`, `QA CORTE` (S/35, aporte S/2), `QA ALISADO` (S/120), `QA POMADA` (S/35, costo S/15), `QA AGUA` (S/5, costo S/2) y `QA JUGO` (S/8, costo S/3).

Valores de aceptación: servicio normal S/35 comercial, aporte S/2 y base S/33; Reward reconocido S/20, aporte S/2 y base S/18; producto barbería reconocido S/35. Una CxP `QA ALQUILER` pendiente por S/100 debe conservar el gasto P&L al pagarse y reducir la CxP a cero.
