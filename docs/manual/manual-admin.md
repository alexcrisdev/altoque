# Manual de uso de AlToque (panel de administración)

Manual corto para el dueño y el administrador. Cada sección `##` es un fragmento que Toqui
busca por significado (US-153). Describe la app tal como está hoy: si cambia una pantalla,
actualiza su sección y vuelve a correr `npm run ia:indexar-manual`.

## Mesas y códigos QR

- Entra a «Mesas y QR». Arriba eliges la zona: «Salón» (mesas) o «Mostrador» (pedidos para llevar).
- Para crear una mesa toca «Agregar mesa», elige el local y el número, la forma (redonda o cuadrada) y las sillas (1 a 8), y guarda.
- Para el QR de una mesa: toca la mesa en el plano y entra a su ficha. En «Más opciones» toca «Generar QR» y luego «Descargar para imprimir».
- Si la mesa ya tiene QR, «Ver QR» lo muestra y lo bajas con «Descargar PNG». No hace falta volver a imprimirlo.
- «Desactivar QR» anula el código impreso y «Desactivar mesa» la saca del servicio.
- Para acomodar las mesas en el plano 3D toca «Editar plano», arrástralas y toca «Guardar plano» (o «Cancelar»).

## Productos y Autocompletar

- Entra a «Productos». Verás las 10 categorías (Entradas, Platos de fondo, Bebidas con alcohol…); toca una para ver sus platos.
- En «Nuevo producto» escribe el nombre y toca «✨ Autocompletar»: sugiere categoría, descripción, ingredientes y alérgenos, marcados con ✨. Solo llena los campos vacíos.
- Revisa lo sugerido. Los alérgenos aparecen como «¿Contiene…?»: tócalos para confirmarlos. El precio y la foto siempre los pones tú.
- En «Bebidas con alcohol» se piden el % de alcohol y los ml, y se calculan los tragos estándar.
- Toca «Crear producto» para guardarlo. Para cambiar uno usa «Editar producto» y «Guardar cambios».
- «Marcar agotado» y «Marcar disponible» lo bloquean o liberan en la carta; «Desactivar» lo saca de la carta.

## Stock del día

- Entra a «Stock del día». Escribe cuántas unidades de cada plato puedes ofrecer hoy.
- Si dejas el campo vacío, el plato se vende sin límite. Un 0 significa que hoy no hay unidades.
- «Rellenar con la predicción» llena los campos con la cantidad sugerida para hoy; puedes cambiarla antes de guardar.
- Toca «Guardar». Cuando se venden todas las unidades, el plato aparece con candado en la carta del cliente.

## Pedidos

- Entra a «Pedidos» para ver los últimos 30 pedidos del restaurante con su estado. Toca uno para ver su detalle.
- Los clientes piden desde el QR de su mesa; la mesa debe estar habilitada por el mesero («Abrir sesión»).
- Mientras la mesa no esté habilitada, el cliente puede ir eligiendo sus platos y confirma apenas el mesero la habilita.
- Los pedidos para llevar entran por el QR del mostrador. En «Para llevar» eliges qué datos se le piden al cliente (nombre, teléfono).
- El mesero también puede registrar un pedido desde su panel con «Registrar pedido asistido».

## Cuentas y pagos (Yape, efectivo y tarjeta)

- En «Cuentas y pagos» consultas las cuentas abiertas y sus pagos. Caja cobra y cierra; el administrador solo autoriza un «Cerrar con excepción», con motivo obligatorio.
- Efectivo: caja registra el pago y confirma el monto recibido.
- Yape o Plin: el cliente sube la captura y caja la revisa con «Llegó completo», «Llegó otro monto» o «No llegó».
- Tarjeta: el cliente puede pagar en línea desde su cuenta, o caja registra el pago con tarjeta del POS.
- Cuando la cuenta queda en cero, caja toca «Cerrar cuenta» y la mesa queda libre.

## Dashboard y reportes

- «Resumen» muestra «Hoy en tu restaurante» en vivo: ventas, pedidos, ticket promedio, tiempo de cocina y satisfacción, comparados con ayer a la misma hora.
- También ves ventas por hora, alertas, los 5 platos más vendidos, el estado de las mesas, los pagos por método y «Platos para preparar mañana».
- En «Reportes» eliges las fechas «Desde» y «Hasta», tocas «Consultar» y ves Ventas, Tendencias, Mapa de calor y Cocina. Puedes bajar los datos con «Descargar CSV».
- Las fechas siempre están en hora de Lima. Los pedidos de prueba no cuentan en las cifras.

## Roles del personal

- Cada persona entra con su propia cuenta y solo ve su panel.
- Dueño y Administrador: panel de administración (mesas, productos, stock, pedidos, cuentas y reportes).
- Mesero: habilita y libera mesas con «Abrir sesión» y «Cerrar sesión», registra pedidos asistidos y entrega lo que cocina marca listo.
- Cocina: ve los pedidos que entran y toca «Marcar listo» cuando un plato está preparado.
- Caja: cobra en efectivo, verifica las capturas de Yape o Plin, registra pagos con tarjeta y cierra las cuentas.
- Quien cubre dos puestos recibe los dos roles.

## Toqui, el asistente

- Toqui es el personaje que flota abajo a la derecha. Tócalo para abrir el chat; también puedes arrastrarlo.
- Pregúntale cómo va tu restaurante (ventas, hora pico, platos más y menos vendidos, agotados, qué preparar mañana).
- También responde qué opinan tus clientes, a partir de sus comentarios, y cómo se usa AlToque, a partir de este manual.
- Toqui solo consulta: nunca cambia datos. Si no tiene el dato, te lo dice.
