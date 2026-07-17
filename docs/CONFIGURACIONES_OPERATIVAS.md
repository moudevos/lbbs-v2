# Configuraciones Operativas

Esta guia explica para que sirve cada seccion de **Configuracion** y como se relaciona con Rewards, POS, stock y liquidaciones.

## Reglas generales

- Owner y admin administran las configuraciones.
- Desactivar un registro evita su uso en operaciones nuevas. No elimina historicos.
- Las reglas de compensacion tienen vigencia y prioridad. Una liquidacion ya creada conserva su propio snapshot.
- Antes de desactivar un metodo de pago, servicio o producto, confirma que no se necesitara en nuevas operaciones.

## Catalogos

### Servicios

Organiza el catalogo de servicios por grupos, por ejemplo: Cortes, Barba, Facial o Tratamientos.

- Se usa para ordenar el catalogo de servicios y los filtros operativos.
- No crea ni modifica servicios por si sola.
- No cambia precios, duraciones ni ventas historicas.

### Productos

Organiza el catalogo de productos, por ejemplo: Barberia, Bebidas o Snacks.

- Se usa para ordenar productos en POS, stock y reportes.
- No modifica el precio, costo ni stock de un producto.
- Una categoria inactiva no debe usarse para nuevos productos.

### Pagos

Define los medios disponibles al cobrar una venta en POS.

- **Efectivo**: registra efectivo y permite calcular vuelto.
- **QR Yape/Plin**: registra cobros por billetera digital o QR.
- **Culqi**: registra cobros con tarjeta procesados por Culqi.
- **Transferencia bancaria**: registra pagos por transferencia.

Cada metodo tiene propiedades operativas:

- `Tipo de pago`: identifica si es efectivo, QR, tarjeta, transferencia u otro digital.
- `Permite vuelto`: solo corresponde al efectivo.
- `Cuenta como efectivo`: solo corresponde al efectivo y afecta el cierre de caja.

Desactivar un metodo evita su uso en ventas nuevas, pero conserva el nombre en ventas y cierres anteriores.

### Unidades

Define como se mide un producto: unidad, botella, paquete, porcion u otro.

- Ayuda a mantener el catalogo y el inventario consistentes.
- No convierte cantidades automaticamente.
- No cambia el stock existente.

### Cortesias

Define los motivos obligatorios para entregar una cortesia en POS.

Ejemplos: cliente frecuente, compensacion, promocion o error de servicio.

- Una cortesia reduce el total de una venta segun la regla aplicada.
- Toda cortesia debe tener motivo para conservar auditoria.
- No es un reward y no genera un pago.

### Stock

Define los motivos para movimientos de inventario fuera de una venta.

- **Conteo fisico**: corrige una diferencia detectada al contar.
- **Merma**: registra perdida o dano de producto.
- **Vencimiento**: registra salida por producto vencido.
- **Error de registro**: corrige un movimiento previo.
- **Uso interno**: registra consumo interno.
- **Reposicion**: registra ingreso manual de inventario.
- **Transferencia recibida/enviada**: registra movimiento entre sedes.

Los motivos no cambian stock por si solos. El stock cambia cuando se registra un movimiento con cantidad y sede.

### Plantillas

Edita los mensajes base para WhatsApp.

- **Recordatorio de reserva**: se usa antes de una cita.
- **Agradecimiento post servicio**: se usa despues de una atencion.

Las variables como `{{cliente}}`, `{{fecha}}`, `{{hora}}`, `{{sede}}`, `{{barbero}}` y `{{servicio}}` se reemplazan al enviar el mensaje.

## Compensacion y liquidaciones

Estas reglas se usan al registrar produccion y preparar liquidaciones. No modifican automaticamente una liquidacion ya creada.

### Aportes

Define el aporte operativo que se descuenta de cada servicio antes de calcular la base de comision del barbero.

Puede configurarse por tramo de monto, por ejemplo:

- Servicios menores a S/ 60: aporte fijo menor.
- Servicios desde S/ 60: aporte fijo mayor.

Usa prioridad para resolver reglas que podrian coincidir. Debe haber reglas claras y no superpuestas para evitar resultados inesperados.

### Rewards

En Configuracion, **Rewards** significa la comision fija del barbero cuando se realiza un servicio usando un reward ya ganado por un cliente.

- Puede aplicar globalmente, por servicio o por categoria.
- No crea reglas de fidelizacion.
- No entrega premios al cliente.
- No cambia descuentos de rewards ya aplicados en ventas cerradas.

Para crear premios y reglas de fidelizacion de clientes, usa el modulo **Rewards** del menu principal.

### Comisiones de cortesias

Define la comision fija que puede recibir un barbero por un servicio entregado como cortesia.

- Solo aplica cuando la cortesia fue validada en POS.
- Puede definirse de forma global, por servicio o por categoria.
- No convierte una cortesia en venta ni genera cobro.

### Bonos

Define bonos por productos vendidos.

- El bono es un monto fijo por unidad vendida.
- Puede aplicarse a un producto especifico o a una categoria de productos.
- Se refleja en la produccion y luego en la liquidacion correspondiente.
- No modifica el precio de venta del producto.

### Recargos

Define el recargo para productos del inventario que se entregan a un empleado como insumo.

- Se usa en la cuenta corriente o cobro de insumos a empleados.
- Puede ser monto fijo o porcentaje.
- Puede configurarse por producto.
- No cambia precios de productos para clientes en POS.
- No es una comision ni un bono.

## Rewards de clientes

El modulo **Rewards** del menu principal administra fidelizacion de clientes. Es distinto de la configuracion de comisiones Rewards.

### Premios

Define lo que puede ganar un cliente, por ejemplo un corte gratis, descuento fijo, porcentaje o vale.

- Un premio debe estar activo para poder usarse en una regla activa.
- Puede aplicar a un servicio, producto o venta segun su configuracion.

### Reglas

Define cuando un cliente gana un premio.

- **Atenciones generales**: cuenta atenciones de servicios cerrados. Es la opcion correcta para tarjetas fisicas con stickers.
- **Atenciones de un servicio especifico**: cuenta solo un servicio seleccionado. Requiere seleccionar el servicio.
- La regla define el umbral, vigencia, premio y si puede repetirse.

Una reserva no genera rewards. Los rewards se calculan con ventas cerradas o migraciones manuales registradas.

### Migracion de tarjetas fisicas

Registra stickers o atenciones acumuladas de tarjetas anteriores.

- Por defecto registra atenciones generales.
- Usa servicio especifico solo si la tarjeta realmente acumulaba ese servicio.
- Cada migracion queda auditada y puede habilitar rewards segun las reglas activas.
- Cliente varios no participa en Rewards.

### Recalcular rewards

Vuelve a evaluar el historial del cliente frente a las reglas activas.

- Se usa despues de una migracion o cuando se ajusta una regla o premio.
- No debe duplicar premios ya generados.
- No modifica ventas cerradas.

## Orden recomendado de configuracion inicial

1. Crear sedes, equipo, categorias, servicios y productos.
2. Configurar metodos de pago, unidades y motivos de stock.
3. Configurar reglas de aportes, bonos, cortesias y recargos.
4. Configurar premios y reglas de Rewards si se usara fidelizacion.
5. Validar una venta de prueba, una cortesia, un movimiento de stock y una liquidacion antes de operar.
