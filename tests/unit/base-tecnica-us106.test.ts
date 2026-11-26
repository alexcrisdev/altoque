import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { entradaAccesoDenegado, rutaParaRegistro } from "../../src/features/auth/registro-accesos-logica";
import { entradaError } from "../../src/lib/registro";
import ErrorGlobal from "../../src/app/global-error";

describe("US-106 (Fase C): registro de accesos denegados sin datos personales", () => {
  it("solo guarda evento, ruta, roles y hora", () => {
    const entrada = entradaAccesoDenegado("/caja/mesa/123", ["WAITER"], new Date("2026-11-25T15:00:00Z"));
    expect(entrada).toEqual({ evento: "acceso_denegado", ruta: "/caja/mesa/123", roles: ["WAITER"], hora: "2026-11-25T15:00:00.000Z" });
  });
  it("quita parámetros de búsqueda y descarta rutas raras", () => {
    expect(rutaParaRegistro("/admin/cuentas?token=abc&correo=a@b.pe")).toBe("/admin/cuentas");
    expect(rutaParaRegistro("/caja/<script>")).toBe("desconocida");
    expect(rutaParaRegistro("https://otro.sitio/admin")).toBe("desconocida");
    expect(rutaParaRegistro(null)).toBe("desconocida");
  });
  it("solo registra códigos de rol conocidos, sin repetir", () => {
    expect(entradaAccesoDenegado("/admin", ["WAITER", "CASHIER", "WAITER", "dueno@demo.altoque.pe"]).roles).toEqual(["CASHIER", "WAITER"]);
  });
});

describe("US-106 (Fase C): errores sin tokens, correos, contraseñas ni datos de clientes", () => {
  it("nunca registra el mensaje del error", () => {
    const error = Object.assign(new Error("fallo con cliente@correo.pe y token sb_secret_123"), { code: "PGRST301" });
    const texto = JSON.stringify(entradaError("prueba", error));
    expect(texto).not.toContain("cliente@correo.pe");
    expect(texto).not.toContain("sb_secret_123");
    expect(entradaError("prueba", error)).toEqual({ evento: "error", origen: "prueba", tipo: "Error", codigo: "PGRST301" });
  });
  it("descarta códigos que no parecen códigos", () => {
    expect(entradaError("x", { code: "clave: 123 abc@correo.pe" }).codigo).toBeNull();
  });

  it("ningún console.* del código registra mensajes de error, objetos de error ni datos sensibles", () => {
    const archivos: string[] = [];
    const recorrer = (carpeta: string) => {
      for (const nombre of readdirSync(carpeta)) {
        const ruta = join(carpeta, nombre);
        if (statSync(ruta).isDirectory()) recorrer(ruta);
        else if (/\.(ts|tsx)$/.test(nombre)) archivos.push(ruta);
      }
    };
    recorrer(join(process.cwd(), "src"));
    // Los dos registradores oficiales arman su salida con entradas ya limpias (probadas arriba).
    const permitidos = [join("src", "lib", "registro.ts"), join("src", "features", "auth", "registro-accesos.ts")];
    const peligroso = /\.message\b|password|contrase|email|correo|token|customer_|phone|telefono|,\s*(error|err|e)\s*\)/i;
    const hallazgos = archivos
      .filter((archivo) => !permitidos.some((permitido) => archivo.endsWith(permitido)))
      .flatMap((archivo) => readFileSync(archivo, "utf8").split("\n")
        .map((linea, i) => ({ linea, i }))
        .filter(({ linea }) => /console\.(log|warn|error|info)\(/.test(linea) && peligroso.test(linea))
        .map(({ linea, i }) => `${archivo}:${i + 1}: ${linea.trim()}`));
    expect(hallazgos).toEqual([]);
  });
});

describe("US-106 (Fase C): las pruebas no dejan cuentas abiertas", () => {
  it("toda prueba cierra solo su propia sesión (signOut con scope local)", () => {
    const archivos: string[] = [];
    const recorrer = (carpeta: string) => {
      for (const nombre of readdirSync(carpeta)) {
        const ruta = join(carpeta, nombre);
        if (statSync(ruta).isDirectory()) recorrer(ruta);
        else if (/\.(ts|tsx|mjs)$/.test(nombre)) archivos.push(ruta);
      }
    };
    recorrer(join(process.cwd(), "tests"));
    // signOut() sin opciones cierra TODAS las sesiones de la cuenta (también las de otros).
    const sinAlcance = archivos.flatMap((archivo) => readFileSync(archivo, "utf8").split("\n")
      .map((linea, i) => ({ linea, i }))
      .filter(({ linea }) => /\.auth\.signOut\(\s*\)/.test(linea))
      .map(({ i }) => `${archivo}:${i + 1}`));
    expect(sinAlcance).toEqual([]);
  });
});

describe("US-106 (Fase C): global-error amable", () => {
  it("muestra un mensaje simple y el código de referencia, nunca el detalle interno", () => {
    const error = Object.assign(new Error("fallo interno con cliente@correo.pe"), { digest: "123456" });
    const html = renderToStaticMarkup(createElement(ErrorGlobal, { error, retry: () => {} }));
    expect(html).toContain("Algo salió mal");
    expect(html).toContain("Reintentar");
    expect(html).toContain("123456");
    expect(html).not.toContain("cliente@correo.pe");
    expect(html).toContain('lang="es"');
  });
});
