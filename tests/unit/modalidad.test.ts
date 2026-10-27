import { describe, expect, it } from "vitest";
import { datosFaltantes, normalizarTelefono, validarModalidad } from "../../src/features/pedidos/modalidad";

const soloNombre = { pideNombre: true, pideTelefono: false };
const ambos = { pideNombre: true, pideTelefono: true };
const nada = { pideNombre: false, pideTelefono: false };

describe("validarModalidad", () => {
  it("sin opciones usa la modalidad del QR", () => {
    expect(validarModalidad(undefined, "DINE_IN", soloNombre)).toEqual({ ok: true, modalidad: "DINE_IN", nombre: null, telefono: null });
  });

  it("en el local descarta nombre y teléfono", () => {
    expect(validarModalidad({ modalidad: "DINE_IN", nombre: "Ana", telefono: "987654321" }, "DINE_IN", ambos))
      .toEqual({ ok: true, modalidad: "DINE_IN", nombre: null, telefono: null });
  });

  it("desde una mesa permite para llevar con los datos pedidos", () => {
    expect(validarModalidad({ modalidad: "TAKEAWAY", nombre: "  Ana  ", telefono: "+51 987-654-321" }, "DINE_IN", ambos))
      .toEqual({ ok: true, modalidad: "TAKEAWAY", nombre: "Ana", telefono: "+51987654321" });
  });

  it("un QR de mostrador no permite elegir en el local", () => {
    expect(validarModalidad({ modalidad: "DINE_IN" }, "TAKEAWAY", nada)).toMatchObject({ ok: false });
  });

  it("rechaza modalidades desconocidas", () => {
    expect(validarModalidad({ modalidad: "DELIVERY" }, "DINE_IN", nada)).toMatchObject({ ok: false });
  });

  it("exige solo los datos que pide el restaurante", () => {
    expect(validarModalidad({ modalidad: "TAKEAWAY" }, "TAKEAWAY", soloNombre)).toMatchObject({ ok: false });
    expect(validarModalidad({ modalidad: "TAKEAWAY", nombre: "Ana" }, "TAKEAWAY", soloNombre)).toMatchObject({ ok: true, telefono: null });
    expect(validarModalidad({ modalidad: "TAKEAWAY", nombre: "Ana" }, "TAKEAWAY", ambos)).toMatchObject({ ok: false });
    expect(validarModalidad({ modalidad: "TAKEAWAY" }, "TAKEAWAY", nada)).toEqual({ ok: true, modalidad: "TAKEAWAY", nombre: null, telefono: null });
  });

  it("valida el formato aunque el dato sea opcional", () => {
    expect(validarModalidad({ modalidad: "TAKEAWAY", nombre: "A" }, "TAKEAWAY", nada)).toMatchObject({ ok: false });
    expect(validarModalidad({ modalidad: "TAKEAWAY", telefono: "abc123" }, "TAKEAWAY", nada)).toMatchObject({ ok: false });
  });
});

describe("ayudas", () => {
  it("normaliza el teléfono y detecta datos faltantes", () => {
    expect(normalizarTelefono("987 654-321")).toBe("987654321");
    expect(datosFaltantes("DINE_IN", "", "", ambos)).toBeNull();
    expect(datosFaltantes("TAKEAWAY", "", "", soloNombre)).toContain("nombre");
  });
});

import { describirDestino } from "../../src/features/pedidos/modalidad";

describe("describirDestino", () => {
  it("muestra la mesa o los datos para llevar al personal", () => {
    expect(describirDestino({ modalidad: "DINE_IN", mesaNumero: 3, nombre: null, telefono: null })).toBe("Mesa 3");
    expect(describirDestino({ modalidad: "TAKEAWAY", mesaNumero: null, nombre: "Ana", telefono: "987654321" })).toBe("Para llevar · Ana · 987654321");
    expect(describirDestino({ modalidad: "TAKEAWAY", mesaNumero: null, nombre: null, telefono: null })).toBe("Para llevar");
  });
});
