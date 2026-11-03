import { Children, createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ErrorPantalla from "../../src/app/error";
import { Boton } from "../../src/components/ui/boton";
import { MensajeEstado } from "../../src/components/ui/mensaje-estado";

describe("estados accesibles US-042", () => {
  it.each([
    ["cargando", "Cargando los datos…", "status"],
    ["vacio", "No hay pedidos pendientes", "status"],
    ["error", "No pudimos cargar los datos", "alert"],
  ] as const)("anuncia el estado %s con su texto y rol", (tipo, titulo, rol) => {
    const html = renderToStaticMarkup(createElement(MensajeEstado, { tipo, titulo }));
    expect(html).toContain(`role="${rol}"`);
    expect(html).toContain(titulo);
    if (tipo === "cargando") expect(html).toContain('aria-busy="true"');
  });

  it("muestra un error comprensible con un título principal y sin datos internos", () => {
    const html = renderToStaticMarkup(createElement(ErrorPantalla, {
      error: new Error("detalle interno que no debe mostrarse"), retry: vi.fn(),
    }));
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("No pudimos cargar esta pantalla");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("detalle interno");
  });

  it("ofrece Reintentar con un botón real que ejecuta la recuperación", () => {
    const retry = vi.fn();
    const vista = ErrorPantalla({ error: new Error("Error de prueba"), retry });
    const boton = Children.toArray(vista.props.children).find((hijo) => isValidElement(hijo) && hijo.type === Boton) as ReactElement<{ onClick: () => void }>;
    expect(boton).toBeDefined();
    boton.props.onClick();
    expect(retry).toHaveBeenCalledExactlyOnceWith();
    const html = renderToStaticMarkup(vista);
    expect(html).toContain('type="button"');
    expect(html).toContain("Reintentar");
  });
});
