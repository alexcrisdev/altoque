// Regenera el flujo importable sin credenciales ni la ruta privada de Nubefact.
import { readFileSync, writeFileSync } from "node:fs";
import { prepararBoleta, resultadoNubefact } from "../infra/n8n/flujos/boleta-logica.mjs";

const raiz = new URL("../infra/n8n/flujos/", import.meta.url);
const flujo = JSON.parse(readFileSync(new URL("aviso-pago-confirmado.json", raiz), "utf8"));
flujo.name = "US-088: boleta de prueba y correo (aviso v2)";
flujo.active = false;
flujo.settings = { executionOrder: "v1", saveDataSuccessExecution: "none", saveDataErrorExecution: "none", saveManualExecutions: false };
const nodo = (name, type, parameters, position, extras = {}) => ({ id: name.toLowerCase().replaceAll(/[^a-z0-9]/g, "-"), name, type: `n8n-nodes-base.${type}`, typeVersion: type === "code" ? 2 : type === "httpRequest" ? 4.2 : type === "if" ? 2.2 : 1, parameters, position, ...extras });
const conectar = (de, a, salida = 0) => {
  const main = (flujo.connections[de] ??= { main: [] }).main;
  main[salida] ??= [];
  main[salida].push({ node: a, type: "main", index: 0 });
};
const condicion = (expresion) => ({ conditions: { options: { typeValidation: "strict", version: 2 }, conditions: [{ id: "condicion", leftValue: expresion, rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } }], combinator: "and" }, options: {} });
flujo.nodes.find(n => n.name === "Secreto compartido").parameters.assignments.assignments.push(
  { id: "demo", name: "demo_confirmado", value: false, type: "boolean" },
);
// La memoria del flujo no decide la emisión: la reserva persistente viene de AlToque.
const verificador = flujo.nodes.find(n => n.name === "Verificar firma");
verificador.parameters.jsCode = verificador.parameters.jsCode.replace(/\/\/ Un mismo pago[\s\S]*?\/\/ Nunca se devuelve/, "const duplicado = false;\n// Nunca se devuelve");
flujo.nodes.push(
  nodo("Preparar boleta", "code", { jsCode: `${prepararBoleta.toString()}\nif ($('Secreto compartido').first().json.demo_confirmado !== true) return [];\nconst aviso = $('Verificar firma').first().json.aviso;\nconst solicitud = prepararBoleta(aviso);\nreturn solicitud ? [{json: {solicitud, aviso}}] : [];` }, [1440, 0]),
  nodo("Consultar boleta", "httpRequest", {
    method: "POST", url: "http://nubefact-demo:8080/comprobante", authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
    sendBody: true, specifyBody: "json", jsonBody: '={{ JSON.stringify({operacion: "consultar_comprobante", tipo_de_comprobante: 2, serie: $("Preparar boleta").first().json.solicitud.serie, numero: $("Preparar boleta").first().json.solicitud.numero}) }}',
    options: { timeout: 35000, redirect: { redirect: { followRedirects: false } }, response: { response: { neverError: true, fullResponse: true, responseFormat: "json" } } },
  }, [1680, 0], { onError: "continueRegularOutput" }),
  nodo("No existe en Nubefact", "if", condicion('={{ Number($json.body?.codigo) === 24 && $json.statusCode === 400 }}'), [1920, 0]),
  nodo("Emitir boleta DEMO", "httpRequest", {
    method: "POST", url: "http://nubefact-demo:8080/comprobante", authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
    sendBody: true, specifyBody: "json", jsonBody: '={{ JSON.stringify($("Preparar boleta").first().json.solicitud) }}',
    options: { timeout: 35000, redirect: { redirect: { followRedirects: false } }, response: { response: { neverError: true, fullResponse: true, responseFormat: "json" } } },
  }, [2160, -140], { onError: "continueRegularOutput" }),
  nodo("Resultado de emisión", "code", { jsCode: `${resultadoNubefact.toString()}\nconst aviso = $('Preparar boleta').first().json.aviso;\nreturn [{json: resultadoNubefact($input.first().json, aviso)}];` }, [2400, 0]),
  nodo("Firmar resultado", "code", { jsCode: "const crypto = require('crypto');\nconst cuerpo = JSON.stringify($input.first().json);\nconst tiempo = Math.floor(Date.now()/1000);\nconst secreto = $('Secreto compartido').first().json.secreto;\nconst firma = 'sha256=' + crypto.createHmac('sha256',secreto).update(`${tiempo}.${cuerpo}`,'utf8').digest('hex');\nreturn [{json:{cuerpo,tiempo:String(tiempo),firma}}];" }, [2640, 0]),
  nodo("Guardar en AlToque", "httpRequest", {
    method: "POST", url: "http://host.docker.internal:3000/api/n8n/comprobantes", sendHeaders: true,
    headerParameters: { parameters: [{ name: "X-AlToque-Timestamp", value: "={{ $json.tiempo }}" }, { name: "X-AlToque-Firma", value: "={{ $json.firma }}" }] },
    sendBody: true, contentType: "raw", rawContentType: "application/json", body: "={{ $json.cuerpo }}",
    options: { timeout: 10000, redirect: { redirect: { followRedirects: false } }, response: { response: { responseFormat: "json" } } },
  }, [2880, 0]),
  nodo("Tiene correo y boleta", "if", condicion('={{ $("Resultado de emisión").first().json.estado === "EMITIDO" && typeof $("Preparar boleta").first().json.aviso.cliente?.correo === "string" }}'), [3120, 0]),
);
const correo = JSON.parse(readFileSync(new URL("webhook-correo-prueba.json", raiz), "utf8")).nodes.find(n => n.type === "n8n-nodes-base.gmail");
correo.id = "correo-boleta"; correo.name = "Enviar boleta de prueba"; correo.position = [3360, 0];
correo.parameters.sendTo = '={{ $("Preparar boleta").first().json.aviso.cliente.correo }}';
correo.parameters.subject = '={{ "Tu boleta de prueba – " + $("Preparar boleta").first().json.aviso.restaurante.nombre }}';
correo.parameters.message = '={{ ["Comprobante de prueba, sin valor tributario.", "Boleta " + $("Resultado de emisión").first().json.serie + "-" + $("Resultado de emisión").first().json.numero, "PDF: " + $("Resultado de emisión").first().json.enlace_pdf, "XML: " + $("Resultado de emisión").first().json.enlace_xml].join(String.fromCharCode(10)) }}';
delete correo.credentials;
flujo.nodes.push(correo);
conectar("Siguiente paso (US-088 boleta, US-089 resumen)", "Preparar boleta");
conectar("Preparar boleta", "Consultar boleta");
conectar("Consultar boleta", "No existe en Nubefact");
conectar("No existe en Nubefact", "Emitir boleta DEMO", 0);
conectar("No existe en Nubefact", "Resultado de emisión", 1);
conectar("Emitir boleta DEMO", "Resultado de emisión");
conectar("Resultado de emisión", "Firmar resultado");
conectar("Firmar resultado", "Guardar en AlToque");
conectar("Guardar en AlToque", "Tiene correo y boleta");
conectar("Tiene correo y boleta", "Enviar boleta de prueba");
writeFileSync(new URL("boleta-nubefact.json", raiz), JSON.stringify(flujo, null, 2) + "\n");
