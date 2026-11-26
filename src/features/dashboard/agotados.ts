import "server-only";

import { crearClienteServidor } from "../../lib/supabase/server";
import { fechasHoyAyer } from "./panel-vivo-logica";
import { DIAS_AGOTADOS, momentoQuiebre, sumarDias } from "./sugerencia-stock-logica";
import { rangoLimaAUtc } from "./ventas-logica";

export type PlatoAgotado = {
  productoId: string;
  nombre: string;
  fecha: string;
  stockInicial: number;
  // Momento aproximado del quiebre (ISO) o null si no se pudo estimar.
  quiebre: string | null;
};

type FilaVentaAgotada = {
  product_id: string;
  sales_date: string;
  initial_stock: number | null;
  producto: { name: string } | null;
};
type FilaStockHoy = {
  product_id: string;
  stock_date: string;
  quantity: number;
  sold: number;
  producto: { name: string } | null;
};
type FilaLinea = {
  product_id: string;
  quantity: number;
  pedido: { created_at: string } | null;
};
type Pagina<T> = { data: T[] | null; count: number | null; error: { code?: string } | null };

async function leerTodo<T>(origen: string, consultar: (desde: number, hasta: number) => PromiseLike<Pagina<T>>) {
  const filas: T[] = [];
  let total: number | null = null;
  while (true) {
    const { data, count, error } = await consultar(filas.length, filas.length + 499);
    if (error || data === null || count === null || (total !== null && total !== count)) {
      console.error(origen, error?.code ?? "incompleta");
      throw new Error("No se pudieron consultar los platos agotados.");
    }
    total = count;
    filas.push(...data);
    if (filas.length >= total) return filas;
    if (!data.length) throw new Error("No se pudieron consultar los platos agotados.");
  }
}

function fechaLima(instante: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(instante));
}

// US-146: platos que se agotaron hoy y en los últimos 7 días, con la hora aproximada
// del quiebre. Usa la sesión del dueño (RLS): solo ve su restaurante.
export async function obtenerAgotadosRecientes(
  restauranteId: string,
  ahora = Date.now(),
): Promise<PlatoAgotado[]> {
  if (typeof restauranteId !== "string" || !restauranteId.trim()) {
    throw new Error("No se pudo identificar el restaurante.");
  }
  const { hoy, ayer } = fechasHoyAyer(ahora);
  const desde = sumarDias(hoy, -DIAS_AGOTADOS);
  const supabase = await crearClienteServidor();

  const [pasados, deHoy] = await Promise.all([
    leerTodo<FilaVentaAgotada>("obtenerAgotadosRecientes:ventas", (inicio, fin) => supabase
      .from("daily_product_sales")
      .select("product_id, sales_date, initial_stock, producto:products!daily_product_sales_product_restaurant_fkey(name)",
        { count: "exact" })
      .eq("restaurant_id", restauranteId).eq("sold_out", true)
      .gte("sales_date", desde).lte("sales_date", ayer)
      .order("id").range(inicio, fin)
      .overrideTypes<FilaVentaAgotada[], { merge: false }>()),
    // El día de hoy aún no está consolidado: se mira el stock en vivo.
    leerTodo<FilaStockHoy>("obtenerAgotadosRecientes:stock", (inicio, fin) => supabase
      .from("product_daily_stock")
      .select("product_id, stock_date, quantity, sold, producto:products(name)",
        { count: "exact" })
      .eq("restaurant_id", restauranteId).eq("stock_date", hoy).gt("quantity", 0)
      .order("id").range(inicio, fin)
      .overrideTypes<FilaStockHoy[], { merge: false }>()),
  ]);

  const agotados: PlatoAgotado[] = [
    ...pasados.map(fila => ({
      productoId: fila.product_id, nombre: fila.producto?.name ?? "Plato", fecha: fila.sales_date,
      stockInicial: fila.initial_stock ?? 0, quiebre: null,
    })),
    ...deHoy.filter(fila => fila.sold >= fila.quantity).map(fila => ({
      productoId: fila.product_id, nombre: fila.producto?.name ?? "Plato", fecha: fila.stock_date,
      stockInicial: fila.quantity, quiebre: null,
    })),
  ];
  if (!agotados.length) return [];

  // Líneas que reservaron stock (como el contador del stock), de pedidos no cancelados.
  const { desdeUtc, hastaUtcExclusivo } = rangoLimaAUtc(desde, hoy);
  const lineas = await leerTodo<FilaLinea>("obtenerAgotadosRecientes:lineas", (inicio, fin) => supabase
    .from("order_items")
    .select("product_id, quantity, pedido:orders!inner(created_at)", { count: "exact" })
    .eq("orders.restaurant_id", restauranteId).neq("orders.status", "CANCELLED")
    .gte("orders.created_at", desdeUtc).lt("orders.created_at", hastaUtcExclusivo)
    .eq("stock_reserved", true)
    .in("product_id", [...new Set(agotados.map(fila => fila.productoId))])
    .order("id").range(inicio, fin)
    .overrideTypes<FilaLinea[], { merge: false }>());

  const porDia = new Map<string, { creadoEn: string; cantidad: number }[]>();
  for (const linea of lineas) {
    if (!linea.pedido) continue;
    const clave = `${linea.product_id}|${fechaLima(linea.pedido.created_at)}`;
    const grupo = porDia.get(clave) ?? [];
    grupo.push({ creadoEn: linea.pedido.created_at, cantidad: linea.quantity });
    porDia.set(clave, grupo);
  }

  return agotados
    .map(fila => ({
      ...fila,
      quiebre: momentoQuiebre(porDia.get(`${fila.productoId}|${fila.fecha}`) ?? [], fila.stockInicial),
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.nombre.localeCompare(b.nombre, "es"));
}
