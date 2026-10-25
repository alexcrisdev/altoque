# Reglas del proyecto AlToque (para asistentes de IA)

Quien te habla puede NO saber programar. Explica en español simple lo que hiciste
y por qué, y nunca hagas pasos de Git o base de datos sin decir qué hacen.

## Qué es
Plataforma de pedidos por QR para restaurantes MYPE. Flujo y alcance en README.md.
Backlog en Jira (proyecto ALTOQUE - PFC3). Solo trabaja en la historia que te pidan.

## Stack
Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4 · Supabase (PostgreSQL, Auth,
Realtime, RLS) · Vercel (deploy) · GitHub Actions (CI) · Vitest y Playwright (pruebas).
No agregues librerías nuevas sin que el usuario lo apruebe.

## Arquitectura (obligatoria)
- Pantallas en `src/app/**/page.tsx`. No acceden a datos directo.
- Lógica por funcionalidad en `src/features/<feature>/`
  (auth, acceso-qr, carta, pedidos, mesero, cocina, pago-cierre, dashboard):
  - `actions.ts` → acciones de servidor ("use server"): validan rol y reglas.
  - archivo de datos (ej. `mesas.ts`) → única capa que habla con Supabase.
- Utilidades compartidas en `src/lib/`.
- Flujo: page.tsx → actions.ts → capa de datos → Supabase.

## Reglas de negocio que no se rompen
- El servidor recalcula precios y totales; nunca confíes en datos del navegador.
- Cada acción de servidor verifica el rol del usuario (staff_memberships).
- Todo dato pertenece a un restaurante: filtra siempre por restaurante y respeta RLS.
- Los tokens QR se guardan solo como hash (qr_codes), nunca en texto plano.
- Confirmar pedido es idempotente (misma clave = mismo pedido).

## Base de datos
- Cambios al esquema SOLO con migraciones nuevas en `supabase/migrations/` (Supabase CLI).
- Nunca edites una migración ya subida; crea otra.
- Nunca uses SUPABASE_SERVICE_ROLE_KEY en código que llegue al navegador.

## Git (obligatorio)
- Trabaja en la rama personal `dev/<nombre>`. Nunca hagas commit en `main` ni `develop`.
- Mensaje de commit: `US-xxx: descripción corta en español` (ej. `US-004: lista de productos por categoría`).
  No uses claves de Jira (ALTOQUE-xx).
- Commits pequeños, uno por avance lógico.
- Los cambios llegan a `develop` por Pull Request con 1 aprobación. No hagas merge tú.
- Nunca `git push --force`, nunca borres ramas, nunca hagas squash.
- Nunca subas `.env.local` ni claves.

## Antes de decir "terminé"
1. `npm run lint` sin errores.
2. `npm run build` compila.
3. Pruebas (cuando existan): `npm test`.
4. Explica al usuario qué archivos cambiaste y cómo probarlo en el navegador.