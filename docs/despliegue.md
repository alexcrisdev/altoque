# Publicación y reversión de AlToque

Guía de la tarea **US-029: Preparar la publicación de la plataforma**. Explica dónde corre la app, cómo se publica cada cambio, cómo se comprueba que quedó bien y qué hacer si algo sale mal.

## Entornos

| Entorno | URL | Rama | Se publica cuando… |
|---|---|---|---|
| Desarrollo | `http://localhost:3000` | `dev/<nombre>` | Cada integrante ejecuta `npm run dev` |
| Vista previa | URL única que Vercel comenta en cada PR | la rama del PR | Se abre o actualiza un Pull Request |
| Pruebas (staging) | https://altoque-app-usil-git-develop-alexandercris-projects.vercel.app | `develop` | Se une un PR a `develop` |
| Producción | https://altoque-app-usil.vercel.app | `main` | Se une el PR `develop → main` al cerrar el sprint |

**Base de datos (verificado el 30/10/2026):** los cuatro entornos usan el mismo proyecto de Supabase, *altoque-dev*. Por eso:

- Una migración aplicada en *altoque-dev* afecta al instante a staging y a producción. Solo se aplican migraciones que **agregan** (tablas, columnas, estados) y no rompen el código que ya está publicado.
- Los pedidos de prueba que se hacen en staging también aparecen en producción.
- Ver [Limitaciones conocidas](#limitaciones-conocidas).

## Variables y credenciales

| Variable | Dónde se configura | ¿Llega al navegador? |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Vercel (Production y Preview) y `.env.local` | Sí (va dentro del QR) |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel y `.env.local` | Sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel y `.env.local` | Sí (es pública; RLS protege los datos) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel y `.env.local` | **No.** Solo se usa en `src/lib/supabase/admin.ts`, marcado `server-only` |
| `DEMO_PASSWORD` | Solo `.env.local` | No. Solo sirve para crear usuarios demo y pruebas RLS |

Reglas:

- Las claves nunca se suben al repositorio. `.env.local` está en `.gitignore` y el repositorio solo tiene `.env.example`, sin valores.
- En el CI se usan valores de relleno (`placeholder`), así que el build no necesita claves reales.
- Si una clave se compartió por un medio no privado, se rota en Supabase (**Settings → API keys**) y se actualiza en Vercel y en `.env.local`.

## Cómo se publica un cambio

```
dev/<nombre> ──PR──► develop ──(cierre de sprint) PR──► main
     │                  │                                  │
  CI "verificar"     staging                          producción
  + vista previa     + smoke                          + smoke
  + smoke
```

1. **Pull Request a `develop`.** GitHub Actions ejecuta el job `verificar` (lint, tipos, pruebas unitarias y build) y Vercel publica una vista previa. Si `verificar` falla, el PR no se puede unir porque la rama está protegida.
2. **Migraciones.** Si el PR trae una migración nueva en `supabase/migrations/`, Alexander revisa el SQL y la aplica **antes** de unir el PR:
   ```bash
   npx supabase migration list --linked   # ver qué falta aplicar
   npx supabase db push --linked          # aplicar solo las nuevas
   ```
3. **Unir a `develop`.** Vercel publica staging. Se prueba ahí el flujo de la historia.
4. **Cierre de sprint.** Se abre un PR `develop → main` y se une con *merge commit*. Vercel publica producción.

## Comprobación después de publicar (smoke test)

Cada vez que Vercel termina un despliegue, el workflow **Smoke despliegue** (`.github/workflows/smoke.yml`) prueba la URL publicada con `scripts/smoke.mjs`. Solo hace lecturas y no crea datos. El resultado aparece en la pestaña **Actions** y en el commit.

| Prueba | Qué comprueba |
|---|---|
| Inicio y login | La app responde y el formulario de ingreso carga |
| `/admin`, `/mesero`, `/cocina`, `/caja` | Sin sesión, redirigen a `/login` |
| QR inventado | Muestra "Código QR no válido" sin error del servidor |
| Cabeceras de seguridad | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| Carta (opcional) | Con `SMOKE_QR_TOKEN`, la carta carga desde un QR válido |

Para ejecutarlo a mano:

```bash
npm run smoke -- https://altoque-app-usil.vercel.app
SMOKE_QR_TOKEN=demo-mesa-2 npm run smoke -- http://localhost:3000
```

### Prueba manual de 5 minutos (después de cada cierre de sprint)

Con los usuarios demo (ver README):

- [ ] **Acceso QR:** `/m/demo-mesa-2` muestra la carta. Si la mesa no tiene sesión abierta, muestra "mesa no habilitada".
- [ ] **Mesero:** inicia sesión, abre la sesión de la Mesa 2 y registra un pedido asistido.
- [ ] **Carta y pedido:** desde el QR, agrega un producto, confirma y anota el número de pedido.
- [ ] **Cocina:** el pedido aparece en `/cocina`.
- [ ] **Admin:** `/admin/mesas` y `/admin/productos` cargan.
- [ ] **Cierre:** cierra la sesión de la Mesa 2 para dejar los datos limpios.

## Reversión (si algo sale mal)

### 1. La app publicada falla (lo más rápido, menos de 1 minuto)

En Vercel → proyecto **altoque-app-usil** → **Deployments**:

1. Busca el último despliegue de **Production** que funcionaba.
2. Abre el menú **⋯** y elige **Instant Rollback** (o **Promote to Production**).
3. Ejecuta `npm run smoke -- https://altoque-app-usil.vercel.app` para confirmar.

Esto solo cambia la versión publicada. El código en GitHub sigue igual, así que después hay que corregirlo (paso 2).

### 2. Deshacer el cambio en el código

No se borra historia ni se usa `push --force`. Se crea un commit que deshace el PR problemático:

```bash
git checkout dev/<nombre>
git merge origin/develop
git revert -m 1 <hash-del-merge-del-PR>
git push origin dev/<nombre>
```

Luego se abre un PR normal hacia `develop` con el título `US-xxx: revertir …`.

### 3. Una migración causó el problema

Las migraciones **no se deshacen editando archivos**. Se crea una migración nueva que compense el cambio, por ejemplo volviendo a crear una función anterior o quitando una restricción, y se aplica con `npx supabase db push --linked`.

Antes de aplicar una migración que **borre o modifique datos**, se exportan las tablas afectadas desde el panel de Supabase (**Table Editor → Export to CSV**).

## Datos de prueba

- La base solo contiene los restaurantes ficticios *Cevichería Demo* y *Pollería Demo* (`supabase/seed.sql`) y los usuarios demo de `scripts/usuarios-demo.mjs`.
- En los pedidos para llevar se usan nombres y teléfonos inventados (por ejemplo "Cliente Prueba", 999999999).
- No se registran datos de tarjetas ni de Yape reales: los pagos del Sprint 4 solo guardan el método y el monto.

## Limitaciones conocidas

- **Una sola base de datos para todos los entornos.** Para el MVP es aceptable porque todos los datos son ficticios. Si la plataforma se usara con un restaurante real, producción necesitaría su propio proyecto de Supabase con sus propias claves en Vercel (variables del entorno *Production*).
- **Monitoreo.** Sentry y UptimeRobot siguen sin configurarse. Mientras tanto, el smoke test automático cumple la función de alerta básica.
