import { describe, expect, it } from "vitest";
import { crearCsvVentas, fechaNombreCsv, type FilaVentaCsv } from "../../src/features/dashboard/ventas-csv-logica";

describe("CSV de pagos confirmados", () => {
  it("incluye BOM UTF-8, identificadores de pago/cuenta y escape CSV", () => {
    const csv = crearCsvVentas([{
      fechaHora: "12/11/2026, 10:00:00",
      pagoId: 'pago "uno"',
      cuentaId: "mesa, sesión\nA",
      modalidad: "En mesa",
      importeCentimos: 1250,
    }]);
    const [cabecera, fila] = csv.slice(1).split("\r\n");

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(cabecera).toContain("Fecha y hora de confirmación");
    expect(cabecera).toContain("ID del pago");
    expect(cabecera).toContain("ID de cuenta o pedido");
    expect(cabecera).toContain("Importe del pago (S/)");
    expect(cabecera).not.toMatch(/producto|cantidad/i);
    expect(fila).toContain('"pago ""uno"""');
    expect(fila).toContain('"mesa, sesión\nA"');
    expect(fila).toContain('"En mesa",12.50');
  });

  it.each(["=1+1", " +1+1", "\t@SUM(A1)", "\r-2", "＝1+1"])(
    "neutraliza fórmula con prefijo peligroso %j",
    (valor) => {
      const csv = crearCsvVentas([{
        fechaHora: "fecha", pagoId: "pago-1", cuentaId: valor,
        modalidad: "En mesa", importeCentimos: 100,
      }]);
      expect(csv).toContain(`'${valor.replaceAll('"', '""')}`);
    },
  );

  it("conserva los importes numéricos y suma los importes de cada pago", () => {
    const filas: FilaVentaCsv[] = [
      { fechaHora: "a", pagoId: "p1", cuentaId: "s1", modalidad: "En mesa", importeCentimos: 125 },
      { fechaHora: "b", pagoId: "p2", cuentaId: "s1", modalidad: "En mesa", importeCentimos: 275 },
    ];
    const csv = crearCsvVentas(filas);
    const registros = csv.split("\r\n").slice(1, -1);
    const importes = registros.map((fila) => Number(fila.split(",")[4]));

    expect(registros).toHaveLength(2);
    expect(importes.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("nombra el archivo con la fecha actual de Lima", () => {
    expect(fechaNombreCsv(new Date("2026-11-12T03:00:00Z"))).toBe("2026-11-11");
  });
});
