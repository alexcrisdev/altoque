# US-156: Autocompletar producto con IA: validación

Fecha: 27/11/2026 (hora de Lima). Entorno: `npm run dev` local con la clave de Alexander,
sesión del **dueño de la demo** (`dueno@polleria.demo`), formulario «Nuevo producto» abierto
desde la categoría «Platos de fondo». **No se guardó ningún producto** (nunca se tocó
«Crear producto»; se recargó la página entre nombres).

## Respuestas reales (Claude Haiku 5.5, salida estructurada)

| Nombre | Categoría | Alérgenos sugeridos (sin marcar) | Alcohol | Entrada | Salida |
|---|---|---|---|---|---|
| lomo saltado | Platos de fondo (la ya elegida) | gluten, soya | — | 1 598 | 177 |
| ceviche de pescado | Sugiere «Entradas» (botón «Usar esta categoría») | pescado | — | 1 600 | 163 |
| chicha morada | Sugiere «Bebidas sin alcohol» | ninguno | — | 1 597 | 153 |
| Inca Kola 500 ml | Sugiere «Bebidas sin alcohol» | ninguno | — | 1 603 | 160 |
| Cusqueña 620 ml | Bebidas con alcohol (aceptada con «Usar esta categoría») | gluten | 5 %, 620 ml → **≈ 2.4 tragos estándar** | 1 603 | 438 |

Promedio: **≈ 1 600 tokens de entrada y 218 de salida** por consulta (≈ US$ 0.0003).
Las descripciones tuvieron menos de 160 caracteres, no mencionaron precios y los ingredientes
fueron cortos. El precio quedó vacío en todos los casos.

¿Tienen sentido? Sí: ceviche → Entradas (como en US-148), bebidas en su categoría, gluten y
soya en el lomo (por el sillao), pescado en el ceviche y gluten en la cerveza (cebada).

Nota: «lomo saltado» se consultó **2 veces** (1 598 / 194 la primera), porque el script de
prueba falló después de la primera consulta y se volvió a correr la lista completa.

## Open Food Facts

En la prueba real, la búsqueda antigua (`/cgi/search.pl`) respondió **503**: Open Food Facts
la marca como «legacy» (máximo 10 búsquedas por minuto). El autocompletar no se rompió y
siguió solo con Claude. Después se cambió a la búsqueda vigente (**Search-a-licious** +
**ficha v2 por código**) y se verificó contra el servicio real, sin Claude: encontró «Inca Kola»,
«Cusquena» y «Coca cola». Sus fichas casi no traen ml ni % de alcohol, así que esos datos
salen del nombre («620 ml») y de Claude.

## Capturas

- `us156-lomo-saltado-escritorio.png`: campos con ✨ y alérgenos como «¿Contiene…?».
- `us156-cusquena-escritorio.png`: bebida con alcohol, % y ml sugeridos y tragos estándar.
- `us156-chicha-morada-360.png`: celular de 360 px con la categoría sugerida.
- `us156-formulario-360.png`: diseño final a 360 px (el botón baja bajo el nombre; modo
  simulado, sin Claude). Se usó con teclado: Tab llega a «✨ Autocompletar» y Enter lo activa.

## Escrituras en la base compartida

Cada consulta real anotó una fila de conteo en `ai_usage` (US-151, sin texto): 6 filas.
No se creó ni modificó ningún producto. La migración `20261127180000_us156_bebidas_alcohol.sql`
**no** está aplicada: mientras tanto la lista de productos funciona igual (sin % ni ml), pero
**guardar** un producto con este código falla hasta aplicarla (envía las columnas nuevas).
Por eso va el dry-run y el db push antes del merge.
