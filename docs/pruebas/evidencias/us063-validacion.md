# US-063 · Validación

**Historia:** No cerrar una mesa con pedidos sin entregar ni cambiarlos después del cierre.
**Responsable:** Alexander · **Sprint 7** · **Fecha:** 13/11/2026

## Qué cambió

- Migración `supabase/migrations/20261113223919_us063_cierre_con_pedidos_entregados.sql`:
  - `private.pedidos_sin_entregar_sesion`: indica si la mesa tiene pedidos `PENDING`, `ACCEPTED`, `IN_PROGRESS` o `READY`.
  - `private.impedir_cierre_con_saldo` (trigger de `table_sessions`): además de Yape por verificar y saldo, rechaza el cierre con `PEDIDOS_SIN_ENTREGAR`. Es el mismo trigger para los dos caminos: `cerrar_cuenta` (caja, también la excepción del dueño) y el botón «Cerrar mesa» del mesero.
  - `private.impedir_cambios_cuenta_cerrada`: ahora también protege los pagos y productos de una **mesa** cerrada (antes solo los pedidos para llevar).
  - Trigger nuevo `orders_us063_impedir_mesa_cerrada`: un pedido de una mesa cerrada no se modifica, no se cancela, no cambia de estado y no se agregan pedidos a esa mesa (`ACCOUNT_CLOSED`).
  - Los pedidos para llevar no cambian: se pagan antes (US-085) y cocina los sigue preparando aunque su cuenta esté cerrada.
- App: caja muestra «Hay pedidos sin entregar…» antes de intentar cerrar una mesa y traduce el rechazo de la base; el mesero ve «Hay pedidos sin entregar. Entrégalos o cancélalos antes de cerrar la mesa.»; cambiar estado o modificar un pedido de una mesa cerrada muestra «La cuenta de esta mesa ya se cerró…».

## Criterios de aceptación

| Criterio | Cómo se comprobó | Resultado |
|---|---|---|
| `cerrar_cuenta` y el cierre directo del mesero rechazan una mesa con pedidos en preparación o listos («Hay pedidos sin entregar») | `cierre.test.ts`: pagada con pedido `IN_PROGRESS` y luego `READY` → caja y mesero reciben `PEDIDOS_SIN_ENTREGAR`; al entregarlo, cierre ordinario OK. Excepción del admin también rechazada y sin cierre a medias | Aprobado |
| El bloqueo después del cierre también protege los pedidos de mesa | `cierre.test.ts`: con la clave de servicio (salta RLS), actualizar el pedido o un producto de la mesa cerrada → `ACCOUNT_CLOSED` | Aprobado |
| No se puede modificar ni cancelar un pedido cuya mesa ya cerró | `cierre.test.ts`: el mesero intenta cancelarlo → rechazado y sigue `DELIVERED`; `estado-actions.test.ts`: mensaje claro | Aprobado |
| Pruebas RLS/integración | 4 casos nuevos en `tests/rls/cierre.test.ts` (15/15 en el archivo) | Aprobado |
| Matriz de trazabilidad de US-020 actualizada | Fila US-020 (nueva regla y conteos) y fila US-063 | Aprobado |

## Ejecución

Base: Supabase **local** (Docker, `npx supabase start`) con todas las migraciones + `seed.sql` y usuarios demo creados con `scripts/usuarios-demo.mjs`. No se tocó la base compartida.

```
npx supabase start                      -> 20261113223919_us063_cierre_con_pedidos_entregados.sql aplicada sin errores
npm run test:integracion (base local)   -> 12 archivos, 78/78 aprobados
npx vitest run tests/rls/cierre.test.ts -> 15/15 aprobados (incluye el caso con clave de servicio)
npm test                                -> 58 archivos, 942/942 aprobados
```

Después de las pruebas quedaron 0 mesas abiertas en la base local (la limpieza funciona con la regla nueva: cancela antes de cerrar).

## Cómo probarlo en el navegador (después de aplicar la migración)

1. Mesero: abrir una mesa y registrar un pedido (entra a cocina).
2. Caja: cobrar todo en efectivo → la cuenta muestra «Hay pedidos sin entregar…» y no ofrece cerrar.
3. Mesero: «Cerrar mesa» → «Hay pedidos sin entregar. Entrégalos o cancélalos antes de cerrar la mesa.»
4. Cocina: marcar Listo; mesero: Confirmar entrega → ahora caja puede cerrar la cuenta.
5. Con la mesa cerrada, intentar cancelar o modificar ese pedido → rechazado.
