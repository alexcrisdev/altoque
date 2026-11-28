# US-153: Base vectorial (opiniones y manual): validación

Fecha: 28/11/2026, alrededor de las 00:45 (hora de Lima). Migración `20261128120000_us153_base_vectorial.sql`
aplicada, Edge Function `embeber` desplegada y `EMBEBER_SECRETO` configurado (por Alexander).
`npm run dev` local con su clave, sesión del **dueño de la demo** (`dueno@polleria.demo`).

## Manual indexado

- `npm run ia:indexar-manual -- --dry-run` → **8 secciones**.
- `npm run ia:indexar-manual` → «8 secciones guardadas, 0 secciones viejas borradas» (autorizado por
  Alexander; solo fragmentos MANUAL).

## Prueba real (una sola vez)

| Pregunta | Fuente | Fragmentos (similitud) | Respuesta | Tokens |
|---|---|---|---|---|
| ¿De qué se quejan mis clientes? | REVIEW | 0 | «Aún no tengo comentarios sobre eso.» | 0 (no llama a Claude) |
| ¿Qué dicen de la atención? | REVIEW | 0 | «Aún no tengo comentarios sobre eso.» | 0 (no llama a Claude) |
| ¿Cómo genero el QR de una mesa? | MANUAL | 8 (0.927 a 0.796) | Pasos correctos del manual, en viñetas | 3 776 / 149 |

La demo no tiene comentarios: la Pollería tiene 0 calificaciones y la Cevichería tiene 4, todas sin
comentario. Por eso las opiniones respondieron sin inventar nada. No se cargaron comentarios de prueba.

## Calibración de la similitud (sin Claude)

Con gte-small en español, todas las secciones del manual se parecen entre 0.79 y 0.85, pero la correcta
sale primera:

| Pregunta | 1.ª sección | 2.ª | Mejor de las demás |
|---|---|---|---|
| ¿Cómo genero el QR de una mesa? | mesas-y-codigos-qr **0.927** | pedidos 0.851 | 0.821 |
| ¿Cómo cierro una cuenta? | cuentas-y-pagos **0.877** | toqui 0.838 | 0.837 |
| ¿Dónde veo los reportes? | dashboard-y-reportes **0.870** | cuentas 0.827 | 0.824 |
| ¿Cómo imprimo la boleta electrónica? (no está en el manual) | productos 0.825 | pedidos 0.824 | 0.821 |

Regla nueva para el manual: mínimo **0.84**, solo las secciones a **0.06** o menos de la mejor, máximo **3**.
Con ella, las tres primeras preguntas mandan solo su sección correcta (unos 2 000 tokens menos que los
3 776 de la prueba) y la de la boleta responde «No encuentro eso en el manual» sin llamar a Claude.
Opiniones: mínimo 0.70 y hasta 12 fragmentos (Claude los agrupa por tema). Se recalibrará cuando haya
comentarios reales.

## Capturas

- `us153-toqui-escritorio.png`: las dos preguntas de opiniones (sin comentarios en la demo).
- `us153-toqui-360.png`: los pasos del manual para generar el QR, en celular de 360 px.

## Escrituras en la base compartida

- 8 fragmentos MANUAL en `ai_fragments` (autorizado).
- 1 fila de conteo en `ai_usage` (la pregunta del manual; las de opiniones no llamaron a Claude).
- Los vectores de calibración se pidieron a la Edge Function y la búsqueda solo leyó: no se guardó nada.
