import type { MesaConSesion } from "@/features/mesero/sesiones";
import type { CuentaAbierta } from "@/features/pago-cierre/cuentas";

type MesaSalon = { id: string; numero: number; activa: boolean; celda: number | null; local: string; localId: string };
export const etiquetas = { libre: "Libre", ocupada: "Ocupada", espera: "Esperando pago", inactiva: "Inactiva" } as const;
export type MesaPlano = MesaSalon & {
  estado: keyof typeof etiquetas;
  href: string | null;
  saldo: number | null;
  qr?: string;
};

export function prepararPlano(mesas: MesaSalon[], sesiones: MesaConSesion[], cuentas: Pick<CuentaAbierta, "href" | "saldoCentimos" | "esperaPagoDesde">[]): MesaPlano[] {
  const porMesa = new Map(sesiones.map(mesa => [mesa.id, mesa.sesion]));
  const porEnlace = new Map(cuentas.map(cuenta => [cuenta.href, cuenta]));
  return mesas.map(mesa => {
    const sesion = porMesa.get(mesa.id);
    const href = sesion ? `/caja/mesa/${sesion.id}` : null;
    const cuenta = href ? porEnlace.get(href) : undefined;
    return { ...mesa, href, saldo: cuenta?.saldoCentimos ?? null,
      estado: !mesa.activa ? "inactiva" : cuenta?.esperaPagoDesde ? "espera" : sesion ? "ocupada" : "libre" };
  });
}
