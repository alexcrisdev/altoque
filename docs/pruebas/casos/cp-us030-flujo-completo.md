# US-030 — Guion de aceptación del flujo completo

Responsable de ejecución: Erick. Fecha prevista: 04/11/2026 (America/Lima).
Versión, fecha/hora, navegador, roles y resultado detallado por caso:
[us030-validacion.txt](../evidencias/us030-validacion.txt).

## Preparación y límites

Aplicación compilada localmente y Supabase demo compartido. PR #46 integrado;
usuarios demo preparados y migraciones de pagos/cierre aplicadas por el responsable.
Usar únicamente Mesa 5 libre y el QR de mostrador configurado en el entorno.
No regenerar QR ni modificar sesiones de Mesas 1–3. Pedidos de una unidad del
producto disponible más barato, identificados con `PRUEBA E2E <UUID>`.
Los pagos son registros ficticios de aceptación, sin operaciones bancarias reales.
Conservar pagos/cierres históricos; cancelar pedidos no cobrados y cerrar sesiones
propias. Si el caso ya entregó/cobró, completar o cerrar su cuenta propia desde caja,
con excepción administrativa documentada solo como recuperación si hace falta.

Los recorridos E2E de US-040 se reutilizan para CP-030-01, 02 y 06. Los recorridos
nuevos reutilizan la fixture `pedido` y la autenticación de usuarios normales.
Producto agotado se revisa separadamente desde el panel admin, sin CI concurrente,
restaurando inmediatamente la disponibilidad original en un `finally`.
Capturas de contenido de página, sin barra de direcciones, credenciales ni QR.
Un caso no ejecutado no se declara aprobado. Un defecto se registra y comunica;
no se modifica la lógica de historias ajenas para hacer pasar esta aceptación.

## CP-030-01 — Pedido por QR en mesa

- **Criterios:** 1 y 2.
- **Precondiciones:** Mesa 5 libre; QR vigente; mesero/cocina autenticables.
- **Pasos:** abrir Mesa 5 como mesero; entrar por su QR; agregar una unidad con marca;
  revisar carrito y confirmar; anotar número; comprobarlo en cocina y mesero.
- **Esperado:** un pedido persistido con cantidad/precio correctos, mismo número en
  cliente y paneles. Cancelación con motivo y sesión propia cerrada al terminar.
- **Obtenido:** Pedido QR de Mesa 5 confirmado, una unidad persistida y mismo número en cocina/mesero; cancelado y sesión propia cerrada.
- **Estado:** Aprobado.
- **Evidencia:** `tests/e2e/pedido-en-mesa.spec.ts`; informe de ejecución enlazado arriba.
- **Defecto:** ninguno funcional observado en este caso.

## CP-030-02 — Pedido para llevar

- **Criterio:** 2.
- **Precondiciones:** QR vigente de mostrador; no necesita sesión de mesa.
- **Pasos:** abrir carta de mostrador; agregar producto; completar datos ficticios;
  confirmar; comprobar número y modalidad en cocina/mesero; cancelar pedido propio.
- **Esperado:** un pedido para llevar sin asignación a otra mesa, visible en los paneles.
- **Obtenido:** Pedido QR para llevar confirmado y visible en cocina/mesero; un único registro propio, cancelado en la limpieza.
- **Estado:** Aprobado.
- **Evidencia:** `tests/e2e/pedido-para-llevar.spec.ts` e informe enlazado.
- **Defecto:** ninguno funcional observado en este caso.

## CP-030-03 — Pedido asistido sin celular

- **Criterio:** 3.
- **Precondiciones:** usuario mesero; Mesa 5 abierta por la prueba.
- **Pasos:** desde mesero abrir Registrar pedido asistido; seleccionar Mesa 5;
  agregar una unidad; registrar; verificar número, origen asistido y cocina/mesero.
- **Esperado:** pedido persistido por el mesero para la sesión correcta, sin QR del cliente.
  Cancelar el pedido no cobrado y cerrar solo la sesión de prueba.
- **Obtenido:** Pedido asistido N.º 203, source WAITER, una unidad, visible en cocina y mesero; cancelado y sesión propia cerrada en finally.
- **Estado:** Aprobado.
- **Evidencia:** [captura del asistido](../evidencias/us030/cp030-03-asistido.png) e informe enlazado.
- **Defecto:** ninguno funcional observado en este caso.

## CP-030-04 — Agotado antes y después de agregar

- **Criterio:** 4.
- **Precondiciones:** no hay CI E2E/integración concurrente; producto disponible;
  admin y comensal en contextos separados; disponibilidad original conocida.
- **Pasos:** agregar una unidad al carrito; en admin marcar ese producto agotado;
  en una carta recién abierta comprobar botón de agregar deshabilitado; volver al
  carrito anterior e intentar confirmar; restaurar disponibilidad en todo desenlace.
- **Esperado:** no permite agregar agotado ni confirmar el carrito desactualizado;
  mensaje identificable por producto, ningún pedido propio y disponibilidad restaurada.
- **Obtenido:** Inca Kola 500 ml: agregar deshabilitado y carrito anterior rechazado por agotado; ningún pedido creado. Disponibilidad original restaurada.
- **Estado:** Aprobado.
- **Evidencia:** [agotado](../evidencias/us030/cp030-04-agotado.png), [carrito rechazado](../evidencias/us030/cp030-04-carrito-rechazado.png) e informe enlazado.
- **Defecto:** ninguno funcional observado en este caso.

## CP-030-05 — Pérdida de conexión y reintento

- **Criterio:** 4.
- **Precondiciones:** carrito válido de mostrador; marca única; sin pedido previo.
- **Pasos:** desconectar el contexto del comensal antes de confirmar; pulsar confirmar;
  comprobar mensaje claro y carrito conservado; reconectar; reintentar.
- **Esperado:** un solo pedido persistido con el número mostrado; sin vaciado ante
  el error. Cancelar el pedido propio al terminar y restablecer la conexión.
- **Obtenido:** Sin conexión: mensaje claro, carrito conservado y cero pedidos; reconexión y reintento: exactamente un pedido. Limpieza completada.
- **Estado:** Aprobado.
- **Evidencia:** spec de conexión e informe enlazado.
- **Defecto:** ninguno funcional observado en este caso.

## CP-030-06 — Doble confirmación

- **Criterio:** 4.
- **Precondiciones:** carrito de mostrador y marca única.
- **Pasos:** pulsar dos veces Confirmar en el mismo turno; comprobar el resultado
  y consultar los registros propios con usuario normal; cancelar el pedido.
- **Esperado:** exactamente un registro y una unidad; mismo número en cliente/paneles.
- **Obtenido:** Dos pulsaciones inmediatas produjeron un único pedido de una unidad, comprobado antes y después de recorrer los paneles.
- **Estado:** Aprobado.
- **Evidencia:** `tests/e2e/idempotencia.spec.ts` e informe enlazado.
- **Defecto:** ninguno funcional observado en este caso.

## CP-030-07 — Preparación y entrega

- **Criterios:** 1 y flujo completo.
- **Precondiciones:** pedido propio pendiente y cocina/mesero autenticados.
- **Pasos:** cocina acepta, empieza preparación y marca listo; mesero abre el detalle
  del pedido y confirma la entrega; verificar estado persistido y continuar al cobro.
- **Esperado:** transiciones en orden hasta DELIVERED; no afecta otros pedidos.
- **Obtenido:** Cocina pasó por ACCEPTED, IN_PROGRESS y READY; el mesero confirmó DELIVERED, comprobado en los datos propios.
- **Estado:** Aprobado.
- **Evidencia:** `tests/e2e/pago-y-cierre.spec.ts` e informe enlazado.
- **Defecto:** ninguno funcional observado en este caso.

## CP-030-08 — Efectivo parcial y vuelto

- **Criterio:** 5.
- **Precondiciones:** cuenta propia con saldo positivo, sin pagos pendientes.
- **Pasos:** registrar efectivo por parte del saldo; comprobar reducción exacta;
  cobrar el resto con efectivo recibido superior al monto; verificar vuelto.
- **Esperado:** pagos confirmados, saldo disminuye solo lo cobrado, vuelto correcto
  y sin registrar el efectivo recibido como consumo adicional.
- **Obtenido:** Dos cobros en efectivo: parcial con reducción exacta del saldo y resto con vuelto de S/ 1.00; saldo final cero.
- **Estado:** Aprobado.
- **Evidencia:** `tests/e2e/pago-y-cierre.spec.ts` e informe enlazado.
- **Defecto:** ninguno funcional observado en este caso.

## CP-030-09 — Yape por verificar, rechazado y confirmado

- **Criterio:** 5.
- **Precondiciones:** cuenta propia con saldo positivo; caja autorizada.
- **Pasos:** registrar Yape ficticio; comprobar Por verificar, saldo intacto y cierre
  ausente; rechazarlo; comprobar saldo intacto; registrar otro Yape y confirmar recepción.
- **Esperado:** PENDING y FAILED no descuentan; CONFIRMED descuenta una sola vez.
  Un Yape pendiente bloquea el cierre, incluida la excepción administrativa.
- **Obtenido:** Yape PENDING bloqueó cierre y no descontó; FAILED conservó saldo; otro Yape CONFIRMED descontó su importe.
- **Estado:** Aprobado.
- **Evidencia:** `tests/e2e/pago-y-cierre.spec.ts` e informe enlazado.
- **Defecto:** ninguno funcional observado en este caso.

## CP-030-10 — Tarjeta rechazada y aprobada

- **Criterio:** 5.
- **Precondiciones:** cuenta propia con saldo y referencias ficticias únicas.
- **Pasos:** registrar resultado Rechazado del POS; comprobar saldo intacto y registro;
  registrar otro resultado Aprobado por una parte del saldo; comprobar reducción.
- **Esperado:** rechazo no paga la cuenta; aprobación descuenta solo su monto.
  No ingresar número de tarjeta ni CVV.
- **Obtenido:** Tarjeta rechazada conservó saldo; aprobación posterior descontó el importe parcial, con referencias ficticias.
- **Estado:** Aprobado.
- **Evidencia:** `tests/e2e/pago-y-cierre.spec.ts` e informe enlazado.
- **Defecto:** ninguno funcional observado en este caso.

## CP-030-11 — Pago confirmado y cierre ordinario

- **Criterio:** 5.
- **Precondiciones:** pedido entregado, saldo 0 y ningún Yape pendiente.
- **Pasos:** pulsar Cerrar cuenta y Sí, cerrar cuenta; revisar Cuenta cerrada,
  autor, fecha e importes; comprobar Mesa 5 libre en mesero y sesión cerrada en datos.
- **Esperado:** cierre ordinario consistente, registros conservados y mesa libre.
- **Obtenido:** Cierre ORDINARY persistido con balance 0 y autor; resumen visible y Mesa 5 libre en mesero.
- **Estado:** Aprobado.
- **Evidencia:** `tests/e2e/pago-y-cierre.spec.ts` e informe enlazado.
- **Defecto:** ninguno funcional observado en este caso.

## CP-030-12 — Excepción por rol

- **Criterios:** 5 y escenario alternativo.
- **Precondiciones:** cuenta de prueba con saldo; caja y admin del mismo restaurante.
- **Pasos:** comprobar que caja no ve Cerrar con excepción; como admin escribir
  motivo de prueba de 10–300 caracteres; cerrar; revisar resumen y mesa libre.
- **Esperado:** excepción exclusiva de admin/dueño, motivo, autor e importe no cobrado
  conservados; no se transforma el saldo exonerado en un pago confirmado.
- **Obtenido:** Caja no mostró excepción; admin cerró con motivo explícito y el resumen conservó ese motivo; sesión propia finalizada.
- **Estado:** Aprobado.
- **Evidencia:** spec/recorrido de excepción e informe enlazado.
- **Defecto:** ninguno funcional observado en este caso.

## CP-030-13 — Para llevar cobrado y cerrado

- **Criterio:** 5.
- **Precondiciones:** pedido propio para llevar y cuenta abierta.
- **Pasos:** entregar y cobrar el total; cerrar y revisar resumen; volver a la cuenta;
  comprobar que no ofrece registrar nuevos pagos; intentar uno con usuario normal
  contra la RPC usando solo el ID propio, verificando rechazo y cantidad invariable.
- **Esperado:** la cuenta cerrada no acepta pagos posteriores, ni desde interfaz
  ni desde servidor; historial conservado y sin pedidos activos de la prueba.
- **Obtenido:** Para llevar entregado, cobrado y cerrado; interfaz sin nuevos cobros y RPC rechazó el intento posterior sin insertar pagos.
- **Estado:** Aprobado.
- **Evidencia:** spec/recorrido de para llevar e informe enlazado.
- **Defecto:** ninguno funcional observado en este caso.

## Defectos y comunicación

No se observaron defectos funcionales de la aplicación en los 13 casos ejecutados. Registrar cada hallazgo como
DEF-030-xx, con pasos, esperado/obtenido, severidad e historia/responsable.
Comunicar críticos/altos a Alexander y Alina inmediatamente. Alina mantiene el
registro central de US-031; este guion conserva la evidencia de aceptación original.
La conformidad final del equipo/usuario se registra aparte de los resultados técnicos.

Validación técnica: 13/13 casos de aceptación aprobados; 17/17 E2E y 2 comprobaciones manuales asistidas. La conformidad de aceptación del usuario/PO sigue correspondiendo al equipo.
