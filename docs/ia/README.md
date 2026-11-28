# IA en AlToque (US-151): base común

Todas las HU que usan IA pasan por **una sola puerta**: `preguntarAClaude` (servidor) y,
si hay chat, el componente **Toqui**. No llames a Claude por tu cuenta.

| Qué | Dónde |
|---|---|
| Función común (solo servidor) | `src/features/ia/claude.ts` → `preguntarAClaude` |
| Modelo, límites, mensajes, quitar datos personales | `src/features/ia/reglas.ts` |
| Conteo de uso (tabla `ai_usage`) | `src/features/ia/uso.ts` + `supabase/migrations/20261127120000_us151_uso_ia.sql` |
| Componente Toqui | `src/components/toqui/` → `import { Toqui } from "@/components/toqui"` |
| Prueba real de tu clave | `npm run ia:probar` |

Modelo: **Claude Haiku 5.5** (`claude-haiku-5-5`), en la constante `MODELO_IA`.

## 1. Crea tu clave local

1. Entra a **Claude Console** (platform.claude.com) con la invitación a la organización
   **AlToque USIL** (pídesela a Alexander).
2. Ve a **API keys → Create key**. Ponle de nombre `tunombre-local` (ej. `maria-local`).
3. Copia la clave (empieza con `sk-ant-`). Solo se muestra una vez.
4. Pégala en tu `.env.local` (nunca en otro archivo):

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

5. Reinicia `npm run dev`. Prueba **una sola vez** que funciona:

   ```
   npm run ia:probar
   ```

   Debe mostrar `Respuesta: Hola` y los tokens.

Reglas de la clave:

- **Nunca** con `NEXT_PUBLIC_`, nunca en el código, en un commit, en Slack ni en capturas.
- Si se filtra, bórrala en Console (API keys) y crea otra.
- **Sin clave no pasa nada malo:** la app usa el **modo simulado** y Toqui responde un
  texto fijo. Puedes trabajar tu HU así y probar con clave solo al final.

## 2. Usa `preguntarAClaude` en tu HU

Siempre desde una **acción de servidor** (`actions.ts`) que primero valida el rol, como
cualquier otra acción del proyecto:

```ts
// src/features/dashboard/actions.ts
"use server";
import { requerirPanel } from "@/features/auth/sesion";
import { preguntarAClaude } from "@/features/ia/claude";
import type { MensajeIA, RespuestaIA } from "@/features/ia/reglas";
import { obtenerResumenDelDia } from "./resumen"; // consulta FIJA a la base (tu capa de datos)

// Instrucciones fijas: no metas aquí la fecha ni datos que cambian (así quedan en caché).
const INSTRUCCIONES = `Eres Toqui, asistente del panel de administración de AlToque.
Responde en español simple, en 3 frases como máximo.
Usa SOLO los datos que te doy; si no están, di que no lo sabes. No inventes cifras.`;

export async function preguntarToquiAdmin(mensajes: MensajeIA[]): Promise<RespuestaIA> {
  const sesion = await requerirPanel("admin");
  const resumen = await obtenerResumenDelDia(sesion.restauranteId); // la base calcula los números
  const ultimo = mensajes.at(-1);
  if (!ultimo) return { ok: false, motivo: "Escribe una pregunta." };

  return preguntarAClaude({
    instrucciones: INSTRUCCIONES,
    // Los datos van junto a la última pregunta (no en las instrucciones).
    mensajes: [
      ...mensajes.slice(0, -1),
      { rol: "usuario", texto: `Datos de hoy (calculados por la base): ${JSON.stringify(resumen)}\n\nPregunta: ${ultimo.texto}` },
    ],
    maxTokens: 300,
    uso: { restauranteId: sesion.restauranteId, usuarioId: sesion.usuario.id, funcion: "toqui-admin" },
  });
}
```

Qué devuelve (nunca lanza errores):

- `{ ok: true, texto, tokens, simulada }`: muestra `texto`.
- `{ ok: false, motivo }`: muestra `motivo` tal cual. Es un mensaje listo para la pantalla:
  - «IA no disponible por ahora»: error de la API, timeout, sin internet, clave mala.
  - «Toqui descansa un rato, intenta más tarde»: se pasó el límite de uso.
  - «El texto es muy largo, resúmelo un poco.»: más de 12000 caracteres (instrucciones + mensajes).

Parámetros:

| Parámetro | Para qué |
|---|---|
| `instrucciones` | Rol y reglas fijas de tu HU. Van en caché (`cache_control`). |
| `mensajes` | `{ rol: "usuario" \| "asistente", texto }[]`. El **último siempre es del usuario**. |
| `maxTokens` | Tope de la respuesta (por defecto 1024, máximo 4096). Ponlo bajo: menos gasto. |
| `uso` | `restauranteId`, `usuarioId` (null para el cliente sin cuenta) y `funcion` (código corto de tu HU, ej. `resumen-resenas`). |
| `esfuerzo` | `"low"` por defecto. Sube a `"medium"` solo si la respuesta sale floja. |
| `formato` | Opcional (US-156). `{ esquema }`: Claude responde **siempre** un JSON con ese esquema (salida estructurada). `texto` trae el JSON: haz `JSON.parse` y valida cada campo en el servidor. |
| `respuestaSimulada` | Opcional (US-156). Lo que devuelve el modo simulado para tu HU (por ejemplo, un JSON de prueba), para que tu E2E tenga datos. |

Ya lo hace la función por ti:

- Quita **correos y teléfonos** de lo que escribe el usuario (`quitarDatosPersonales`).
  Si mandas otro texto (reseña, texto leído de una captura), pásalo tú también por
  `quitarDatosPersonales` antes de ponerlo en `mensajes` o `instrucciones`.
- Revisa el **límite de uso** antes de llamar.
- Registra en el log del servidor solo el tipo de resultado, el modelo y los tokens.

Reglas del esquema de `formato`: todo objeto con `additionalProperties: false` y todos sus campos en `required`;
sin `minimum`, `maximum`, `minLength` ni `maxLength` (la API no los acepta: esos rangos se validan en tu código).
Para "puede faltar" usa `anyOf: [{ type: "string" }, { type: "null" }]`. Ejemplo real: `src/features/ia/autocompletar-producto/reglas.ts`.

No hagas (Haiku 5.5 responde error 400): `temperature`, `top_p`, `top_k`, "prefill" (que
el último mensaje sea del asistente) ni `thinking` con `budget_tokens`.

## 3. Usa el componente Toqui

Toqui no llama a Claude solo: le pasas tu acción de servidor en `responder`.

```tsx
// En una pantalla de tu HU (componente de servidor o cliente)
import { Toqui } from "@/components/toqui";
import { preguntarToquiAdmin } from "@/features/dashboard/actions";

<Toqui
  responder={preguntarToquiAdmin}
  saludo="¡Hola! Soy Toqui. Pregúntame por tus ventas."
  sugerencias={["¿Qué vendí más hoy?", "¿Cómo voy contra ayer?"]}
  descripcion="Asistente del panel de administración"
  clavePosicion="altoque:toqui-posicion:admin"
/>
```

Ya incluye: personaje animado, arrastrar (más de 5 px es arrastre; menos es toque), recuerda
la posición en el navegador, globo de saludo, chat con preguntas sugeridas, `aria-label`,
Escape para cerrar, «reducir movimiento» y celular de 360 px (se asoma desde el borde).
Usa una `clavePosicion` distinta por rol. Solo manda a la IA los últimos 10 mensajes.

## 4. Reglas de la IA en AlToque

1. **La IA propone y la persona confirma.** Nada se guarda ni se cobra solo porque lo dijo
   la IA (ej. alérgenos sugeridos, Yape verificado: siempre un botón de confirmar).
2. **Sin datos personales.** Nada de nombres, correos, teléfonos ni DNI del cliente. Usa
   `quitarDatosPersonales` en todo texto libre.
3. **Consultas fijas a la base.** Tu capa de datos hace consultas escritas por ti. **Nunca**
   SQL generado por la IA.
4. **La base calcula los números; Claude solo los explica.** Sumas, promedios y totales
   salen de la base. A Claude le pides explicarlos en palabras simples.
5. **Modo simulado en pruebas.** CI, `npm test` y E2E nunca llaman a Claude (`IA_SIMULADA=1`
   o sin clave). Para probar tu HU en pruebas, revisa que se maneje el `RESPUESTA_SIMULADA`.

## 5. Límite de uso (protege el saldo de US$ 10)

En `src/features/ia/reglas.ts` (fáciles de cambiar):

- `LIMITE_POR_USUARIO_HORA = 30` consultas por usuario por hora.
- `LIMITE_POR_RESTAURANTE_DIA = 300` consultas por restaurante por día (hora de Lima).

Se cuentan en la tabla `ai_usage` (restaurante, usuario, fecha, HU y tokens; **nunca** el
texto). Dueño y admin pueden ver el consumo de su restaurante. La función
`reservar_consulta_ia` revisa y anota en un solo paso. Si la base no responde, no se llama
a Claude (mejor sin IA que sin control del saldo). El cliente sin cuenta (`usuarioId: null`)
solo cuenta para el límite del restaurante.

> La migración `20261127120000_us151_uso_ia.sql` la aplica Alexander (dry-run y db push).
> Mientras no esté aplicada, con clave real la función responde «IA no disponible por ahora».

## 6. Costos aproximados (Claude Haiku 5.5)

| | Precio por millón de tokens |
|---|---|
| Entrada | US$ 0.10 |
| Salida | US$ 0.50 |
| Entrada leída de caché | ~US$ 0.01 |

(Precios para preguntas de hasta 100 mil tokens; confirma en la página de precios de Anthropic.)

- 1 token ≈ 3/4 de palabra en inglés; en español, algo menos.
- Una consulta típica (1 500 tokens de entrada + 300 de salida) cuesta ≈ **US$ 0.0003**.
  Con US$ 10 alcanzan unas **30 000 consultas**.
- El tope de 300 consultas por restaurante al día cuesta como máximo ≈ US$ 0.10 diarios.
- El caché solo funciona si las instrucciones tienen al menos ~512 tokens y no cambian
  (dura 5 minutos). Si son cortas no da error: simplemente no se cachean.
- El "pensamiento" interno del modelo también cuenta como salida; con `esfuerzo: "low"`
  casi no piensa.

**Dónde ver el consumo:** Claude Console → **Gastos y uso → Uso de la API** (por clave y por
día). Por restaurante: tabla `ai_usage`.

## 7. Base vectorial (US-153): opiniones y manual

Toqui del admin también responde **qué opinan los clientes** y **cómo se usa AlToque**, buscando por
significado («demora» encuentra «esperé 40 minutos»). Es un chatbot con base vectorial (RAG):

1. **Indexar:** cada comentario de `order_ratings` (sin correos, teléfonos ni nombres) y cada sección
   de `docs/manual/*.md` se convierte en un vector de 384 números con el modelo **gte-small** de
   Supabase (Edge Function `supabase/functions/embeber`) y se guarda en `ai_fragments` (pgvector).
2. **Preguntar:** la pregunta del dueño también se convierte en vector.
3. **Buscar:** `buscar_fragmentos_ia` devuelve los 10 fragmentos más parecidos (coseno, índice HNSW),
   **solo del restaurante** del dueño (el manual es común).
4. **Responder:** Claude agrupa las opiniones por tema (o da los pasos del manual) usando SOLO esos
   fragmentos. Si no hay parecidos: «Aún no tengo comentarios sobre eso» / «No encuentro eso en el manual».

| Qué | Dónde |
|---|---|
| ¿Opiniones, manual o métricas? (sin IA) | `src/features/ia/vectorial/reglas.ts` → `elegirFuente` |
| Vectores (Edge Function, timeout 10 s, simulada en pruebas) | `src/features/ia/vectorial/embeber.ts` |
| Guardar y buscar fragmentos (funciones fijas) | `src/features/ia/vectorial/fragmentos.ts` |
| Tabla, RLS y funciones | `supabase/migrations/20261128120000_us153_base_vectorial.sql` |
| Cargar el manual | `npm run ia:indexar-manual -- --dry-run` (cuenta) / `npm run ia:indexar-manual` |

- Los comentarios nuevos se indexan solos antes de cada pregunta de opiniones (máximo 50 por vez).
- Si cambias el manual, vuelve a correr `npm run ia:indexar-manual` (borra las secciones que ya no existen).
- gte-small está entrenado sobre todo en inglés: con textos en español funciona, pero con menos
  precisión. Ajusta `SIMILITUD_MINIMA` en `vectorial/reglas.ts` si trae muy poco o demasiado.

**Despliegue (lo hace Alexander):** `npx supabase functions deploy embeber --no-verify-jwt --project-ref <ref>`
y `npx supabase secrets set EMBEBER_SECRETO=<32+ caracteres> --project-ref <ref>`. El mismo
`EMBEBER_SECRETO` va en `.env.local` y en Vercel (solo servidor, nunca `NEXT_PUBLIC_`).

## 8. Pruebas

- `tests/unit/ia-base.test.ts`: respuesta correcta, errores de la API, timeout, límite,
  modo simulado, que CI no tenga la clave y `quitarDatosPersonales`.
- `tests/unit/toqui-componente.test.ts`: conversación que se manda a la IA y que el
  componente no llame a Claude.
- En tus pruebas, simula el SDK como en `ia-base.test.ts` o usa el modo simulado. Nunca
  pongas una clave real en una prueba.
