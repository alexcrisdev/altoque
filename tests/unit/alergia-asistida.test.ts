import { describe, expect, it } from "vitest";
import { cambiarRespuestaAlergia } from "../../src/features/mesero/alergia-asistida";
import { validarAlergia, type AlergiaFormulario } from "../../src/features/pedidos/alergias";

describe("respuesta de alergia en pedido asistido", () => {
  const declaracion: AlergiaFormulario = {
    respuesta: "YES", alergenos: ["MANI", "HUEVO"], detalle: "Evitar contacto", aceptada: true,
  };

  it("conserva la declaración completa al seleccionar Sí repetidamente", () => {
    const primera = cambiarRespuestaAlergia(declaracion, "YES");
    const segunda = cambiarRespuestaAlergia(primera, "YES");
    expect(segunda).toEqual(declaracion);
    expect(segunda).toBe(declaracion);
  });

  it("al cambiar a No limpia la declaración como en el pedido QR", () => {
    const respuesta = cambiarRespuestaAlergia(declaracion, "NONE");
    expect(respuesta).toEqual({ respuesta: "NONE", alergenos: [], detalle: "", aceptada: false });
    expect(validarAlergia(respuesta)).toEqual({ ok: true, alergia: { respuesta: "NONE", alergenos: [], detalle: null } });
    expect(cambiarRespuestaAlergia(respuesta, "NONE")).toBe(respuesta);
  });
});
