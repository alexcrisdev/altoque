import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requerirRol } from "@/features/auth/sesion";
import { AccionesPedido } from "@/features/pedidos/acciones-pedido";
import { describirDestino } from "@/features/pedidos/modalidad";
import { obtenerDetallePedido } from "@/features/pedidos/pedidos-admin";
import { ETIQUETA_ESTADO } from "@/features/pedidos/estados";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function DetalleMesero({ params }: PageProps<"/mesero/pedidos/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sesion = await requerirRol(["WAITER", "OWNER", "ADMIN"]);
  const membresias = sesion.membresias.filter((m) => ["WAITER", "OWNER", "ADMIN"].includes(m.rol));
  let pedido = null;
  let restauranteId = "";
  for (const membresia of membresias) {
    pedido = await obtenerDetallePedido(membresia.restaurantId, id);
    if (pedido) { restauranteId = membresia.restaurantId; break; }
  }
  if (!pedido) notFound();
  const roles = membresias.filter((m) => m.restaurantId === restauranteId).map((m) => m.rol);

  return <main className="mx-auto max-w-3xl p-6">
    <Link href="/mesero" className="text-sm underline">← Panel mesero</Link>
    <h1 className="mt-4 text-3xl font-bold">Pedido n.º {pedido.numero}</h1>
    <p className="mt-2 text-slate-600">{describirDestino(pedido)} · {ETIQUETA_ESTADO[pedido.estado]}</p>
    <AccionesPedido pedidoId={pedido.id} estado={pedido.estado} roles={roles} items={pedido.items} />
    <h2 className="mt-8 text-xl font-semibold">Productos</h2>
    <ul className="mt-3 divide-y rounded-lg border">{pedido.items.map((item) => <li key={item.id} className="p-3">{item.nombre} × {item.cantidad}{item.observacion && <p className="text-sm text-slate-600">{item.observacion}</p>}</li>)}</ul>
    <p className="mt-3 text-right font-semibold">Total: {new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(pedido.totalCentimos / 100)}</p>
  </main>;
}

export default function DetallePedidoMeseroPage(props: PageProps<"/mesero/pedidos/[id]">) {
  return <Suspense fallback={<main className="p-6">Cargando pedido…</main>}><DetalleMesero {...props} /></Suspense>;
}
