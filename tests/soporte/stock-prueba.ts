import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function fechaLima() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
type FilaStock = { quantity: number; sold: number };
type CopiaStock = { original: FilaStock | null; fecha: string };

// Nunca usa service_role: las pruebas ejercitan guardar_stock_diario como ADMIN.
export async function autenticarAdminStock(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const password = process.env.DEMO_PASSWORD;
  if (!url || !key || !password) throw new Error("Falta la configuración del admin demo para preparar stock.");
  const cliente = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await cliente.auth.signInWithPassword({ email: "admin@demo.altoque.pe", password });
  if (error) throw new Error("No se pudo autenticar el admin demo de stock.");
  return cliente;
}

export class StockPrueba {
  private cliente: SupabaseClient | undefined;
  private copias = new Map<string, CopiaStock>();
  constructor(private restaurante: string, private autenticar = autenticarAdminStock, private hoy = fechaLima) {}

  private async leer(productoId: string, fecha: string): Promise<FilaStock | null> {
    const { data, error } = await this.cliente!.from("product_daily_stock").select("quantity,sold")
      .eq("restaurant_id", this.restaurante).eq("product_id", productoId).eq("stock_date", fecha).maybeSingle();
    if (error) throw new Error("No se pudo guardar/verificar el stock anterior del producto de prueba.");
    return data ? { quantity: Number(data.quantity), sold: Number(data.sold) } : null;
  }
  private async guardar(productoId: string, fecha: string, cantidad: number | null) {
    const { error } = await this.cliente!.rpc("guardar_stock_diario", {
      p_restaurant_id: this.restaurante, p_stock_date: fecha, p_parcial: true,
      p_items: [{ productoId, cantidad }],
    });
    if (error) throw new Error(`Stock US-098: ${error.code ?? "ERROR"}. Verifica que la migración parcial esté aplicada y que no haya cambios concurrentes.`);
  }

  async preparar(productoId: string, unidades: number, opciones: { limitar?: boolean; exacto?: boolean } = {}) {
    if (!Number.isSafeInteger(unidades) || unidades < 0) throw new Error("Cantidad de prueba inválida.");
    this.cliente ??= await this.autenticar();
    const fecha = this.hoy();
    const copia = this.copias.get(productoId);
    if (copia && copia.fecha !== fecha) throw new Error("La prueba cruzó la medianoche de Lima; restaura el stock pendiente antes de continuar.");
    const actual = await this.leer(productoId, fecha);
    if (!copia) this.copias.set(productoId, { original: actual, fecha });
    // Un producto sin límite ya tiene disponibilidad: no inventar un límite temporal.
    const cantidad = actual || opciones.limitar || opciones.exacto
      ? (opciones.exacto ? (actual?.sold ?? 0) + unidades : Math.max(actual?.quantity ?? 0, (actual?.sold ?? 0) + unidades))
      : null;
    await this.guardar(productoId, fecha, cantidad);
    return { vendidos: actual?.sold ?? 0, fecha };
  }

  async restaurar() {
    const errores: string[] = [];
    if (this.copias.size) this.cliente ??= await this.autenticar();
    try {
      for (const [productoId, copia] of this.copias) {
        try {
          const actual = await this.leer(productoId, copia.fecha);
          if (!copia.original && !actual) { this.copias.delete(productoId); continue; }
          if (!copia.original && (actual?.sold ?? 0) > 0) throw new Error("Cancela o elimina primero los pedidos propios del producto temporal.");
          if (copia.original && !actual) throw new Error("Desapareció una fila de stock previa; no se reconstruye su contador.");
          // Conservar ventas registradas y devolver la disponibilidad anterior.
          const cantidad = copia.original ? copia.original.quantity - copia.original.sold + actual!.sold : null;
          await this.guardar(productoId, copia.fecha, cantidad);
          const final = await this.leer(productoId, copia.fecha);
          if (copia.original ? !final || final.quantity - final.sold !== copia.original.quantity - copia.original.sold : final !== null) {
            throw new Error("No se pudo verificar la restauración del stock.");
          }
          this.copias.delete(productoId);
        } catch (error) { errores.push(`${productoId}: ${error instanceof Error ? error.message : "fallo de restauración"}`); }
      }
    } finally {
      if (this.cliente) {
        try {
          const { error } = await this.cliente.auth.signOut({ scope: "local" });
          if (error) errores.push("No se pudo cerrar la sesión local del admin de stock.");
        } catch { errores.push("No se pudo cerrar la sesión local del admin de stock."); }
        finally { this.cliente = undefined; }
      }
    }
    if (errores.length) throw new Error(`Restauración de stock pendiente: ${errores.join("; ")}`);
  }
}
