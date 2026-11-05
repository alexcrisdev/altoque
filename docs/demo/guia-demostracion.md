# Guía de demostración del MVP (US-032)

Guion para presentar AlToque de principio a fin en unos **15 minutos**: QR, carta, pedido,
cocina, mesero, pagos, cierre de cuenta y dashboard. Incluye la preparación, los datos de
prueba, un plan B y las limitaciones conocidas.

- **URL de la demo (producción, rama `main`):** https://altoque-app-usil.vercel.app
- **URL de respaldo (staging, rama `develop`):** https://altoque-app-usil-git-develop-alexandercris-projects.vercel.app
- **Restaurante:** Cevichería Demo (datos ficticios).
- La contraseña de los usuarios demo se comparte por un medio privado del equipo. No se
  escribe en esta guía ni en las diapositivas.

## 1. Preparación (30 minutos antes)

| # | Qué hacer | Cómo comprobarlo |
|---|---|---|
| 1 | Confirmar que producción tiene la última versión de `main` | En Vercel, el último despliegue de producción está en verde |
| 2 | Comprobar la URL publicada | `npm run smoke -- https://altoque-app-usil.vercel.app` termina sin fallos |
| 3 | Preparar **un navegador o perfil por rol**: admin, mesero, cocina y caja | Cada perfil tiene su propia sesión; en el mismo perfil la sesión se comparte entre pestañas |
| 4 | En `/admin/mesas`, pulsar **Generar QR** en la **Mesa 2** y dejar la imagen lista en pantalla o impresa | El QR solo se muestra al generarlo; si se pierde, se vuelve a generar |
| 5 | Comprobar en `/mesero` que la Mesa 2 está **Libre** | Si tiene una sesión abierta de un ensayo, cerrarla desde caja |
| 6 | En `/admin/productos`, todos los productos deben estar **Disponible** | Si alguno quedó **Agotado** en el ensayo, pulsar **Marcar disponible** |
| 7 | Tener a mano un celular con cámara y datos móviles | Abrir la cámara y comprobar que lee un QR |

**No usar la Mesa 5 ni el QR de mostrador del E2E:** están reservados para las pruebas
automáticas y regenerarlos rompe el CI.

## 2. Usuarios demo

| Rol | Correo | Pantalla |
|---|---|---|
| Administrador | `admin@demo.altoque.pe` | `/admin` |
| Dueño | `dueno@demo.altoque.pe` | `/admin` |
| Mesero | `mesero@demo.altoque.pe` | `/mesero` |
| Cocina | `cocina@demo.altoque.pe` | `/cocina` |
| Caja | `caja@demo.altoque.pe` | `/caja` |
| Dueño de otro restaurante | `dueno@polleria.demo` | Pollería Demo (para mostrar el aislamiento) |

## 3. Recorrido de la demostración

### Paso 1 — Presentación (1 min)
El problema: en un restaurante pequeño los pedidos se toman a mano, hay errores al anotar,
el cliente espera al mesero y el dueño no ve qué se vende. AlToque digitaliza ese flujo con
un QR por mesa, sin instalar ninguna app.

### Paso 2 — Administración: carta y QR (1 min) · admin
1. `/admin/productos`: mostrar la carta por categorías (Ceviches, Chicharrones, Bebidas).
2. `/admin/mesas`: mostrar las mesas y el QR de la Mesa 2 ya generado. Explicar que solo se
   guarda la huella del token y que un QR se puede anular.

### Paso 3 — El mesero abre la mesa (30 s) · mesero
En `/mesero`, Mesa 2 → **Abrir sesión**.

### Paso 4 — El cliente pide por QR (2 min) · celular
1. Escanear el QR de la Mesa 2: se abre la **Carta digital** sin descargar nada.
2. Elegir una categoría, abrir un producto y **Agregar al carrito** dos platos y una bebida.
   Escribir una observación (por ejemplo, "sin cebolla").
3. **Ver carrito** → **Confirmar pedido**. Mostrar el **número de pedido** y su estado.

### Paso 5 — Cocina prepara (1 min) · cocina
En `/cocina` aparece el pedido nuevo con la observación. Avanzarlo: aceptar → empezar
preparación → **Marcar listo**. En el celular, el cliente ve cómo cambia el estado.

### Paso 6 — Ayuda y entrega (1 min) · celular y mesero
1. En el celular, pulsar **Llamar al mesero**. En `/mesero` aparece en **Solicitudes de ayuda**.
2. El mesero abre el pedido y pulsa **Confirmar entrega**.

### Paso 7 — Pedido asistido para llevar (1 min) · mesero
Para un cliente sin celular: en `/mesero`, **Registrar pedido asistido** → **Para llevar** →
elegir productos → confirmar. Aparece en cocina igual que los demás.

### Paso 8 — Cobro y cierre de la mesa (3 min) · caja
1. En `/caja` (**Cuentas por cobrar o cerrar**), abrir la Mesa 2. Mostrar el consumo y el
   **Saldo pendiente**.
2. **Yape** por una parte: el pago queda **por verificar**, el saldo no baja y no aparece
   **Cerrar cuenta**. Pulsar **Confirmar recepción**: ahora sí baja el saldo.
3. **Efectivo** por el resto, con un monto recibido mayor: se muestra el vuelto.
4. Con saldo cero aparece **Cerrar cuenta** → **Sí, cerrar cuenta**. Se muestra el resumen
   **Cuenta cerrada**: quién la cerró, fecha y hora, importe final y lo pagado.
5. En `/mesero`, la Mesa 2 vuelve a estar **Libre**.

Opcional, si sobra tiempo: en el pedido para llevar del paso 7, registrar una **tarjeta
rechazada** (el saldo no cambia) y luego una aprobada, y cerrar la cuenta.

### Paso 9 — Dashboard (2 min) · admin
En `/admin/reportes`, con **Desde** y **Hasta** en la fecha de hoy:
- **Ventas:** total cobrado (solo pagos confirmados), cuentas y ticket promedio, por método.
- **Tendencias:** productos más vendidos y pedidos por estado.
Explicar que el Yape por verificar y la tarjeta rechazada no suman a las ventas.

### Paso 10 — Seguridad (1 min)
1. Con el usuario de cocina, intentar entrar a `/admin`: lo envía a **sin acceso**.
2. Abrir `/m/demo-mesa-2` (el QR viejo de la Mesa 2, ya anulado): muestra **Código QR no
   válido** y no deja pedir. `/m/demo-mesa-4` muestra **Mesa no disponible** (mesa desactivada).
3. Opcional: con `dueno@polleria.demo`, el dashboard no muestra datos de la Cevichería.

### Cierre (30 s)
Resumen: pedido sin app, cocina y mesero sincronizados, cobro con varios métodos sin
cerrar cuentas con saldo, y el dueño ve sus ventas el mismo día.

## 4. Plan B

| Si pasa esto | Hacer esto |
|---|---|
| El celular no lee el QR | Abrir el enlace del QR copiado desde `/admin/mesas` en el navegador del celular |
| Falla el internet del aula | Compartir datos desde un celular; como último recurso, mostrar las capturas de `docs/pruebas/evidencias/` |
| Producción no carga | Usar la URL de staging (misma base de datos) |
| La Mesa 2 aparece ocupada | Cerrarla desde caja o usar la Mesa 3 (generar su QR en `/admin/mesas`) |
| Un producto aparece agotado | Admin → **Marcar disponible**, o elegir otro producto |

## 5. Datos de prueba

Todos los datos son ficticios (`supabase/seed.sql` y `scripts/usuarios-demo.mjs`).

| Dato | Contenido |
|---|---|
| Cevichería Demo | 1 local (Local Centro), mesas activas 1, 2, 3 y 5 (la 4 está desactivada) |
| Carta | Ceviches (Ceviche clásico, Ceviche mixto, Leche de tigre), Chicharrones (de pescado, de pota) y Bebidas (Chicha morada, Inca Kola 500 ml) |
| Pollería Demo | Otro restaurante con 2 productos, para mostrar el aislamiento entre restaurantes |
| Usuarios | Los 6 de la sección 2, uno por rol |
| QR | Mesa 1, Mesa 5 y mostrador con tokens privados; Mesas 2 y 3 sin QR hasta generarlo en admin. Los tokens públicos del seed (`demo-mesa-1` a `demo-mesa-4` y `demo-mostrador`) están anulados |
| Historial | Pedidos, pagos y cierres de las pruebas de los sprints, entre ellos 3 ventas demo del 04/11/2026 (S/ 379.00) |

Escenarios que cubren: mesa y para llevar, pedido asistido, ayuda al mesero, producto
agotado, efectivo con vuelto, Yape por verificar/rechazado/confirmado, tarjeta
rechazada/aprobada, cierre ordinario y con excepción, dashboard y acceso por rol.

## 6. Limitaciones conocidas

**Funciones que no están integradas automáticamente:**
- **Pagos:** se registran a mano en caja. No hay conexión con Yape ni con el POS de
  tarjetas; caja confirma el Yape mirando su celular y anota el resultado del POS. No se
  realizan cobros reales.
- **Devoluciones:** si se cancela un pedido ya pagado, la cuenta se cierra con saldo a favor
  del cliente y la devolución se hace por fuera del sistema.
- **Alta de restaurantes y personal:** no tiene pantalla; se hace con
  `scripts/usuarios-demo.mjs` y el seed.
- **Apertura de mesa:** la sesión la abre el mesero; el cliente no puede abrirla solo.
- **Monitoreo:** Sentry y UptimeRobot están previstos, pero no configurados.

**Entorno y datos:**
- Desarrollo, staging y producción usan **la misma base de Supabase** (*altoque-dev*), con
  datos ficticios.
- **Las pruebas automáticas escriben datos reales en esa base** (DEF-008, aceptado con
  riesgo). Cada corrida del CI agrega pagos confirmados de prueba, así que las ventas y
  tendencias del dashboard incluyen datos de pruebas. En la demo se muestra el día de hoy y
  se aclara este punto.
- Caja muestra los pedidos para llevar ya pagados y sin cerrar durante 12 horas.

**Riesgos aceptados para la entrega (ver `docs/pruebas/defectos/registro-defectos.md`):**
- DEF-004: vulnerabilidades moderadas solo en herramientas de desarrollo (ESLint);
  `npm audit --omit=dev` da 0.
- DEF-003: se conserva una función SQL antigua sin uso (`registrar_pedido_qr`), que solo
  puede ejecutar el servidor.

## 7. Ensayo

Antes de la presentación se hace un ensayo completo con esta guía, en producción, y se
registra en `docs/pruebas/evidencias/us032-ensayo.txt`: fecha y hora, URL, commit
desplegado, quién hizo cada rol, resultado de cada paso y cualquier bloqueo. El ensayo se
da por bueno si los pasos 2 a 10 se completan sin bloqueos críticos.
