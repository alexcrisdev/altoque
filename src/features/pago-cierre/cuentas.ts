import "server-only";
import { etiquetaNumeroDia } from "../pedidos/numero-dia";
import { leerAlergia, type FilaAlergia } from "../pedidos/alergias";
import { crearClienteServidor } from "../../lib/supabase/server";
import { crearClienteAdmin } from "../../lib/supabase/admin";
import { estadoLiberacion, type EstadoLiberacion } from "../mesero/liberacion-logica";
import { aCentimos } from "../pedidos/validacion";
import type { EstadoPedido } from "@/features/pedidos/estados";
import {
  calcularCuenta,
  type EstadoPago,
  type MetodoPago,
  type PagoCuenta,
  type PedidoCuenta,
  type ResumenCuenta,
  ordenarCuentasCaja,
} from "./cuenta-logica";
import type { CierreCuenta } from "./cierre-logica";
import { aCierreCuenta, COLUMNAS_CIERRE, type FilaCierre } from "./cierres";
import type { ComprobanteCuenta } from "./comprobante-logica";

// US-021: capa de datos de la cuenta. Usa la sesión del usuario, así RLS
// solo deja ver pedidos y pagos de su propio restaurante.

export type CuentaMesa = ResumenCuenta & {
  comprobante: ComprobanteCuenta | null;
  tipo: "MESA";
  sesionId: string;
  mesaNumero: number;
  abiertaDesde: string;
  cerrada: boolean;
  cierre: CierreCuenta | null; // US-020: quién, cuándo e importes del cierre
};

export type CuentaParaLlevar = ResumenCuenta & {
  comprobante: ComprobanteCuenta | null;
  tipo: "PARA_LLEVAR";
  pedidoId: string;
  numero: number;
  nombre: string | null;
  cierre: CierreCuenta | null;
};

export type CuentaAbierta = {
  href: string;
  titulo: string;
  detalle: string;
  consumoCentimos: number;
  pagadoCentimos: number;
  saldoCentimos: number;
  porVerificar: number; // US-020: pagos Yape pendientes de confirmar
  esperaPagoDesde: string | null;
};

// US-020: un pedido para llevar ya pagado sigue en caja hasta que alguien cierre su
// cuenta. Los de hace más de 12 horas se dejan de mostrar para no llenar la lista.
const HORAS_PARA_LLEVAR_PAGADO = 12;

type FilaPedido = FilaAlergia & {
  id: string;
  order_number: number;
  daily_number?: number | null; // US-105: número del día
  business_date?: string | null;
  status: EstadoPedido;
  created_at: string;
  table_session_id: string | null;
  customer_name: string | null;
  order_items: { product_name: string; quantity: number; unit_price: number | string; observation: string | null }[];
};

type FilaPago = {
  payment_proof_id?: string | null;
  id: string;
  method: MetodoPago;
  status: EstadoPago;
  amount: number | string;
  received_amount: number | string | null;
  change_amount: number | string | null;
  reference: string | null;
  stripe_session_id: string | null;
  verified_at: string | null;
  verificador: { full_name: string } | null;
  registrador: { full_name: string } | null;
  created_by?: string | null;
  created_at: string;
  table_session_id: string | null;
  order_id: string | null;
};

type FilaSesion = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  dining_tables: { number: number } | null;
};

const COLUMNAS_PEDIDO =
  "id, order_number, daily_number, business_date, status, created_at, table_session_id, customer_name, allergy_answer, allergens, allergy_note, order_items(product_name, quantity, unit_price, observation)";
const COLUMNAS_PAGO =
  "id, payment_proof_id, method, status, amount, received_amount, change_amount, reference, stripe_session_id, verified_at, created_by, created_at, table_session_id, order_id, verificador:users!payments_verified_by_fkey(full_name), registrador:users!payments_created_by_fkey(full_name)";

function aPedidoCuenta(fila: FilaPedido): PedidoCuenta {
  return {
    id: fila.id,
    alergia: leerAlergia(fila),
    numero: Number(fila.daily_number ?? fila.order_number),
    estado: fila.status,
    creadoEn: fila.created_at,
    lineas: fila.order_items.map((item) => ({
      nombre: item.product_name,
      cantidad: item.quantity,
      precioUnitarioCentimos: aCentimos(item.unit_price),
      observacion: item.observation,
    })),
  };
}

function aPagoCuenta(fila: FilaPago): PagoCuenta {
  return {
    capturaId: fila.payment_proof_id ?? null,
    id: fila.id,
    metodo: fila.method,
    estado: fila.status,
    montoCentimos: aCentimos(fila.amount),
    creadoEn: fila.created_at,
    recibidoCentimos: fila.received_amount === null ? null : aCentimos(fila.received_amount),
    vueltoCentimos: fila.change_amount === null ? null : aCentimos(fila.change_amount),
    referencia: fila.reference,
    registradoPor: fila.registrador?.full_name ?? null,
    registradoPorId: fila.created_by ?? null,
    stripe: fila.stripe_session_id !== null,
    verificadoPor: fila.verified_at ? fila.verificador?.full_name ?? "Personal" : null,
    verificadoEn: fila.verified_at,
  };
}

function fallar(origen: string, error: { code?: string }): never {
  console.error(origen, error.code);
  throw new Error("No se pudo cargar la cuenta");
}

export async function obtenerCuentaMesa(restauranteId: string, sesionId: string): Promise<CuentaMesa | null> {
  const supabase = await crearClienteServidor();
  const { data: sesion, error } = await supabase
    .from("table_sessions")
    .select("id, opened_at, closed_at, dining_tables(number)")
    .eq("restaurant_id", restauranteId)
    .eq("id", sesionId)
    .maybeSingle()
    .overrideTypes<FilaSesion | null, { merge: false }>();
  if (error) fallar("obtenerCuentaMesa", error);
  if (!sesion) return null;

  const [pedidos, pagos, cierre, comprobante] = await Promise.all([
    supabase.from("orders").select(COLUMNAS_PEDIDO).eq("restaurant_id", restauranteId)
      .eq("table_session_id", sesionId).overrideTypes<FilaPedido[], { merge: false }>(),
    supabase.from("payments").select(COLUMNAS_PAGO).eq("restaurant_id", restauranteId)
      .eq("table_session_id", sesionId).order("created_at").overrideTypes<FilaPago[], { merge: false }>(),
    supabase.from("account_closures").select(COLUMNAS_CIERRE).eq("restaurant_id", restauranteId)
      .eq("table_session_id", sesionId).maybeSingle().overrideTypes<FilaCierre | null, { merge: false }>(),
    supabase.from("receipts").select("series, number, status, pdf_url, xml_url, is_test").eq("restaurant_id", restauranteId)
      .eq("table_session_id", sesionId).maybeSingle().overrideTypes<ComprobanteCuenta | null, { merge: false }>(),
  ]);
  if (pedidos.error) fallar("obtenerCuentaMesa.pedidos", pedidos.error);
  if (pagos.error) fallar("obtenerCuentaMesa.pagos", pagos.error);
  if (cierre.error) fallar("obtenerCuentaMesa.cierre", cierre.error);
  if (comprobante.error) fallar("obtenerCuentaMesa.comprobante", comprobante.error);

  return {
    ...calcularCuenta(pedidos.data.map(aPedidoCuenta), pagos.data.map(aPagoCuenta)),
    tipo: "MESA",
    comprobante: comprobante.data,
    sesionId: sesion.id,
    mesaNumero: sesion.dining_tables?.number ?? 0,
    abiertaDesde: sesion.opened_at,
    cerrada: sesion.closed_at !== null,
    cierre: cierre.data ? aCierreCuenta(cierre.data) : null,
  };
}

export async function obtenerCuentaParaLlevar(
  restauranteId: string,
  pedidoId: string,
): Promise<CuentaParaLlevar | null> {
  const supabase = await crearClienteServidor();
  const [pedido, pagos, cierre, comprobante] = await Promise.all([
    supabase.from("orders").select(COLUMNAS_PEDIDO).eq("restaurant_id", restauranteId)
      .eq("id", pedidoId).eq("modality", "TAKEAWAY").maybeSingle()
      .overrideTypes<FilaPedido | null, { merge: false }>(),
    supabase.from("payments").select(COLUMNAS_PAGO).eq("restaurant_id", restauranteId)
      .eq("order_id", pedidoId).order("created_at").overrideTypes<FilaPago[], { merge: false }>(),
    supabase.from("account_closures").select(COLUMNAS_CIERRE).eq("restaurant_id", restauranteId)
      .eq("order_id", pedidoId).maybeSingle().overrideTypes<FilaCierre | null, { merge: false }>(),
    supabase.from("receipts").select("series, number, status, pdf_url, xml_url, is_test").eq("restaurant_id", restauranteId)
      .eq("order_id", pedidoId).maybeSingle().overrideTypes<ComprobanteCuenta | null, { merge: false }>(),
  ]);
  if (pedido.error) fallar("obtenerCuentaParaLlevar", pedido.error);
  if (pagos.error) fallar("obtenerCuentaParaLlevar.pagos", pagos.error);
  if (cierre.error) fallar("obtenerCuentaParaLlevar.cierre", cierre.error);
  if (comprobante.error) fallar("obtenerCuentaParaLlevar.comprobante", comprobante.error);
  if (!pedido.data) return null;

  return {
    ...calcularCuenta([aPedidoCuenta(pedido.data)], pagos.data.map(aPagoCuenta)),
    tipo: "PARA_LLEVAR",
    comprobante: comprobante.data,
    pedidoId: pedido.data.id,
    numero: Number(pedido.data.daily_number ?? pedido.data.order_number),
    nombre: pedido.data.customer_name,
    cierre: cierre.data ? aCierreCuenta(cierre.data) : null,
  };
}

// Cuentas por cobrar o por cerrar: todas las mesas con sesión abierta y los pedidos
// para llevar (no cancelados) sin cierre que tienen saldo, un Yape por verificar
// o que se pagaron hace poco (US-020).
// US-106: `base` es el panel que mira la lista: caja cobra; /admin/cuentas solo consulta.
export async function listarCuentasAbiertas(restauranteId: string, base: "/caja" | "/admin/cuentas" = "/caja"): Promise<CuentaAbierta[]> {
  const supabase = await crearClienteServidor();
  const [sesiones, paraLlevar] = await Promise.all([
    supabase.from("table_sessions").select("id, opened_at, closed_at, dining_tables(number)")
      .eq("restaurant_id", restauranteId).is("closed_at", null).order("opened_at")
      .overrideTypes<FilaSesion[], { merge: false }>(),
    supabase.from("orders").select(COLUMNAS_PEDIDO).eq("restaurant_id", restauranteId)
      .eq("modality", "TAKEAWAY").neq("status", "CANCELLED")
      .order("created_at", { ascending: false }).limit(50)
      .overrideTypes<FilaPedido[], { merge: false }>(),
  ]);
  if (sesiones.error) fallar("listarCuentasAbiertas.sesiones", sesiones.error);
  if (paraLlevar.error) fallar("listarCuentasAbiertas.paraLlevar", paraLlevar.error);

  const idsSesiones = sesiones.data.map((s) => s.id);
  const idsParaLlevar = paraLlevar.data.map((p) => p.id);
  const vacio = { data: [], error: null };
  const [pedidosMesa, pagosMesa, pagosLlevar, cierresLlevar] = await Promise.all([
    idsSesiones.length
      ? supabase.from("orders").select(COLUMNAS_PEDIDO).eq("restaurant_id", restauranteId)
          .in("table_session_id", idsSesiones).overrideTypes<FilaPedido[], { merge: false }>()
      : vacio,
    idsSesiones.length
      ? supabase.from("payments").select(COLUMNAS_PAGO).eq("restaurant_id", restauranteId)
          .in("table_session_id", idsSesiones).overrideTypes<FilaPago[], { merge: false }>()
      : vacio,
    idsParaLlevar.length
      ? supabase.from("payments").select(COLUMNAS_PAGO).eq("restaurant_id", restauranteId)
          .in("order_id", idsParaLlevar).overrideTypes<FilaPago[], { merge: false }>()
      : vacio,
    idsParaLlevar.length
      ? supabase.from("account_closures").select("order_id").eq("restaurant_id", restauranteId)
          .in("order_id", idsParaLlevar).overrideTypes<{ order_id: string }[], { merge: false }>()
      : vacio,
  ]);
  if (pedidosMesa.error) fallar("listarCuentasAbiertas.pedidosMesa", pedidosMesa.error);
  if (pagosMesa.error) fallar("listarCuentasAbiertas.pagosMesa", pagosMesa.error);
  if (pagosLlevar.error) fallar("listarCuentasAbiertas.pagosLlevar", pagosLlevar.error);
  if (cierresLlevar.error) fallar("listarCuentasAbiertas.cierresLlevar", cierresLlevar.error);
  const cerrados = new Set((cierresLlevar.data as { order_id: string }[]).map((c) => c.order_id));
  const limiteReciente = Date.now() - HORAS_PARA_LLEVAR_PAGADO * 60 * 60 * 1000;
  const porVerificar = (cuenta: ReturnType<typeof calcularCuenta>) =>
    cuenta.pagosNoVerificados.filter((p) => p.estado === "PENDING").length;
  const pagos = { data: [...(pagosMesa.data as FilaPago[]), ...(pagosLlevar.data as FilaPago[])] };

  const mesas = sesiones.data.map((sesion): CuentaAbierta => {
    const pedidosDeMesa = (pedidosMesa.data as FilaPedido[]).filter((p) => p.table_session_id === sesion.id);
    const cuenta = calcularCuenta(
      pedidosDeMesa.map(aPedidoCuenta),
      pagos.data.filter((p) => p.table_session_id === sesion.id).map(aPagoCuenta),
    );
    return {
      href: `${base}/mesa/${sesion.id}`,
      titulo: `Mesa ${sesion.dining_tables?.number ?? "?"}`,
      detalle: `${cuenta.pedidos.length} pedido(s)`,
      consumoCentimos: cuenta.consumoCentimos,
      pagadoCentimos: cuenta.pagadoCentimos,
      saldoCentimos: cuenta.saldoCentimos,
      porVerificar: porVerificar(cuenta),
      esperaPagoDesde: pedidosDeMesa.filter((p) => p.status === "PENDING")
        .map((p) => p.created_at).sort()[0] ?? null,
    };
  });

  const llevar = paraLlevar.data
    .filter((pedido) => !cerrados.has(pedido.id))
    .map((pedido) => {
      const cuenta = calcularCuenta(
        [aPedidoCuenta(pedido)],
        pagos.data.filter((p) => p.order_id === pedido.id).map(aPagoCuenta),
      );
      const fila: CuentaAbierta = {
        href: `${base}/pedido/${pedido.id}`,
        titulo: `Para llevar ${etiquetaNumeroDia(Number(pedido.daily_number ?? pedido.order_number), pedido.business_date)} – ${pedido.customer_name?.trim() || "Sin nombre"}`,
        detalle: "1 pedido",
        consumoCentimos: cuenta.consumoCentimos,
        pagadoCentimos: cuenta.pagadoCentimos,
        saldoCentimos: cuenta.saldoCentimos,
        porVerificar: porVerificar(cuenta),
        esperaPagoDesde: pedido.status === "PENDING" ? pedido.created_at : null,
      };
      const reciente = new Date(pedido.created_at).getTime() >= limiteReciente;
      return { fila, mostrar: fila.saldoCentimos > 0 || fila.porVerificar > 0 || (reciente && fila.consumoCentimos > 0) };
    })
    .filter((cuenta) => cuenta.mostrar)
    .map((cuenta) => cuenta.fila);

  return ordenarCuentasCaja([...mesas, ...llevar]);
}

// US-106: el mesero ya no lee pagos (RLS), pero necesita saber si puede liberar la mesa.
// Se calcula aquí, en el servidor, con el cliente admin y siempre filtrado por el
// restaurante de su sesión. Solo sale el estado, sin montos ni pagos.
export async function estadosLiberacionMesas(
  restauranteId: string,
  sesionIds: readonly string[],
): Promise<Map<string, EstadoLiberacion>> {
  if (sesionIds.length === 0) return new Map();
  const supabase = crearClienteAdmin();
  const [pedidos, pagos] = await Promise.all([
    supabase.from("orders").select(COLUMNAS_PEDIDO).eq("restaurant_id", restauranteId)
      .in("table_session_id", [...sesionIds]).overrideTypes<FilaPedido[], { merge: false }>(),
    supabase.from("payments").select(COLUMNAS_PAGO).eq("restaurant_id", restauranteId)
      .in("table_session_id", [...sesionIds]).overrideTypes<FilaPago[], { merge: false }>(),
  ]);
  if (pedidos.error) fallar("estadosLiberacionMesas.pedidos", pedidos.error);
  if (pagos.error) fallar("estadosLiberacionMesas.pagos", pagos.error);
  return new Map(sesionIds.map((sesionId) => [sesionId, estadoLiberacion(calcularCuenta(
    pedidos.data.filter((p) => p.table_session_id === sesionId).map(aPedidoCuenta),
    pagos.data.filter((p) => p.table_session_id === sesionId).map(aPagoCuenta),
  ))]));
}
