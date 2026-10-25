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

## Stack

| Etapa | Herramienta |
|---|---|
| Plan | Jira |
| Código | Git + GitHub, VS Code |
| App | Next.js (App Router), React, TypeScript, Tailwind CSS |
| Datos | Supabase: PostgreSQL, Auth, Realtime y RLS |
| Pruebas | Vitest (unitarias) y Playwright (extremo a extremo) |
| CI | GitHub Actions |
| Despliegue | Vercel |
| Monitoreo | Sentry y UptimeRobot |

## Cómo correrlo

Requisitos: **Node 20 o superior** y **Git**.

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

### Entornos

| Entorno | Dónde corre | Rama | Base de datos | Para qué |
|---|---|---|---|---|
| Desarrollo | PC de cada integrante (`npm run dev`) | `dev/<nombre>` | Supabase *altoque-dev* | Programar y probar cada historia |
| Pruebas (staging) | Vercel | `develop` | Supabase *altoque-staging* | Probar la integración antes de entregar |
| Producción | Vercel | `main` | Se define en el Sprint 4 | Versión que se presenta |

Las claves de desarrollo van en `.env.local`. Las de staging y producción se configuran en Vercel.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta el proyecto en desarrollo |
| `npm run build` | Compila para producción |
| `npm run lint` | Revisa errores de código |

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