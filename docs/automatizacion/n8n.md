# US-071: n8n local con Docker y Cloudflare Tunnel

Esta infraestructura es independiente de Next.js y Supabase. Solo prueba un JSON
ficticio y un correo autorizado; no recibe eventos reales de AlToque.

## Estado y requisitos

Configuración preparada, **arranque local, correo local y conservación de registros
tras reinicio comprobados**. Túnel HTTPS y bloqueo público del editor comprobados.
Envío autenticado desde Internet confirmado por Erick. Quedan pendientes las
comprobaciones negativas en ejecución y la verificación del login local.

Se necesita Docker Desktop con contenedores Linux y motor WSL 2 funcionando,
PowerShell, un navegador y una cuenta Gmail de prueba autorizada. En Docker Desktop,
comprobar Settings → General → Use the WSL 2 based engine. Si no está instalado,
seguir la [guía oficial de Windows](https://docs.docker.com/desktop/setup/install/windows-install/).
La instalación/activación de componentes de Windows puede requerir reinicio.

Las imágenes están fijadas: n8n `2.46.7`, nginx `1.30.6-alpine` y cloudflared
`2026.10.7`. Su descarga y compatibilidad real se comprueban al autorizar el arranque.
No se instala cloudflared ni ninguna librería Node en Windows.

## Archivos y secretos

| Archivo | Función |
|---|---|
| `infra/n8n/docker-compose.yml` | n8n, volumen persistente y perfil opcional `tunel` |
| `infra/n8n/nginx.conf` | Solo permite POST al webhook de prueba; bloquea el editor |
| `infra/n8n/.env.example` | Variables de ejemplo sin secretos |
| `infra/n8n/.env` | Configuración privada local; ignorada por Git |
| `infra/n8n/.gitignore` | Excluye configuración real, logs y exportaciones locales |
| `infra/n8n/flujos/webhook-correo-prueba.json` | Plantilla inactiva; sin credenciales ni destinatario real |

No copiar `.env.local` de AlToque ni sus claves a esta infraestructura. La clave
`N8N_ENCRYPTION_KEY` debe conservarse en privado: el volumen sin su clave no basta
para recuperar las credenciales cifradas. Docker no cifra todo el volumen; proteger
también el disco y sus copias de seguridad.

Desde la raíz del repositorio, para otra computadora (no sobrescribir un `.env` existente):

```powershell
Set-Location infra/n8n
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  node -e "const fs=require('node:fs');const crypto=require('node:crypto');const p='.env';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/^N8N_ENCRYPTION_KEY=$/m,'N8N_ENCRYPTION_KEY='+crypto.randomBytes(32).toString('hex')))"
}
```

En esta computadora ya se generó la clave local sin mostrarla. No rotarla al reiniciar.
No usar `docker compose config` sin `--quiet`: podría imprimirla. Nunca exportar
credenciales descifradas ni subir el volumen. Antes de un commit, revisar que solo
se preparen los archivos públicos explícitos, nunca `.env`.

## Arranque local (requiere autorización)

Los siguientes comandos se ejecutan dentro de `infra/n8n`:

```powershell
docker --version
docker compose version
docker info
docker compose config --quiet
docker compose up -d n8n
docker compose ps
docker compose logs --tail 50 n8n
```

El primer arranque descarga imágenes. Abrir **http://localhost:5678** y crear la
cuenta propietaria con el asistente inicial oficial. Después se exige iniciar sesión;
no se usan las antiguas variables `N8N_BASIC_AUTH_*`. No desactivar las cookies
seguras globalmente: si un navegador rechaza el acceso local, probar localhost en
Chrome/Edge y diagnosticar antes de cambiar seguridad.

## Gmail OAuth y autorización de la prueba

Erick eligió Gmail con OAuth. **Elegir el servicio no autoriza todavía un envío.**
Antes de configurar servicios externos, confirmar con Erick la cuenta que usará y
el único buzón destinatario autorizado. No pedir secretos por el chat.

1. En el editor local, importar el JSON mediante Import from File. Mantenerlo inactivo.
2. En el nodo Webhook, crear una credencial **Header Auth** con nombre de cabecera
   `X-AlToque-Prueba` y un valor aleatorio privado (diferente de la clave de cifrado).
   Seleccionarla; el flujo no debe publicarse sin autenticación.
3. En Google Cloud Console, con autorización del titular, crear o reutilizar un
   proyecto, habilitar Gmail API y configurar la pantalla de consentimiento OAuth.
   Si la aplicación está en modo Testing, añadir la cuenta de prueba a Test users.
4. Crear un cliente OAuth de tipo Web application. Copiar **exactamente** la OAuth
   Redirect URL que muestre la credencial Gmail de n8n en Authorized redirect URIs.
   Se usa el editor local; no abrir `/rest` ni el callback OAuth por el túnel.
5. Introducir Client ID y Client Secret solo en la credencial de n8n, y completar
   Sign in with Google en el navegador. Revisar los permisos solicitados.
6. Seleccionar esa credencial en Enviar correo de prueba. Introducir el único correo
   autorizado en Destinatario autorizado. El JSON de entrada nunca elige destinatarios.
7. Guardar. Solicitar autorización explícita para enviar la prueba y luego publicar
   el workflow para habilitar su Production URL.

Las credenciales viven cifradas en el volumen. Los tokens de una app Google en
Testing pueden caducar; revisar las restricciones de Google si deja de autenticar.
No afirmar que funcionó hasta comprobar la ejecución y la recepción.

## Túnel rápido y editor privado (requiere autorización)

Un Quick Tunnel no necesita cuenta ni dominio: entrega una URL temporal
`trycloudflare.com`. Cambia al recrearlo, carece de garantía de disponibilidad y no
sirve como dirección permanente. Es la opción propuesta para esta demostración.

```powershell
docker compose --profile tunel up -d
docker compose logs --tail 50 cloudflared
```

Copiar la URL HTTPS **real** del log a `N8N_WEBHOOK_URL` en `.env`, con barra final,
y aplicar solo a n8n, sin reiniciar cloudflared:

```powershell
docker compose up -d --no-deps n8n
docker compose restart entrada-webhook
```

El reinicio del filtro actualiza la resolución del contenedor n8n tras su recreación.
Comprobar que n8n vuelva a estar healthy. Si se recrea el túnel, repetir la actualización
de URL. El perfil publica únicamente el endpoint exacto
`/webhook/us071-correo-prueba`: el proxy rechaza editor, login, API, callback OAuth,
otros webhooks y `/webhook-test/`. El editor permanece en localhost con su sesión.
No conectar el túnel directamente a `n8n:5678` porque se saltaría este filtro.
El proxy limita tamaño y frecuencia; no sustituye Header Auth. Las solicitudes
comparten un límite conservador, suficiente para una demostración manual.

Para una URL estable, usar un túnel administrado con cuenta y dominio configurado
en Cloudflare. Su creación, DNS y token necesitan autorización adicional. Apuntar
también al filtro `entrada-webhook:8080`, conservar el rechazo de otras rutas y
guardar el token solo en configuración privada. No está implementado en este Compose.

## Prueba desde Internet

Con autorización para el envío, ejecutar en PowerShell. El encabezado se introduce
sin mostrarlo ni guardarlo en historial como texto literal. No pegar valores al chat.

```powershell
$urlPublica = Read-Host 'URL HTTPS real del tunel, sin barra final'
$clavePrivada = Read-Host 'Valor de X-AlToque-Prueba' -AsSecureString
$encabezado = [System.Net.NetworkCredential]::new('', $clavePrivada).Password
$cuerpo = @{
  evento = 'pedido_creado'
  restaurante = 'AlToque Demo'
  mesa = 'M05'
  mensaje = 'Prueba de automatizacion'
} | ConvertTo-Json
try {
  Invoke-RestMethod -Method Post -Uri "$urlPublica/webhook/us071-correo-prueba" -ContentType 'application/json' -Headers @{ 'X-AlToque-Prueba' = $encabezado } -Body $cuerpo
} finally {
  Remove-Variable encabezado, clavePrivada -ErrorAction SilentlyContinue
}
```

Verificar:

- Entrada válida: respuesta 200 tras aceptar Gmail el envío; comprobar además el
  correo en el buzón autorizado y spam. Aceptación de Gmail no garantiza entrega.
- Campo ausente, vacío, demasiado largo o evento diferente: 400 y ningún envío.
- Sin cabecera o con valor incorrecto: rechazo de autenticación y ningún envío.
- Gmail falla: respuesta 502 sin datos internos del proveedor. No reintentar a ciegas:
  revisar si se envió antes de repetir para evitar correos duplicados.
- `/`, `/signin`, `/rest/settings`, `/webhook-test/us071-correo-prueba` desde la URL
  pública: 404. Un GET al webhook también debe rechazarse.
- Editor local: abrir una ventana privada y comprobar que pide iniciar sesión.

En **Executions** revisar hora, nodos ejecutados y estado. No publicar datos de
credenciales o cabeceras en capturas. Las ejecuciones se podan después de 24 horas;
guardar evidencia saneada antes. Este flujo no implementa idempotencia ni eventos
reales de pedidos; no se conecta a Supabase ni a Next.js.

## Persistencia, parada y reinicio

Crear/importar el flujo y sus credenciales; después:

```powershell
docker compose restart n8n
docker compose ps
```

Volver a entrar y comprobar workflow, cuenta y credenciales. Reiniciar no borra el
volumen. Para comprobar recreación, detener todo y volver a iniciar solo n8n:

```powershell
docker compose --profile tunel down
docker compose up -d n8n
```

No usar `down -v`, no borrar el volumen ni cambiar el nombre del proyecto Compose:
se perderían los datos o parecería una instalación nueva. Tras detener el túnel, la
URL temporal deja de funcionar. La disponibilidad exige PC encendida, conectada a
Internet, sin suspensión, Docker y contenedores en marcha. No es hosting permanente.

## Exportar y resolver problemas

Importar mediante Import from File en el editor. Para exportar, descargar el flujo,
revisar el JSON y retirar destinatarios reales, cabeceras, datos fijados (`pinData`),
referencias a credenciales y datos de ejecuciones antes de reemplazar la plantilla.
Mantener `active: false`. No exportar credenciales.

| Problema | Qué revisar |
|---|---|
| Docker no conecta al motor | Abrir Docker Desktop; esperar Engine running y revisar WSL 2 |
| Puerto 5678 ocupado | Identificar el proceso; no detener servicios ajenos sin permiso |
| n8n no arranca | `.env` con clave, logs locales y espacio de disco; no publicar logs sin revisar |
| Webhook 404 | Workflow publicado, ruta exacta, Production URL y servicio healthy |
| Túnel 502 | n8n healthy, proxy funcionando; no resolver exponiendo el editor |
| OAuth redirect mismatch | URL exacta del editor local registrada en Google |
| Google bloquea acceso | Cuenta autorizada en Test users y consentimiento/permisos correctos |
| Destinatario vacío | Configurar el buzón aprobado antes de publicar; no se toma del JSON |
| Correo no llega | Executions, salida de Gmail y spam; no asumir entrega por un 200 |
| 429 | Esperar el límite de solicitudes; no repetir masivamente |
| Credenciales no se descifran | Restaurar clave original y volumen correspondiente |

## Validación y futura integración

Pendiente comprobar en ejecución: login obligatorio del editor local, casos
inválidos y rechazo sin autenticación del webhook publicado.
No reenviar correos sin autorización adicional.
Registrar resultados reales; no marcar criterios por anticipado.

Desde la raíz del repo ejecutar `npm run lint`, `npm run typecheck`, `npm run build`
y `npm test`. Estas comprobaciones de AlToque no validan por sí solas Docker/Gmail.

Revisión local del 09/11/2026: lint aprobado, typecheck aprobado, 615 pruebas
unitarias aprobadas y build aprobado. El primer build falló al descargar Google
Fonts en el entorno restringido; la repetición autorizada con red terminó bien.
`docker compose config --quiet` aprobó sin levantar servicios. Se revisaron el JSON,
las conexiones, la sintaxis de los scripts y entradas válidas/inválidas del validador;
esto no sustituye importar y ejecutar el flujo en n8n. Git confirmó que el `.env`
local está ignorado.

Después de la autorización de arranque del 09/11/2026, se descargó la imagen fijada
de n8n y se inició únicamente ese servicio. Docker informa `healthy`, el puerto
está publicado en `127.0.0.1:5678` y `/healthz` devuelve HTTP 200. Se creó el volumen
`altoque-n8n_datos_n8n`; aún no se verificó la conservación de un workflow tras
reiniciar. El log confirma n8n 2.46.7 y el editor local disponible. Advierte que el
modo interno de task runners está obsoleto: el runner JavaScript inició, pero su
migración a un runner externo debe resolverse antes de actualizar a una versión
que retire ese modo. No se inició el túnel ni se enviaron correos.

Validación posterior del 09/11/2026: Erick importó el workflow, configuró Header Auth
y Gmail OAuth y autorizó un único correo local. La captura del buzón confirma su
recepción con el asunto y los datos ficticios previstos. Después autorizó reiniciar
únicamente n8n. Tras `docker compose restart n8n`, el servicio volvió a `healthy` y
`/healthz` respondió HTTP 200. Una consulta de solo lectura confirmó el workflow
guardado e inactivo, una credencial `gmailOAuth2` y una `httpHeaderAuth`, sin leer
sus valores secretos. Esto confirma conservación de registros; no se volvió a enviar
correo ni se comprobó otra autorización OAuth después del reinicio. El túnel sigue
sin iniciarse.

Con autorización adicional del 09/11/2026 se iniciaron nginx y cloudflared; sus
imágenes fijadas se descargaron correctamente. Se guardó la URL HTTPS real entregada
por Cloudflare únicamente en `.env`, se recreó n8n y se reinició el filtro. Los tres
servicios están activos y n8n está `healthy`. Las consultas HTTPS públicas a `/`,
`/signin`, `/rest/settings`, `/rest/oauth2-credential/callback` y al webhook de test
devolvieron 404; GET al webhook de producción devolvió 403, como corresponde a la
restricción POST. El endpoint local de salud sigue devolviendo 200. `nginx -t`
aprobó. No se envió otro correo ni se publicó el workflow en este paso. La URL
temporal no se fija en documentación ni en el workflow exportado.

Prueba HTTPS del 09/11/2026: Erick publicó el workflow y autorizó un segundo correo
al mismo destinatario. Ejecutó el POST contra la URL pública de Cloudflare con
Header Auth y el mensaje ficticio `Prueba HTTPS por Cloudflare - US-071`. Confirmó
expresamente la recepción en el buzón. Queda aprobado el recorrido HTTPS → túnel
→ n8n → validación → Gmail → recepción, con evidencia de recepción reportada por
Erick. Este envío ocurrió después del reinicio y recreación de n8n, por lo que también
confirma que la configuración y las credenciales conservadas siguieron funcionando.
La plantilla del repositorio permanece inactiva, sin destinatario ni credenciales
reales; la copia local publicada en n8n conserva la configuración privada.

Para Alexander: informar URL pública vigente, ruta, método POST, esquema del JSON,
Header Auth por medio privado y disponibilidad limitada a esta PC. La futura historia
de integración debe definir eventos reales, autenticación, idempotencia y reintentos;
no reutilizar este flujo de correo como procesamiento productivo.

## Texto propuesto para PR (no creado)

**Título:** US-071: configurar n8n con Docker y Cloudflare Tunnel

Preparé n8n en Docker Compose con almacenamiento persistente, editor local y un
túnel HTTPS que solo permite el webhook de prueba. Incluí un flujo inactivo con
validación de entrada y correo mediante Gmail OAuth, sin credenciales exportadas,
y una guía de instalación, operación y pruebas en PowerShell.

- [x] Arranque y persistencia comprobados
- [ ] Editor protegido y bloqueado desde Internet
- [ ] HTTPS y autenticación del webhook comprobados
- [x] Correo local y correo HTTPS recibidos, confirmados por Erick
- [x] Plantilla JSON sin secretos revisada; no exporta la configuración privada
- [x] Lint, tipos, build y 615 unitarias en verde
- [x] Sin cambios en Supabase ni integración de eventos reales

Mensaje de commit propuesto: `US-071: configurar n8n con Docker y Cloudflare Tunnel`.
No hacer commit, push ni abrir PR sin autorización.

## Referencias oficiales

- [n8n Docker](https://docs.n8n.io/hosting/installation/docker/)
- [Webhooks detrás de un proxy](https://docs.n8n.io/hosting/configuration/configuration-examples/webhook-url/)
- [Gmail OAuth](https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/)
- [Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
- [Versiones cloudflared](https://github.com/cloudflare/cloudflared/releases)
