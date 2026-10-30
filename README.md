# AlToque

Plataforma web de **pedidos por QR** para restaurantes MYPE de Lima. El cliente escanea el QR de su mesa, ve la carta, arma su pedido y lo envía directo a cocina, sin descargar ninguna app. El pago se hace al final, en efectivo, Yape o tarjeta.

Proyecto del curso, USIL, 2026.

## Qué resuelve

Los restaurantes pequeños pierden tiempo y ventas por la toma manual de pedidos: errores al anotar, espera por el mesero y poca visibilidad de lo que pasa en cocina y caja. AlToque digitaliza ese flujo sin cambiar la forma de trabajar del local.

## Roles

| Rol | Qué hace |
|---|---|
| Cliente | Escanea el QR, elige modalidad, arma el pedido, pide ayuda y ve el estado |
| Mesero | Abre mesas, atiende alertas, entrega pedidos y puede pedir en modo asistido |
| Cocina / barra | Recibe los pedidos y actualiza su estado |
| Cajero | Registra pagos y cierra la cuenta |
| Dueño / admin | Gestiona mesas, QR, carta y personal, y consulta el dashboard |

### Permisos del personal

Las políticas RLS separan los datos por restaurante. La aplicación comprueba además el rol antes de mostrar cada panel.

| Rol | Panel | Permisos de la matriz |
|---|---|---|
| OWNER | `/admin` | Gestionar restaurante, atender mesas, gestionar pedidos y registrar pagos |
| ADMIN | `/admin` | Gestionar restaurante, atender mesas, gestionar pedidos y registrar pagos |
| WAITER | `/mesero` y `/caja` | Atender mesas y registrar pagos |
| KITCHEN | `/cocina` | Gestionar pedidos |
| CASHIER | `/caja` | Registrar pagos |

El acceso a `/m/<token>` sigue siendo público para clientes que escanean el QR. Las páginas privadas requieren una sesión de Supabase y validan el rol también en el servidor.

## Stack

| Etapa | Herramienta |
|---|---|
| Plan | Jira |
| Código | Git + GitHub, VS Code |
| App | Next.js (App Router), React, TypeScript, Tailwind CSS |
| Datos | Supabase: PostgreSQL, Auth, Realtime y RLS |
| Pruebas | Vitest (unitarias e integración RLS); Playwright pendiente para pruebas de extremo a extremo |
| CI | GitHub Actions |
| Despliegue | Vercel |
| Monitoreo | Sentry y UptimeRobot (previstos; configuración pendiente de verificar) |

## Cómo correrlo

Requisitos: **Node.js 22** (la misma versión que usa el CI) y **Git**.

```bash
git clone https://github.com/alexcrisdev/altoque.git
cd altoque
npm install
cp .env.example .env.local
npm run dev
```

Abre http://localhost:3000. Las claves de Supabase se piden al equipo por un medio privado y se ponen en `.env.local`. **Nunca se suben al repositorio.**

### Variables de entorno

| Variable | Para qué sirve |
|---|---|
| `NEXT_PUBLIC_APP_URL` | URL base que va dentro de los QR |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servidor (nunca en el navegador) |
| `DEMO_PASSWORD` | Contraseña ficticia para preparar usuarios demo y ejecutar pruebas RLS en desarrollo |

### Entornos

| Entorno | Dónde corre | Rama | Base de datos | Para qué |
|---|---|---|---|---|
| Desarrollo | PC de cada integrante (`npm run dev`) | `dev/<nombre>` | Supabase *altoque-dev* | Programar y probar cada historia |
| Pruebas (staging) | Vercel | `develop` | Supabase *altoque-dev* | Probar la integración antes de entregar |
| Producción | Vercel | `main` | Supabase *altoque-dev* | Versión que se presenta |

Las claves de desarrollo van en `.env.local`. Las de staging y producción se configuran en Vercel. Para el MVP todos los entornos comparten la base *altoque-dev*, que solo tiene datos ficticios. Cómo publicar, comprobar y revertir: [docs/despliegue.md](docs/despliegue.md).

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta el proyecto en desarrollo |
| `npm run build` | Compila para producción |
| `npm run lint` | Revisa errores de código |
| `npm run typecheck` | Genera los tipos de Next.js y verifica TypeScript |
| `npm test` | Ejecuta las pruebas unitarias de permisos |
| `npm run test:rls` | Ejecuta las pruebas de aislamiento en Supabase; requiere preparar los datos y usuarios demo |
| `npm run smoke -- <url>` | Comprueba una URL publicada: páginas, login, rutas protegidas y cabeceras de seguridad |

## Base de datos

El esquema vive en `supabase/migrations/` y se aplica con la Supabase CLI (incluida en el proyecto).

### Primera vez

```bash
npx supabase login
npx supabase link --project-ref <ref-del-proyecto>   # pedir el ref y la contraseña al equipo
```

### Comandos

| Comando | Qué hace |
|---|---|
| `npx supabase migration new <nombre>` | Crea un archivo de migración vacío |
| `npx supabase db push --linked` | Aplica las migraciones nuevas al proyecto enlazado |
| `npx supabase db reset --linked` | **Borra todo** y reconstruye desde cero: migraciones + `seed.sql` (solo en *altoque-dev*) |
| `npx supabase migration list --linked` | Muestra qué migraciones están aplicadas |

### Reglas

- Todo cambio al esquema es una **migración nueva**. Nunca se edita una que ya se subió.
- Todas las tablas tienen RLS activado. Las políticas de acceso de US-028 están implementadas en `supabase/migrations/20261025213951_politicas_rls.sql`.
- Los tokens de QR se guardan solo como hash SHA-256 (`qr_codes.token_hash`).

### Datos de prueba (`supabase/seed.sql`)

Sin información personal real. Incluye *Cevichería Demo* (1 local, 4 mesas y 7 productos) y *Pollería Demo* (1 local, 2 mesas y 2 productos) para probar el aislamiento entre restaurantes.

| Token para `/m/<token>` | Caso |
|---|---|
| `demo-mesa-1`, `demo-mesa-2`, `demo-mesa-3` | QR de mesa válido |
| `demo-mesa-4` | QR anulado (mesa desactivada) |
| `demo-mostrador` | QR de mostrador (para llevar) |

### Usuarios demo y pruebas

Después de cargar el seed en el entorno de desarrollo, agrega una contraseña de prueba en `.env.local` como `DEMO_PASSWORD=...`. Usa una contraseña ficticia segura y no la subas al repositorio. Ejecuta `node --env-file=.env.local scripts/usuarios-demo.mjs` para crear o completar los seis usuarios demo. El script usa la clave secreta solo en Node, no imprime credenciales y se puede repetir.

| Correo | Restaurante | Rol |
|---|---|---|
| `dueno@demo.altoque.pe` | Cevichería Demo | OWNER |
| `admin@demo.altoque.pe` | Cevichería Demo | ADMIN |
| `mesero@demo.altoque.pe` | Cevichería Demo | WAITER |
| `cocina@demo.altoque.pe` | Cevichería Demo | KITCHEN |
| `caja@demo.altoque.pe` | Cevichería Demo | CASHIER |
| `dueno@polleria.demo` | Pollería Demo | OWNER |

`npm test` ejecuta los casos unitarios de permisos. `npm run test:rls` ejecuta pruebas de integración contra el proyecto enlazado; requiere `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `DEMO_PASSWORD` en `.env.local`, además del esquema y usuarios demo preparados.

### Sesión de mesa

Para pedidos en mesa, el mesero abre la sesión desde `/mesero`; después el cliente escanea el QR, consulta la carta y realiza su pedido. Al terminar, el mesero cierra la sesión desde el mismo panel. En el MVP, la sesión la abre el mesero.

Para probarlo en desarrollo, inicia sesión en `/login` como `mesero@demo.altoque.pe` con la contraseña ficticia configurada en `DEMO_PASSWORD`, abre una mesa y visita `/m/demo-mesa-1`. Si la mesa no tiene sesión abierta, la carta sigue visible y se indica pedir ayuda al personal. El QR de mostrador `/m/demo-mostrador` no necesita sesión.

## CI/CD

El workflow **CI** de GitHub Actions se ejecuta en los Pull Requests hacia `develop` y `main`, y en cada push a esas ramas. Con Node.js 22, instala las dependencias con `npm ci` y ejecuta, en orden, npm run lint, npm run typecheck, npm test y npm run build para revisar el código, verificar los tipos, correr las pruebas unitarias y comprobar que la aplicación compila. El check se llama verificar. Las pruebas RLS (npm run test:rls) no corren en CI porque necesitan la base de datos; se ejecutan localmente. Las ejecuciones anteriores del mismo PR se cancelan cuando llega una nueva.

| Origen | Entorno en Vercel |
|---|---|
| Pull Request (PR) | Vista previa (Preview) para revisar los cambios |
| `develop` | Staging con URL fija |
| `main` | Producción |

URL de staging: https://altoque-app-usil-git-develop-alexandercris-projects.vercel.app

Las variables de entorno de staging y producción se configuran en Vercel, no en el repositorio. El CI compila sin secretos y usa `NEXT_PUBLIC_APP_URL=http://localhost:3000` para el build.

Para ver el resultado de una ejecución, abre la pestaña **Actions** del repositorio en GitHub y selecciona el workflow **CI**, o revisa los **checks** del PR y abre `verificar`. Allí puedes consultar el estado y el detalle de cada paso.

## Estructura

```
src/
├── app/            rutas y pantallas (Next.js)
├── features/       lógica separada por funcionalidad
│   ├── auth/           login, roles y permisos
│   ├── acceso-qr/      mesas, QR y sesión de mesa
│   ├── carta/          productos, categorías y carrito
│   ├── pedidos/        confirmación, estados e historial
│   ├── mesero/         panel del mesero
│   ├── cocina/         cocina y barra
│   ├── pago-cierre/    pagos y cierre de cuenta
│   └── dashboard/      panel del dueño
└── lib/            utilidades compartidas
```

Regla: la pantalla (`page.tsx`) llama a una acción de servidor (`actions.ts`), que valida el rol y las reglas, y usa la capa de datos, la única que habla con Supabase.

## Flujo de trabajo

- `main`: versión estable que se entrega. Se actualiza al cerrar cada sprint.
- `develop`: integración de los avances de todos.
- `dev/<nombre>`: rama personal de cada integrante.
- Commits con el código de la historia: `US-001: descripción corta`.
- Todo cambio llega a `develop` por Pull Request con 1 aprobación (merge commit, sin squash).

Backlog y sprints en Jira (proyecto *ALTOQUE - PFC3*).

## Equipo

- Alexander Crisóstomo Guzmán
- Fabrizio Huamán Vargas
- Erick Jáuregui Meneses
- Alina Miranda Pinto
- Verónica Rosales Monago
