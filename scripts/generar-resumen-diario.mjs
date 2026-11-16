import { writeFile } from "node:fs/promises";
import {
  crearMensajeResumenDiario,
} from "../infra/n8n/flujos/resumen-diario-logica.mjs";

// Solo genera el JSON del flujo. No consulta ni envía datos.
const nodo = (
  id,
  name,
  tipo,
  typeVersion,
  position,
  parameters,
) => ({
  id,
  name,
  type: `n8n-nodes-base.${tipo}`,
  typeVersion,
  position,
  parameters,
});

const validar = String.raw`
const c = $input.first().json;

if (
  typeof c.url_altoque !== 'string' ||
  (
    !/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(c.url_altoque) &&
    !/^http:\/\/(?:host\.docker\.internal|localhost|127\.0\.0\.1):[0-9]{2,5}$/i.test(c.url_altoque)
  )
) {
  throw new Error('Configura la URL base de AlToque, sin barra final ni ruta');
}

if (
  typeof c.restaurante !== 'string' ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.restaurante)
) {
  throw new Error('Configura el UUID del restaurante');
}

if (
  typeof c.destinatario !== 'string' ||
  !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(c.destinatario)
) {
  throw new Error('Configura un único destinatario autorizado');
}

return [{
  json: {
    url_altoque: c.url_altoque,
    restaurante: c.restaurante,
    destinatario: c.destinatario,
  },
}];
`;

const mensaje = `
const crearMensaje = ${crearMensajeResumenDiario.toString().replace(/\r\n/g, "\n")};
const configuracion = $('Validar configuración').first().json;
const resumen = $input.first().json;

if (
  resumen?.restaurante?.id !==
  configuracion.restaurante.toLowerCase()
) {
  throw new Error('El resumen no corresponde al restaurante configurado');
}

return [{
  json: {
    ...crearMensaje(resumen),
    destinatario: configuracion.destinatario,
  },
}];
`;

const flujo = {
  name: "US-089: resumen diario al dueño",
  active: false,
  nodes: [
    nodo(
      "horario",
      "Cada noche a las 23",
      "scheduleTrigger",
      1.3,
      [0, 0],
      {
        rule: {
          interval: [{
            field: "cronExpression",
            expression: "0 0 23 * * *",
          }],
        },
      },
    ),
    nodo(
      "manual",
      "Ejecutar manualmente",
      "manualTrigger",
      1,
      [0, 200],
      {},
    ),
    nodo(
      "configuracion",
      "Configuración",
      "set",
      3.4,
      [240, 100],
      {
        assignments: {
          assignments: [
            "url_altoque",
            "restaurante",
            "destinatario",
          ].map(name => ({
            id: name,
            name,
            value: "",
            type: "string",
          })),
        },
        includeOtherFields: false,
        options: {},
      },
    ),
    nodo(
      "validar",
      "Validar configuración",
      "code",
      2,
      [480, 100],
      { jsCode: validar },
    ),
    nodo(
      "consultar",
      "Consultar resumen",
      "httpRequest",
      4.2,
      [720, 100],
      {
        method: "GET",
        url: "={{ $json.url_altoque + '/api/n8n/resumen-diario' }}",
        authentication: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
        sendQuery: true,
        queryParameters: {
          parameters: [{
            name: "restaurante",
            value: "={{ $json.restaurante }}",
          }],
        },
        options: {
          timeout: 30000,
          redirect: {
            redirect: {
              followRedirects: false,
            },
          },
          response: {
            response: {
              responseFormat: "json",
            },
          },
        },
      },
    ),
    nodo(
      "mensaje",
      "Preparar correo",
      "code",
      2,
      [960, 100],
      { jsCode: mensaje },
    ),
    nodo(
      "correo",
      "Enviar resumen al dueño",
      "gmail",
      2.1,
      [1200, 100],
      {
        resource: "message",
        operation: "send",
        sendTo: "={{ $json.destinatario }}",
        subject: "={{ $json.asunto }}",
        emailType: "html",
        message: "={{ $json.html }}",
        options: {
          appendAttribution: false,
        },
      },
    ),
  ],
  connections: {},
  settings: {
    executionOrder: "v1",
    timezone: "America/Lima",
    saveDataSuccessExecution: "none",
    saveDataErrorExecution: "none",
    saveManualExecutions: false,
  },
  pinData: {},
  tags: [],
};

for (const [origen, destino] of [
  ["Cada noche a las 23", "Configuración"],
  ["Ejecutar manualmente", "Configuración"],
  ["Configuración", "Validar configuración"],
  ["Validar configuración", "Consultar resumen"],
  ["Consultar resumen", "Preparar correo"],
  ["Preparar correo", "Enviar resumen al dueño"],
]) {
  flujo.connections[origen] = {
    main: [[{
      node: destino,
      type: "main",
      index: 0,
    }]],
  };
}

await writeFile(
  new URL(
    "../infra/n8n/flujos/resumen-diario.json",
    import.meta.url,
  ),
  `${JSON.stringify(flujo, null, 2)}\n`,
);

console.log(
  "Generado infra/n8n/flujos/resumen-diario.json sin credenciales ni destinatarios.",
);