import { describe, expect, it } from "vitest";
import { LIMITES, type ItemPedido } from "../../src/features/pedidos/tipos";
import {
  aCentimos,
  mensajeProblema,
  validarEstructura,
  validarItems,
  type ProductoVigente,
} from "../../src/features/pedidos/validacion";

const ceviche: ProductoVigente = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  nombre: "Ceviche clásico",
  precioCentimos: 3200,
  activo: true,
  disponible: true,
};
const bebida: ProductoVigente = {
  ...ceviche,
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  nombre: "Chicha morada",
  precioCentimos: 1250,
};
const item: ItemPedido = {
  productoId: ceviche.id,
  cantidad: 2,
  observacion: null,
  precioMostradoCentimos: 3200,
};

describe("aCentimos", () => {
  it.each([[32, 3200], ["32.90", 3290], [0.1 + 0.2, 30]] as const)(
    "convierte %s a %s céntimos", (precio, esperado) => {
      expect(aCentimos(precio)).toBe(esperado);
    },
  );
});

describe("validarEstructura", () => {
  it("acepta un ítem, recorta la observación y descarta importes ajenos al contrato", () => {
    const entrada = { ...item, observacion: "  Sin ají  ", totalCentimos: 1 };
    expect(validarEstructura([entrada])).toEqual([{ ...item, observacion: "Sin ají" }]);
    expect(entrada.observacion).toBe("  Sin ají  ");
  });

  it.each([0, -1, 1.5, LIMITES.cantidadMax + 1, NaN, Infinity, "2"])(
    "rechaza la cantidad %s", (cantidad) => {
      expect(validarEstructura([{ ...item, cantidad }])).toBeNull();
    },
  );

  it("acepta cantidades en ambos límites y el máximo de ítems y caracteres", () => {
    expect(validarEstructura([{ ...item, cantidad: LIMITES.cantidadMin }])).not.toBeNull();
    const maximo = Array.from({ length: LIMITES.itemsMax }, () => ({
      ...item, cantidad: LIMITES.cantidadMax, observacion: "a".repeat(LIMITES.observacionMax),
    }));
    expect(validarEstructura(maximo)).toEqual(maximo);
  });

  it("rechaza observaciones demasiado largas después de recortarlas", () => {
    expect(validarEstructura([{ ...item, observacion: "a".repeat(LIMITES.observacionMax + 1) }])).toBeNull();
    expect(validarEstructura([{ ...item, observacion: `  ${"a".repeat(LIMITES.observacionMax)}  ` }])).not.toBeNull();
  });

  it.each([undefined, 5, {}, []])("rechaza una observación de tipo inválido: %s", (observacion) => {
    expect(validarEstructura([{ ...item, observacion }])).toBeNull();
  });

  it("rechaza listas vacías o que superan el máximo", () => {
    expect(validarEstructura([])).toBeNull();
    expect(validarEstructura(Array(LIMITES.itemsMax + 1).fill(item))).toBeNull();
  });

  it.each([null, undefined, {}, "pedido", 123, [null], [[]], [{}]])(
    "rechaza una entrada mal formada: %s", (entrada) => {
      expect(validarEstructura(entrada)).toBeNull();
    },
  );

  it.each(["", "no-es-uuid", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa", null, 123])(
    "rechaza un identificador inválido: %s", (productoId) => {
      expect(validarEstructura([{ ...item, productoId }])).toBeNull();
    },
  );

  it("normaliza un UUID en mayúsculas", () => {
    expect(validarEstructura([{ ...item, productoId: ceviche.id.toUpperCase() }])).toEqual([item]);
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "3200", null, undefined])(
    "rechaza un precio mostrado inválido: %s", (precioMostradoCentimos) => {
      expect(validarEstructura([{ ...item, precioMostradoCentimos }])).toBeNull();
    },
  );

  it("acepta un precio mostrado de cero", () => {
    expect(validarEstructura([{ ...item, precioMostradoCentimos: 0 }])).not.toBeNull();
  });
});

describe("validarItems", () => {
  it("recalcula las líneas y el total con los precios vigentes", () => {
    const itemBebida = { ...item, productoId: bebida.id, cantidad: 3, precioMostradoCentimos: 1250 };
    expect(validarItems([item, itemBebida], [ceviche, bebida])).toEqual({
      ok: true,
      lineas: [
        { productoId: ceviche.id, nombre: ceviche.nombre, cantidad: 2, observacion: null, precioUnitarioCentimos: 3200, subtotalCentimos: 6400 },
        { productoId: bebida.id, nombre: bebida.nombre, cantidad: 3, observacion: null, precioUnitarioCentimos: 1250, subtotalCentimos: 3750 },
      ],
      totalCentimos: 10150,
    });
  });

  it("descarta el total enviado por el navegador", () => {
    const entrada = validarEstructura([{ ...item, subtotalCentimos: 1, totalCentimos: 1 }]);
    expect(entrada).not.toBeNull();
    expect(validarItems(entrada!, [ceviche])).toMatchObject({ ok: true, totalCentimos: 6400 });
  });

  it("un precio mostrado manipulado no produce un total ni un pedido válido", () => {
    const resultado = validarItems([{ ...item, precioMostradoCentimos: 1 }], [ceviche]);
    expect(resultado).toEqual({
      ok: false,
      problemas: [{ productoId: ceviche.id, nombre: ceviche.nombre, motivo: "PRECIO_CAMBIO", precioActualCentimos: 3200 }],
    });
    expect(resultado).not.toHaveProperty("totalCentimos");
    expect(resultado).not.toHaveProperty("lineas");
  });

  it.each([
    { cambio: { disponible: false }, motivo: "AGOTADO" },
    { cambio: { activo: false }, motivo: "INACTIVO" },
  ])("informa $motivo", ({ cambio, motivo }) => {
    expect(validarItems([item], [{ ...ceviche, ...cambio }])).toEqual({
      ok: false, problemas: [{ productoId: ceviche.id, nombre: ceviche.nombre, motivo }],
    });
  });

  it("informa un producto inexistente", () => {
    expect(validarItems([item], [])).toEqual({
      ok: false, problemas: [{ productoId: ceviche.id, motivo: "NO_EXISTE" }],
    });
  });

  it.each([3400, 3000])("informa un precio vigente de %s aunque el cambio favorezca al cliente", (precioCentimos) => {
    expect(validarItems([item], [{ ...ceviche, precioCentimos }])).toEqual({
      ok: false,
      problemas: [{ productoId: ceviche.id, nombre: ceviche.nombre, motivo: "PRECIO_CAMBIO", precioActualCentimos: precioCentimos }],
    });
  });

  it("conserva líneas repetidas con observaciones distintas", () => {
    const resultado = validarItems([item, { ...item, cantidad: 1, observacion: "Sin ají" }], [ceviche]);
    expect(resultado).toMatchObject({
      ok: true, totalCentimos: 9600,
      lineas: [{ cantidad: 2, observacion: null }, { cantidad: 1, observacion: "Sin ají" }],
    });
  });

  it("acumula todos los problemas de todos los productos", () => {
    expect(validarItems([item, { ...item, productoId: bebida.id }], [
      { ...ceviche, activo: false, disponible: false, precioCentimos: 3400 },
    ])).toEqual({
      ok: false,
      problemas: [
        { productoId: ceviche.id, nombre: ceviche.nombre, motivo: "INACTIVO" },
        { productoId: ceviche.id, nombre: ceviche.nombre, motivo: "AGOTADO" },
        { productoId: ceviche.id, nombre: ceviche.nombre, motivo: "PRECIO_CAMBIO", precioActualCentimos: 3400 },
        { productoId: bebida.id, motivo: "NO_EXISTE" },
      ],
    });
  });
});

describe("mensajeProblema", () => {
  it("explica que un producto está agotado", () => {
    expect(mensajeProblema({ productoId: ceviche.id, nombre: "Leche de tigre", motivo: "AGOTADO" })).toBe("Leche de tigre está agotado.");
  });

  it("muestra el precio nuevo en soles", () => {
    const mensaje = mensajeProblema({ productoId: ceviche.id, nombre: ceviche.nombre, motivo: "PRECIO_CAMBIO", precioActualCentimos: 3400 });
    expect(mensaje.replace(/\s/g, " ")).toBe("El precio de Ceviche clásico cambió a S/ 34.00.");
  });

  it("explica un producto inactivo y uno sin nombre", () => {
    expect(mensajeProblema({ productoId: ceviche.id, nombre: ceviche.nombre, motivo: "INACTIVO" })).toBe("Ceviche clásico ya no está activo en la carta.");
    expect(mensajeProblema({ productoId: ceviche.id, motivo: "NO_EXISTE" })).toBe("El producto ya no existe en la carta de este restaurante.");
  });
});
