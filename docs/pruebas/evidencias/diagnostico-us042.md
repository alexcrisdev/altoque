# US-042: diagnóstico y verificación de accesibilidad

Verónica · 03/11/2026 · Chrome local, compilación de producción en `http://localhost:3005`.
Se usó un puerto independiente para conservar el servidor de desarrollo existente.

## Lighthouse antes y después

Auditorías reales desde el panel Lighthouse de Chrome DevTools, modo Navegación y categoría Accesibilidad, con las sesiones demo conservadas. No se instalaron paquetes. Versión de Lighthouse: 13.5.0.

| Pantalla | Antes | Después | Evidencia HTML |
|---|---|---|---|
| Carta del comensal | 100 | 100 | [Antes](lighthouse-us042-carta-antes.html) · [Después](lighthouse-us042-carta-despues.html) |
| Estado del pedido | 100 | 100 | [Antes](lighthouse-us042-estado-pedido-antes.html) · [Después](lighthouse-us042-estado-pedido-despues.html) |
| Login | 100 | 100 | [Antes](lighthouse-us042-login-antes.html) · [Después](lighthouse-us042-login-despues.html) |
| Mesero | 100 | 100 | [Antes](lighthouse-us042-mesero-antes.html) · [Después](lighthouse-us042-mesero-despues.html) |
| Cocina | 100 | 100 | [Antes](lighthouse-us042-cocina-antes.html) · [Después](lighthouse-us042-cocina-despues.html) |
| Caja | 100 | 100 | [Antes](lighthouse-us042-caja-antes.html) · [Después](lighthouse-us042-caja-despues.html) |
| Administración | 100 | 100 | [Antes](lighthouse-us042-admin-antes.html) · [Después](lighthouse-us042-admin-despues.html) |

El puntaje inicial ya era 100. Esto no significa que todos los controles cumplieran la altura de 44 px exigida por la historia. Cocina también tenía una advertencia sin peso en el puntaje: el texto visible «Aceptar pedido» no estaba incluido de forma literal en el nombre accesible «Aceptar el pedido». Se corrigió; el reporte posterior no registra esa advertencia.

El primer intento de medir administración terminó en login por una sesión invalidada durante el diagnóstico. Ese resultado se descartó y se repitió antes de cambiar código, verificando la URL final `/admin`. Los informes de esta carpeta son los válidos.

## Revisión de tamaños y pantallas

Se revisaron 15 pantallas a 360, 768, 1024 y 1280 px: carta, estado del pedido, login, mesero, creación del pedido, detalle de mesero, cocina, caja, administración, mesas, productos, pedidos, detalle administrativo, configuración para llevar y reportes.

Las medidas iniciales detectaron enlaces de detalle de 18 px; controles de edición de cantidades y observaciones de 40 px; 62 controles/enlaces pequeños en productos, 31 en pedidos y 3 en configuración para llevar, según los datos demo disponibles. Se ajustaron clases, distribución y foco visible. Después no se detectaron controles táctiles menores de 44 px ni desbordes horizontales en los escenarios medidos. Las casillas conservan su tamaño visual y tienen una etiqueta táctil de al menos 44 px.

También se abrieron detalles editables del pedido existente N.º 16 para mesero y administrador: los 9 controles pequeños de cada pantalla quedaron corregidos. Se abrió un detalle de producto y el carrito a 360 px, incluyendo una observación larga, sin enviar el formulario ni confirmar pedidos.

- [Medidas iniciales](diagnostico-us042-antes.json) y [posteriores](diagnostico-us042-despues.json).
- [Edición y carrito antes](diagnostico-us042-edicion-antes.json) y [después](diagnostico-us042-edicion-despues.json).
- [Comensal a 360 px](captura-us042-carta-360-despues.png), [cocina a 768 px](captura-us042-cocina-768-despues.png) y [administración a 1280 px](captura-us042-admin-1280-despues.png).

## Carga, vacío, error y teclado

Se conservaron los límites Suspense existentes. Los mensajes de carga que carecían de anuncios ahora tienen `role="status"` y `aria-busy="true"`. Los avisos de QR inválido/deshabilitado conservan su contenido y ahora incluyen un título principal.

Se agregó una frontera de error con MensajeEstado y el botón Reintentar, usando `retry` de esta versión de Next.js. Se simuló el error únicamente en la frontera de React del navegador, sin provocar fallos en Supabase. Tab enfocó Reintentar (50 px de alto y contorno de 2 px); Enter recuperó el formulario de login. No se presentan detalles internos del error.

El vacío real se verificó consultando reportes del 01/01/1900, sin ventas, sin alterar su implementación ni los datos.

- [Error recuperable](captura-us042-error.png).
- [Vacío real](captura-us042-vacio.png).
- [Resultado de teclado y estados](diagnostico-us042-estados.json).

## Comprobaciones

| Comando | Resultado |
|---|---|
| `npm run lint` | Sin errores |
| `npm test` | 527/527 pruebas, 27 archivos; 5 casos nuevos de accesibilidad |
| `npm run build` | Compilación de producción correcta |
| `npx tsc --noEmit` | Sin errores |
| `npm run start -- --port 3005` y `npm run smoke -- http://localhost:3005` | 8/8 |

## Alcance y observaciones

Los cambios son de presentación y accesibilidad. No se cambiaron acciones, consultas, permisos, precios, pagos, estados de pedidos ni migraciones. No se crearon ni actualizaron pedidos de demostración. Se usó `demo-mesa-2` y un pedido existente; `demo-mesa-1` estaba deshabilitado y se conservó así.

En caja solo se agregaron atributos de accesibilidad a tres mensajes de carga. No se modificaron `src/features/pago-cierre`, `src/app/admin/reportes` ni `src/features/dashboard`. El reporte vacío se usó únicamente para comprobar su presentación. No se probaron pagos ni cierres de cuentas.

Los resultados corresponden a las vistas, datos demo y tamaños descritos, con emulación de pantalla en Chrome de escritorio. No sustituyen una prueba en dispositivos físicos, un recorrido con lector de pantalla ni una auditoría manual completa de WCAG. El error de servidor se simuló en navegador; no se provocó una caída real del servicio.
