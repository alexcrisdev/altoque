# US-091: declaración de alergias antes del pedido

## Implementación

El carrito pregunta No/Sí sin respuesta inicial. Sí exige un alérgeno de la lista
o un detalle de hasta 120 caracteres, además de la aceptación de esta declaración:

> Entiendo que la cocina hará lo posible por evitar el alérgeno, pero puede haber trazas.

La validación se repite en el servidor. No se almacena la aceptación como un dato
adicional ni se redacta una renuncia. Se solicita no escribir datos personales en
el detalle. La declaración no se guarda en localStorage ni se exporta a CSV o n8n.

La nueva migración agrega allergy_answer, allergens y allergy_note. Reemplaza
explícitamente las firmas del RPC cliente y de su función interna. Los campos se
insertan junto con el pedido; los reintentos no actualizan el pedido ya registrado.
Se conservan los bloqueos de stock, permisos, triggers de pago e historial y el
registro del mesero. Los pedidos históricos y asistidos mantienen respuesta null.

## Verificación automatizada

- `npm.cmd run lint`: aprobado.
- `npm.cmd run typecheck` (incluye `tsc --noEmit`): aprobado.
- `npm.cmd test`: **973/973 pruebas en 61/61 archivos**, sin fallos.
- `npm.cmd run build`: aprobado, 25 páginas. El primer intento falló al descargar
  Google Fonts; el reintento con acceso de red completó la compilación.
- `git diff --check`: sin errores.
- Comparación del SQL con sus fuentes: bloqueo advisory idéntico; cuerpo de registro
  original conservado salvo la validación y las columnas nuevas. Esto no sustituye
  ejecutar la migración en PostgreSQL.

- Unitarias: validación, etiquetas, aviso, bloqueo de confirmación, reintentos,
  envío conjunto de parámetros RPC, lectura de cocina, renderizado KDS normal/TV
  y caja, y exclusión de los campos de CSV y n8n.
- Integración preparada: `tests/rls/alergias.test.ts`, seis casos solo para Supabase
  local. La ejecución omitió los seis por falta de configuración local. No es una
  aprobación de la migración ni de RLS.
- E2E: el ayudante compartido comprueba que el botón esté bloqueado antes de
  responder No. El caso nuevo de `pedido-en-mesa.spec.ts` usa Sí y comprueba cocina
  y mesero. `playwright test --list` reconoce 20 casos en ocho archivos; no los ejecuta.
- No se ejecutaron E2E ni escrituras sobre la base compartida.

## Capturas y prueba visual

Capturas reales del navegador en localhost con componentes reales y **datos
ficticios**, mediante una página temporal eliminada al terminar. No son evidencia
de un pedido persistido ni de la aplicación de la migración.

- [Carrito: selección](us091-carrito-alergenos.png).
- [Carrito: aceptación y confirmar](us091-carrito-aceptacion.png).
- [KDS: declaración separada de los alérgenos del plato](us091-kds.png).
- [Caja: aviso en el pedido](us091-caja.png).

Playwright/Edge comprobó en 390×844: botón bloqueado sin respuesta; No habilita;
Sí bloquea hasta seleccionar y aceptar; Confirmar alcanzable mediante clic de
prueba, sin ejecutar la acción. KDS y caja se comprobaron en 1280×900. Se bloquearon
peticiones POST durante la prueba. El selector exacto del texto del aviso se corrigió
para contemplar el icono que forma parte de la insignia.

## Pendientes antes de dar la historia por validada de extremo a extremo

1. Aplicar la migración en un Supabase local o entorno expresamente autorizado.
2. Ejecutar los seis casos RLS/integración y regresiones de stock/US-085.
3. Ejecutar E2E con pedidos demo propios y limpieza: No, Sí, cocina, mesero y caja.
4. Comprobar móvil físico/teclado y obtener capturas con pedidos persistidos.

No se han modificado .env.local, políticas RLS ni QR. No se han creado commits,
push ni PR de US-091.
