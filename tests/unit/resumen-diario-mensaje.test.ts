import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  crearMensajeResumenDiario,
} from "../../infra/n8n/flujos/resumen-diario-logica.mjs";
import {
  calcularResumenDiario,
  type ResumenDiario,
} from "../../src/features/dashboard/resumen-diario-logica";

const flujo = JSON.parse(
  readFileSync(
    new URL(
      "../../infra/n8n/flujos/resumen-diario.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

type Nodo = {
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  credentials?: unknown;
};

const nodos: Nodo[] = flujo.nodes;

function resumen(): ResumenDiario {
  return calcularResumenDiario({
    restaurante: {
      id: "10000000-0000-0000-0000-000000000001",
      nombre: "Demo",
    },
    fecha: "2026-11-15",
    pagos: [],
    pedidos: [],
    cierres: [],
    predicciones: [],
  });
}

describe("US-089: mensaje y flujo n8n", () => {
  it("un día vacío muestra cero y omite la preparación", () => {
    const mensaje = crearMensajeResumenDiario(resumen());

    expect(mensaje.texto)
      .toContain("Total vendido: S/ 0.00");
    expect(mensaje.texto)
      .toContain("Pedidos no cancelados: 0");
    expect(mensaje.texto).not.toContain("Mañana");
    expect(mensaje.html).not.toContain("Mañana");
  });

  it("muestra métodos, plato y cierres con excepción", () => {
    const datos = resumen();

    datos.total_vendido = 100;
    datos.ventas_por_metodo = {
      efectivo: 10,
      yape: 20,
      tarjeta_caja: 30,
      tarjeta_en_linea: 40,
    };
    datos.pedidos = 5;
    datos.plato_mas_vendido = {
      nombre: "Ceviche",
      cantidad: 7,
    };
    datos.cierres_con_excepcion = {
      cantidad: 1,
      motivos: ["Cortesía autorizada"],
    };

    const mensaje = crearMensajeResumenDiario(datos);

    for (const texto of [
      "Total vendido: S/ 100.00",
      "Yape: S/ 20.00",
      "Tarjeta en caja: S/ 30.00",
      "Tarjeta en línea: S/ 40.00",
      "Ceviche · 7 unidades",
      "Cortesía autorizada",
    ]) {
      expect(mensaje.texto).toContain(texto);
    }
  });

  it("termina con la línea de los tres platos previstos", () => {
    const datos = resumen();

    datos.manana_prepara = [
      "Ceviche clásico",
      "Ceviche mixto",
      "Chicharrón de pescado",
    ].map((nombre, i) => ({
      nombre,
      cantidad: [46, 38, 25][i],
      fecha: "2026-11-16",
      dia: "lunes",
      modelo: "modelo-v1",
    }));

    const ultimaLinea = crearMensajeResumenDiario(datos)
      .texto.split("\n").at(-1);

    expect(ultimaLinea).toBe(
      "Mañana lunes: prepara ~46 Ceviche clásico, ~38 Ceviche mixto, ~25 Chicharrón de pescado",
    );
  });

  it("identifica la demo sin cambiar la última línea", () => {
    const datos = resumen();

    datos.manana_prepara = [{
      nombre: "Ceviche",
      cantidad: 46,
      fecha: "2026-11-16",
      dia: "lunes",
      modelo: "v1-demo",
    }];

    const mensaje = crearMensajeResumenDiario(datos);

    expect(mensaje.texto).toContain("demostración");
    expect(
      mensaje.texto.endsWith(
        "Mañana lunes: prepara ~46 Ceviche",
      ),
    ).toBe(true);
  });

  it("escapa HTML procedente de nombres y motivos", () => {
    const datos = resumen();

    datos.restaurante.nombre =
      "Demo <script>alert(1)</script>";

    datos.cierres_con_excepcion = {
      cantidad: 1,
      motivos: ["<img src=x onerror=alert(1)>"],
    };

    const mensaje = crearMensajeResumenDiario(datos);

    expect(mensaje.html).not.toContain("<script>");
    expect(mensaje.html).not.toContain("<img");
    expect(mensaje.html).toContain("&lt;script&gt;");
    expect(mensaje.html).toContain("&lt;img");
  });

  it("no permite saltos de línea en el asunto", () => {
    const datos = resumen();
    datos.restaurante.nombre = "Demo\r\nOtro";

    expect(crearMensajeResumenDiario(datos).asunto)
      .not.toMatch(/[\r\n]/);
  });

  it.each([
    -1,
    NaN,
    Infinity,
    1.234,
  ])("rechaza el importe inválido %s", monto => {
    const datos = resumen();
    datos.total_vendido = monto;

    expect(() => crearMensajeResumenDiario(datos))
      .toThrow();
  });

  it("rechaza un desglose que no coincide con el total", () => {
    const datos = resumen();
    datos.total_vendido = 10;

    expect(() => crearMensajeResumenDiario(datos))
      .toThrow("desglose");
  });

  it("rechaza una predicción que no corresponde a mañana", () => {
    const datos = resumen();

    datos.manana_prepara = [{
      nombre: "Ceviche",
      cantidad: 46,
      fecha: "2026-11-17",
      dia: "martes",
      modelo: "v1",
    }];

    expect(() => crearMensajeResumenDiario(datos))
      .toThrow("mañana");
  });

  it("tiene horario a las 23 de Lima y arranque manual", () => {
    expect(flujo.active).toBe(false);
    expect(flujo.settings.timezone)
      .toBe("America/Lima");

    const horario = nodos.find(
      nodo => nodo.type.endsWith(".scheduleTrigger"),
    );

    expect(horario?.parameters).toEqual({
      rule: {
        interval: [{
          field: "cronExpression",
          expression: "0 0 23 * * *",
        }],
      },
    });

    expect(
      nodos.some(
        nodo => nodo.type.endsWith(".manualTrigger"),
      ),
    ).toBe(true);

    for (const origen of [
      "Cada noche a las 23",
      "Ejecutar manualmente",
    ]) {
      expect(
        flujo.connections[origen].main[0][0].node,
      ).toBe("Configuración");
    }
  });

  it("no exporta credenciales ni valores privados", () => {
    expect(
      nodos.every(nodo => !nodo.credentials),
    ).toBe(true);

    expect(flujo.pinData).toEqual({});

    const config = nodos.find(
      nodo => nodo.name === "Configuración",
    )!;

    expect(config.parameters.assignments).toEqual({
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
    });
  });

  it("exige Header Auth y desactiva redirecciones", () => {
    const http = nodos.find(
      nodo => nodo.name === "Consultar resumen",
    )!;

    expect(http.parameters).toMatchObject({
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      options: {
        redirect: {
          redirect: {
            followRedirects: false,
          },
        },
      },
    });
  });

  it("incorpora y ejecuta la función del archivo fuente", () => {
    const codigo = nodos.find(
      nodo => nodo.name === "Preparar correo",
    )!.parameters.jsCode as string;

    const fuente = readFileSync(
      new URL(
        "../../infra/n8n/flujos/resumen-diario-logica.mjs",
        import.meta.url,
      ),
      "utf8",
    );

    const inicio =
      fuente.indexOf("export function") +
      "export ".length;

    expect(codigo.replace(/\r\n/g, "\n")).toContain(
        fuente.slice(inicio).trim().replace(/\r\n/g, "\n"),
    );

    const ejecutar = new Function(
      "$input",
      "$",
      codigo,
    );

    const configuracion = {
      restaurante: resumen().restaurante.id,
      destinatario: "prueba@example.invalid",
    };

    const resultado = ejecutar(
      { first: () => ({ json: resumen() }) },
      () => ({
        first: () => ({ json: configuracion }),
      }),
    );

    expect(resultado[0].json.html)
      .toContain("S/ 0.00");
  });

  it("bloquea configuración vacía y admite el host de Docker", () => {
    const codigo = nodos.find(
      nodo => nodo.name === "Validar configuración",
    )!.parameters.jsCode as string;

    const ejecutar = new Function("$input", codigo);

    expect(() =>
      ejecutar({ first: () => ({ json: {} }) }),
    ).toThrow("URL");

    const config = {
      url_altoque: "http://host.docker.internal:3007",
      restaurante: resumen().restaurante.id,
      destinatario: "prueba@example.invalid",
    };

    const resultado = ejecutar({
      first: () => ({ json: config }),
    });

    expect(resultado[0].json).toEqual(config);
  });
});