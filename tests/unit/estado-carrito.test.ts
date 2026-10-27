import { describe, expect, it } from "vitest";
import { obtenerEstadoCarrito } from "../../src/features/carta/estado-carrito";

describe("estado visual del carrito", () => {
  it("después del registro conserva la confirmación y oculta formulario y estado vacío", () => {
    expect(obtenerEstadoCarrito(0, { ok: true, numero: 42 })).toEqual({
      mostrarConfirmacion: true,
      mostrarVacio: false,
      mostrarFormulario: false,
    });
  });

  it("en un carrito vacío sin pedido previo muestra la invitación, no el formulario", () => {
    expect(obtenerEstadoCarrito(0, null)).toEqual({
      mostrarConfirmacion: false,
      mostrarVacio: true,
      mostrarFormulario: false,
    });
  });

  it("cuando hay productos muestra el formulario para el nuevo pedido", () => {
    expect(obtenerEstadoCarrito(1, null)).toEqual({
      mostrarConfirmacion: false,
      mostrarVacio: false,
      mostrarFormulario: true,
    });
  });
});
