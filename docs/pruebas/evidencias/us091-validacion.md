# US-091: declaración de alergias antes del pedido

Fecha de validación: **15/11/2026 (America/Lima)** · Rama `dev/veronica` con develop
unido (incluye US-063, US-090, US-094 y US-097).

## Implementación

El carrito pregunta «¿Alguien tiene alergias?» sin respuesta inicial. La respuesta
elegida se resalta (tono info + ✓). «Sí» exige un alérgeno de la lista (maní,
mariscos, pescado, gluten, lácteos, huevo) o un detalle de hasta 120 caracteres,
además de aceptar esta declaración informativa:

> Entiendo que la cocina hará lo posible por evitar el alérgeno, pero puede haber trazas.

No es una renuncia de responsabilidad (Ley 29571, art. 50). La obligación de responder
la exige el servidor (`actions.ts` con `src/features/pedidos/alergias.ts`). La base
valida el contenido de la declaración (`INVALID_ALLERGY`).
Se pide no escribir datos personales en el detalle. La declaración no se guarda en
localStorage ni se exporta a CSV ni al aviso de n8n.

Migración `20261115232805_us091_alergias_pedido.sql` (fecha posterior a las de
US-097): agrega `allergy_answer`, `allergens` y `allergy_note` a `orders` con sus
checks, y reemplaza (DROP + CREATE) `registrar_pedido_cliente` y
`registrar_pedido_cliente_sin_bloqueo_stock` con tres parámetros nuevos. El cuerpo
se comparó con `diff` contra la definición original: bloqueo de stock, idempotencia
y la rama `if v_order.id is null` (que devuelve `pedido_id` null cuando el trigger
de US-097 omite la fila) quedan idénticos; se conservan `security definer`,
`search_path`, grants y revokes. `registrar_pedido_mesero` no cambia (respuesta null).

**Compatibilidad (pedido de Alexander):** los tres parámetros nuevos tienen
`default null` en las dos funciones. Así, el código que hoy está en producción, que
llama con 6 parámetros, sigue registrando pedidos QR mientras se despliega el
código nuevo. Una respuesta null solo se acepta si no vienen alérgenos ni detalle,
y el pedido queda con `allergy_answer` null, igual que los del mesero.

El aviso se ve en rojo (Insignia tono peligro + ⚠ + texto «Alergia: Maní — detalle»)
en el KDS (normal y TV), en el panel del mesero y en el detalle de la cuenta en caja,
separado de los alérgenos de cada producto.

## Verificación automatizada (15/11/2026)

| Comando | Resultado |
| --- | --- |
| `npm run lint` | Aprobado |
| `npx eslint src tests scripts` | Aprobado, sin errores |
| `npm run typecheck` | Aprobado |
| `npm test` | **1149/1149 pruebas en 70/70 archivos** (con develop unido, incluye US-088) |
| `npm run build` | Aprobado |
| `npm run test:integracion` | **No ejecutado**: no hay Docker para Supabase local |
| E2E (Playwright) | **No ejecutado**: escribiría en la base compartida |

- Unitarias: validación y etiquetas, botón bloqueado sin respuesta, envío conjunto
  de parámetros al RPC, reintentos, lectura de cocina, KDS normal/TV, caja, y
  exclusión de los campos en CSV y n8n.
- Integración preparada `tests/rls/alergias.test.ts` (7 casos, solo Supabase local,
  con sucursal y QR propios que se borran en `afterAll`):
  - pedido con alergia → el rol KITCHEN la lee; repetir la clave no cambia la declaración;
  - datos inválidos (alérgeno fuera de la lista, detalle vacío, más de 120 caracteres)
    → `INVALID_ALLERGY`;
  - grupo «sin respuesta (compatibilidad)»: sin los parámetros de alergia el pedido
    se crea con `allergy_answer` null; respuesta null con alérgenos o solo con detalle
    → `INVALID_ALLERGY` y no se crea el pedido.
- Unitaria `registrar-pedido.test.ts`: `actions.ts` rechaza un pedido sin respuesta
  (ausente o null) sin consultar ni guardar.
- `tests/rls/vencimiento-pedidos.test.ts` (US-097) y `tests/rls/espera-pago.test.ts`
  se ajustaron para enviar `p_alergia_respuesta: "NONE"`. Los casos de US-097 que
  esperan `pedido_id: null` al superar el límite sirven también para comprobar que la
  migración conserva esa rama.
- E2E: el ayudante `prepararCarrito` comprueba que «Confirmar pedido» está desactivado
  antes de responder y responde «No» (lo usan todos los casos que envían pedidos).
  El caso nuevo de `pedido-en-mesa.spec.ts` responde «Sí» (Maní + detalle + aceptar)
  y comprueba el aviso en cocina y en el mesero.

## Capturas

Capturas de navegador en localhost con componentes reales y **datos ficticios**
(sin pedido guardado en la base):

- [Carrito: selección de alérgenos](us091-carrito-alergenos.png)
- [Carrito: aceptación y confirmar](us091-carrito-aceptacion.png)
- [KDS: declaración separada de los alérgenos del plato](us091-kds.png)
- [Caja: aviso en el pedido](us091-caja.png)

Carrito comprobado a 390×844; KDS y caja a 1280×900.

## Pendiente antes de aplicar la migración (Alexander)

La migración **no se probó en Supabase local** porque Verónica no tiene Docker
funcionando. Antes de aplicarla a la base compartida:

1. `npx supabase start` y `npx supabase db reset` (local) para aplicar todas las migraciones.
2. `npm run test:integracion` contra `http://127.0.0.1:54321`: deben pasar
   `alergias.test.ts`, `vencimiento-pedidos.test.ts` y `espera-pago.test.ts`.
3. E2E en local: `pedido-en-mesa.spec.ts`, `pedido-para-llevar.spec.ts` y `conexion.spec.ts`.
4. Gracias a los `default null`, la migración puede aplicarse antes de desplegar el
   código nuevo: los pedidos QR siguen entrando (sin declaración de alergia) hasta
   que el código nuevo esté en producción.

No se modificaron `.env.local`, políticas RLS ni QR existentes.
