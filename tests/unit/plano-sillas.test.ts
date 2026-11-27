import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  disposicionMesa,
  formaYSillas,
  mesasJuntas,
  validarFormaSillas,
  type FormaMesa,
} from "../../src/features/plano-mesas/sillas";
import { mueblesMesa, type Asiento } from "../../src/features/plano-mesas/maqueta";
import { mismaEscena } from "../../src/features/plano-mesas/escena-3d";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
vi.mock("@/features/auth/sesion", () => ({
  requerirRol: vi.fn(async () => ({ membresias: [{ rol: "OWNER", restaurantId: "r-1" }] })),
}));
vi.mock("../../src/features/acceso-qr/mesas", () => ({
  crearMesa: vi.fn(async () => "OK"), editarFormaMesa: vi.fn(async () => "OK"),
  cambiarEstadoMesa: vi.fn(), desactivarQr: vi.fn(), reemplazarQr: vi.fn(),
}));
vi.mock("../../src/features/acceso-qr/mostrador", () => ({ desactivarQrMostrador: vi.fn(), reemplazarQrMostrador: vi.fn() }));
vi.mock("../../src/features/acceso-qr/imagen-qr", () => ({ armarQr: vi.fn() }));

const { crearClienteServidor } = await import("@/lib/supabase/server");
const mesasDatos = await import("../../src/features/acceso-qr/mesas");
const { crearMesaAction, editarFormaMesaAction } = await import("../../src/features/acceso-qr/actions");
const { listarMesasDelPlano } = await import("../../src/features/plano-mesas/mesas-del-plano");

type Rect = { x1: number; y1: number; x2: number; y2: number };
const seMontan = (a: Rect, b: Rect) => a.x1 < b.x2 - 1e-9 && b.x1 < a.x2 - 1e-9 && a.y1 < b.y2 - 1e-9 && b.y1 < a.y2 - 1e-9;
const caja = (x: number, y: number, lado: number): Rect => ({ x1: x - lado / 2, y1: y - lado / 2, x2: x + lado / 2, y2: y + lado / 2 });
const FORMAS: FormaMesa[] = ["ROUND", "SQUARE"];

describe("Plano: cuántas mesas se dibujan", () => {
  it.each([[1, 1], [4, 1], [5, 2], [6, 2], [7, 3], [8, 3]])("%i sillas → %i mesa(s)", (sillas, mesas) => {
    expect(mesasJuntas(sillas)).toBe(mesas);
    expect(disposicionMesa(sillas).mesas).toHaveLength(mesas);
  });
});

describe("Plano: reparto de sillas", () => {
  for (let n = 1; n <= 8; n++) {
    it(`${n} sillas: todas dibujadas, sin montarse entre sí ni con la mesa, dentro de la casilla`, () => {
      const { sillas, silla, mesas, tablero } = disposicionMesa(n);
      expect(sillas).toHaveLength(n);
      const rects = sillas.map((s) => caja(s.x, s.y, silla));
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) expect(seMontan(rects[i], rects[j])).toBe(false);
        // El tablero cuadrado ocupa todo su lado; el redondo cabe dentro de ese cuadrado.
        for (const mesa of mesas) expect(seMontan(rects[i], caja(mesa.x, mesa.y, tablero))).toBe(false);
        // Casilla de 120 × 130 centrada: así no toca las sillas de la mesa vecina.
        expect(rects[i].x1).toBeGreaterThanOrEqual(-60);
        expect(rects[i].x2).toBeLessThanOrEqual(60);
        expect(rects[i].y1).toBeGreaterThanOrEqual(-65);
        expect(rects[i].y2).toBeLessThanOrEqual(65);
      }
    });
  }

  it.each(FORMAS)("con 8 sillas y forma %s, el dibujo 3D no sale de su casilla", (forma) => {
    const vertices = mueblesMesa({ celda: 0, estado: "libre", forma, sillas: 8 })
      .flatMap((m) => m.caras.flatMap((c) => c.vertices));
    expect(Math.min(...vertices.map((v) => v[0]))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...vertices.map((v) => v[0]))).toBeLessThanOrEqual(120);
    expect(Math.min(...vertices.map((v) => v[1]))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...vertices.map((v) => v[1]))).toBeLessThanOrEqual(130);
  });

  it("la forma cambia el tablero: cuadrada con 4 lados, redonda con 32", () => {
    const tapa = (forma: FormaMesa) => mueblesMesa({ celda: 0, estado: "libre", forma, sillas: 2 }).at(-1)!.caras;
    expect(tapa("SQUARE").some((c) => c.vertices.length === 32)).toBe(false);
    expect(tapa("ROUND").some((c) => c.vertices.length === 32)).toBe(true);
  });

  it.each([5, 6, 7, 8])("con %i sillas las mesas juntas son cuadradas aunque se elija redonda", (sillas) => {
    // El último mueble es la tapa de la última mesa (la base de la pata sí es redonda).
    const tapa = mueblesMesa({ celda: 0, estado: "libre", forma: "ROUND", sillas }).at(-1)!.caras;
    expect(tapa.some((c) => c.vertices.length === 32)).toBe(false);
    expect(mueblesMesa({ celda: 0, estado: "libre", forma: "ROUND", sillas })).toEqual(
      mueblesMesa({ celda: 0, estado: "libre", forma: "SQUARE", sillas }));
  });
});

describe("Plano: mesa antigua y lectura tolerante", () => {
  it("sin forma ni sillas se dibuja igual que redonda con 4 sillas", () => {
    const antigua: Asiento = { celda: 4, estado: "ocupada" };
    expect(mueblesMesa(antigua)).toEqual(mueblesMesa({ ...antigua, forma: "ROUND", sillas: 4 }));
    expect(formaYSillas({})).toEqual({ forma: "ROUND", sillas: 4 });
    expect(formaYSillas({ shape: null, capacity: null })).toEqual({ forma: "ROUND", sillas: 4 });
    expect(formaYSillas({ shape: "SQUARE", capacity: 6 })).toEqual({ forma: "SQUARE", sillas: 6 });
  });

  it("si la fila no trae shape (base sin migración), la mesa se lee redonda; sin capacity, con 4 sillas", async () => {
    const consulta = {
      select: vi.fn(() => consulta), eq: vi.fn(() => consulta), order: vi.fn(() => consulta),
      overrideTypes: vi.fn(async () => ({
        data: [{ id: "m-1", number: 1, active: true, branch_id: "l-1", floor_cell: null, branches: { name: "Centro" } }],
        error: null,
      })),
    };
    vi.mocked(crearClienteServidor).mockResolvedValue({ from: vi.fn(() => consulta) } as never);
    const [mesa] = await listarMesasDelPlano("r-1");
    expect(mesa).toMatchObject({ forma: "ROUND", sillas: 4 });
    // No nombra la columna nueva: no falla si todavía no existe.
    expect(consulta.select).toHaveBeenCalledWith("*, branches(name)");
  });

  it("el dibujo se actualiza al cambiar la forma o las sillas", () => {
    const base = { filas: 2, grados: 24, asientos: [{ celda: 0, estado: "libre" as const, forma: "ROUND" as const, sillas: 4 }] };
    expect(mismaEscena(base, { ...base, asientos: [{ ...base.asientos[0] }] })).toBe(true);
    expect(mismaEscena(base, { ...base, asientos: [{ ...base.asientos[0], sillas: 6 }] })).toBe(false);
    expect(mismaEscena(base, { ...base, asientos: [{ ...base.asientos[0], forma: "SQUARE" as never }] })).toBe(false);
  });
});

describe("Plano: validación del servidor", () => {
  it.each([["0"], ["9"], ["13"], ["2.5"], ["abc"], [""], [null], ["-3"], ["1e1"]])("rechaza sillas %j", (sillas) => {
    expect(validarFormaSillas("ROUND", sillas).ok).toBe(false);
  });

  it.each([["TRIANGLE"], ["round"], [null], [""]])("rechaza la forma %j", (forma) => {
    expect(validarFormaSillas(forma, "4").ok).toBe(false);
  });

  it("acepta de 1 a 8 en las dos formas", () => {
    expect(validarFormaSillas("ROUND", "1")).toEqual({ ok: true, forma: "ROUND", sillas: 1 });
    expect(validarFormaSillas("SQUARE", " 8 ")).toEqual({ ok: true, forma: "SQUARE", sillas: 8 });
    expect(validarFormaSillas("SQUARE", "9")).toEqual({ ok: false, mensaje: "Las sillas deben ser un número entero de 1 a 8." });
  });

  it("si la base trae más de 8 sillas, se dibuja con 8", () => {
    expect(formaYSillas({ shape: "SQUARE", capacity: 10 })).toEqual({ forma: "SQUARE", sillas: 8 });
  });

  describe("acciones", () => {
    const datos = (campos: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(campos)) f.set(k, v);
      return f;
    };
    const MESA = "30000000-0000-0000-0000-000000000001";
    beforeEach(() => vi.clearAllMocks());

    it("editar con datos inválidos no llega a la base", async () => {
      for (const [forma, sillas] of [["ROUND", "9"], ["HEXAGONAL", "4"], ["SQUARE", "4.5"], ["ROUND", "0"]]) {
        const r = await editarFormaMesaAction({ tipo: "inicial", mensaje: "" }, datos({ mesaId: MESA, forma, sillas }));
        expect(r.tipo).toBe("error");
      }
      expect((await editarFormaMesaAction({ tipo: "inicial", mensaje: "" }, datos({ mesaId: "x", forma: "ROUND", sillas: "4" }))).tipo).toBe("error");
      expect(mesasDatos.editarFormaMesa).not.toHaveBeenCalled();
    });

    it("editar válido guarda en la mesa del restaurante del dueño", async () => {
      const r = await editarFormaMesaAction({ tipo: "inicial", mensaje: "" }, datos({ mesaId: MESA, forma: "SQUARE", sillas: "8" }));
      expect(r.tipo).toBe("exito");
      expect(mesasDatos.editarFormaMesa).toHaveBeenCalledWith("r-1", MESA, "SQUARE", 8);
    });

    it("crear exige forma y sillas válidas", async () => {
      expect((await crearMesaAction({ error: null }, datos({ localId: "l-1", numero: "7", forma: "ROUND", sillas: "9" }))).error).toBeTruthy();
      expect(mesasDatos.crearMesa).not.toHaveBeenCalled();
      expect((await crearMesaAction({ error: null }, datos({ localId: "l-1", numero: "7", forma: "SQUARE", sillas: "6" }))).error).toBeNull();
      expect(mesasDatos.crearMesa).toHaveBeenCalledWith("r-1", "l-1", 7, "SQUARE", 6);
    });
  });
});
