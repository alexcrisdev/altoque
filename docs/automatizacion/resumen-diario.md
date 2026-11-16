# US-089: resumen diario de ventas al dueño

## Funcionamiento

El flujo consulta GET /api/n8n/resumen-diario y envía un correo HTML
con el resumen del restaurante. Tiene ejecución manual y programación
diaria a las 23:00, con zona horaria America/Lima.

El resumen contiene:

- Total de pagos confirmados en el día.
- Número de pedidos creados en el día, sin cancelados.
- Ventas por efectivo, Yape, tarjeta en caja y tarjeta en línea.
- Plato más vendido, agrupado por nombre histórico y sin cancelados.
- Cantidad y motivos de cierres con excepción.
- Hasta tres platos previstos para el día siguiente, usando US-090.

Sin predicciones disponibles, se omite la línea de preparación.
Las predicciones desplazadas para demostración se identifican como tales.

El corte refleja los datos disponibles al ejecutar la consulta.
El resumen de las 23:00 no incluye movimientos registrados posteriormente.
Las ventas usan confirmed_at; los pedidos, created_at; los cierres, closed_at.
Los límites del día se calculan en hora de Lima.

## Ruta y autorización

GET /api/n8n/resumen-diario?restaurante=<UUID>&fecha=AAAA-MM-DD

La fecha es opcional y usa hoy en America/Lima por defecto.

Cabecera requerida:

Authorization: Bearer <RESUMEN_DIARIO_TOKEN>

RESUMEN_DIARIO_TOKEN debe tener al menos 32 caracteres.
La comparación utiliza timingSafeEqual. El token no se incluye en la URL.

Respuestas:

- 200: resumen consultado correctamente.
- 400: restaurante o fecha con formato inválido o parámetros repetidos.
- 401: autorización ausente o incorrecta.
- 404: restaurante inexistente.
- 503: token sin configurar o configuración inválida.
- 500: consulta fallida; no se devuelven resultados parciales.

Todas las respuestas del manejador llevan Cache-Control: no-store.
La ruta no requiere sesión de usuario. La capa de datos utiliza el cliente
admin y filtra las consultas por restaurante.

No se consultan campos de nombre, teléfono ni correo de clientes.
Los motivos de excepción se incluyen como fueron registrados.

## Preparación del flujo

Desde la raíz del proyecto:

node scripts/generar-resumen-diario.mjs

Este comando genera infra/n8n/flujos/resumen-diario.json.
No consulta Supabase ni envía correos.

El generador incorpora al nodo Code la función de
infra/n8n/flujos/resumen-diario-logica.mjs.
Después de modificar esa función, se debe regenerar el JSON.

Importar el JSON en n8n mediante Import from File.

## Configuración privada en n8n

En el nodo Configuración completar:

- url_altoque: origen de la aplicación, sin barra final ni ruta.
- restaurante: UUID del restaurante.
- destinatario: un único correo autorizado para recibir el resumen.

Ejemplo de URL local desde Docker Desktop:

http://host.docker.internal:3007

AlToque debe escuchar en una interfaz accesible desde el contenedor.
La prueba local usó el puerto 3007 y hostname 0.0.0.0.

En Consultar resumen seleccionar Generic Credential Type y Header Auth.
Crear una credencial con:

- Name: Authorization
- Value: Bearer seguido del token configurado en AlToque.

El token debe coincidir con RESUMEN_DIARIO_TOKEN del proceso de AlToque.
El nodo HTTP no sigue redirecciones.

En Enviar resumen al dueño seleccionar la credencial Gmail OAuth2.
Se reutiliza el mecanismo Gmail OAuth de US-071.

Para una instalación local de n8n, configurar un cliente OAuth de tipo
Aplicación web en Google Cloud, habilitar Gmail API y registrar la URI
de redirección que muestra n8n. Agregar la cuenta remitente como usuario
de prueba si la aplicación OAuth está en modo de pruebas.

El Client Secret se guarda únicamente en las credenciales de n8n.

## Demo manual

1. Iniciar AlToque y n8n.
2. Comprobar la ruta sin token: debe responder 401.
3. Comprobar la ruta autorizada: debe responder con el resumen JSON.
4. Guardar el workflow con las credenciales seleccionadas.
5. Pulsar Execute workflow usando el inicio manual.
6. Revisar los nodos ejecutados y comprobar la recepción en el buzón.
7. Verificar los montos, las excepciones y la preparación de mañana.
8. Guardar las capturas sin exponer secretos.

La ejecución manual no requiere publicar el workflow.

## Programación diaria

El Schedule Trigger usa:

0 0 23 * * *

La zona horaria del workflow es America/Lima.
Guardar y publicar el workflow para habilitar su ejecución automática.

En local, la computadora, Docker, n8n y AlToque deben permanecer
funcionando a la hora programada.

Un token configurado solo en la terminal no persiste al cerrar esa sesión.
Si se reinicia AlToque, debe conservarse el mismo token o actualizar
también la credencial Header Auth.

Para el entorno publicado, Alexander configura RESUMEN_DIARIO_TOKEN
en Vercel y se actualiza la URL de AlToque en n8n.

## Secretos y repositorio

No subir .env.local, infra/n8n/.env, tokens, Client Secret,
credenciales exportadas ni destinatarios reales.

El JSON generado es una plantilla inactiva y sin configuración privada.
No reemplazarlo con una exportación del workflow configurado.

La historia no requiere migraciones ni realiza escrituras en Supabase.