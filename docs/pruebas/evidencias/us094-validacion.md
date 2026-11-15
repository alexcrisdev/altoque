# US-094 · Validación

**Fecha:** 14/11/2026
**Rama:** `dev/alina`

## Criterios de aceptación

| Criterio | Resultado | Evidencia / límite |
|---|---|---|
| Ajuste por restaurante apagado por defecto | Implementado | Migración `20261115010339_us094_cobro_anticipado_mesa.sql`; migración creada, no aplicada. |
| Pedido QR de mesa espera pago cuando el ajuste está activo y entra a cocina al pagar el saldo total | Implementado | Trigger de pedido y trigger de pago por sesión en la nueva migración. Se añadieron escenarios RLS para pago parcial, total, pedidos posteriores y concurrencia; no se ejecutaron contra una base local con esta migración. |
| Cocina oculta pedidos pendientes y solo muestra el total | Implementado | Se conserva el filtro de cocina que excluye `PENDING`; el nuevo conteo consulta solo `id` con `head: true`. Lógica comprobada por typecheck y build. |
| Caja prioriza cuentas pendientes y muestra su antigüedad | Implementado | Función pura `ordenarCuentasCaja` con prueba unitaria. |
| Historial registra `US-094: pago confirmado` | Implementado | La migración registra el motivo y el autor del pago; el caso está incluido en las pruebas RLS, pendientes de ejecución local. |
| Ajuste apagado conserva el comportamiento actual | Implementado | La migración deja el default en `false`; prueba RLS añadida, pendiente de ejecución local. |

## Verificaciones ejecutadas

- `npm run lint`: aprobado.
- `npm run typecheck`: aprobado.
- `npm test -- --fsModuleCachePath ./.next/cache/vitest`: 1071/1071 pruebas aprobadas.
- `npm run build`: aprobado. Requirió permitir la descarga de las fuentes Geist existentes desde Google Fonts.
- `tests/rls/espera-pago.test.ts`: no llegó a ejecutarse; su guardia omitió los 22 casos porque la URL configurada no es local. No se escribieron datos en Supabase.
- E2E: no ejecutado, porque los recorridos crearían pedidos y escribirían en la base compartida. No se modificó ni regeneró ningún QR.

## Pasos para validar en navegador

Después de aplicar la migración en un entorno local de pruebas, iniciar sesión como OWNER o ADMIN y abrir `/admin`. Activar **Cobro anticipado en mesa**; desde el QR de una mesa con sesión abierta, enviar un pedido. Confirmar que el cliente ve **Esperando pago**, que cocina solo incrementa su contador y que caja coloca esa mesa primero con el tiempo de espera. Registrar un pago en efectivo por el total y comprobar que el pedido aparece en cocina. Finalmente, apagar el ajuste desde `/admin`.

La base compartida no se modificó y la migración no se aplicó durante esta validación.
