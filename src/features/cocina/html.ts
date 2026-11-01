import { ESTADOS_ACTIVOS, ETIQUETA_ESTADO } from "../pedidos/estados";
import { describirDestino } from "../pedidos/modalidad";
import { agruparPorEstado, filtrarPorEstado, minutosDesde, normalizarFiltro } from "./cocina-logica";
import type { PedidoCocina } from "./tipos";

// La vista básica no depende de React ni de scripts para mostrar los pedidos.
// Escapar todos los textos evita interpretar nombres u observaciones como HTML.
function escapar(texto: string | number): string {
  return String(texto).replace(/[&<>"']/g, (caracter) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[caracter]!);
}

export function renderizarCocinaHtml(pedidos: PedidoCocina[], filtroEntrada: unknown, ahora: string, error = false): string {
  const filtro = normalizarFiltro(filtroEntrada);
  const grupos = agruparPorEstado(pedidos);
  const visibles = filtrarPorEstado(pedidos, filtro);
  const hora = new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
  const filtros = ["TODOS", ...ESTADOS_ACTIVOS].map((estado) => {
    const etiqueta = estado === "TODOS" ? "Todos" : estado === "PENDING" ? "Nuevos"
      : estado === "ACCEPTED" ? "Aceptados" : estado === "READY" ? "Listos" : ETIQUETA_ESTADO.IN_PROGRESS;
    const cantidad = estado === "TODOS" ? filtrarPorEstado(pedidos, "TODOS").length : grupos[estado as keyof typeof grupos].length;
    return `<li><a href="/cocina/html?estado=${escapar(estado)}"${filtro === estado ? ' aria-current="page"' : ""}>${escapar(etiqueta)} (${cantidad})</a></li>`;
  }).join("");
  const tarjetas = visibles.map((pedido) => `<li><article>
    <h2>N.º ${escapar(pedido.numero)}${pedido.estado === "PENDING" ? " · Nuevo" : ""}</h2>
    <p>${escapar(ETIQUETA_ESTADO[pedido.estado])} · <time datetime="${escapar(pedido.creadoEn)}">${escapar(hora.format(new Date(pedido.creadoEn)))}</time> · hace ${minutosDesde(pedido.creadoEn, ahora)} min</p>
    <p><strong>${escapar(describirDestino({ modalidad: pedido.modalidad, mesaNumero: pedido.mesaNumero, nombre: pedido.nombreCliente, telefono: null }))}</strong></p>
    <ul>${pedido.items.map((item) => `<li>${escapar(item.cantidad)} × ${escapar(item.nombre)}${item.observacion ? `<p><mark>Observación: ${escapar(item.observacion)}</mark></p>` : ""}</li>`).join("")}</ul>
  </article></li>`).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Cocina · AlToque</title></head><body><main>
    <h1>Cocina</h1><p>Vista básica sin JavaScript. Usa Actualizar pedidos para consultar cambios.</p>
    <form method="post" action="/cocina/html"><button type="submit">Cerrar sesión</button></form>
    <nav aria-label="Filtrar pedidos por estado"><ul>${filtros}</ul></nav>
    <p><a href="/cocina/html?estado=${escapar(filtro)}">Actualizar pedidos</a></p>
    ${error ? '<p role="alert">No pudimos cargar los pedidos. Intenta de nuevo.</p>' : visibles.length ? `<ul aria-label="Pedidos de cocina">${tarjetas}</ul>` : '<p role="status">No hay pedidos pendientes</p>'}
    </main></body></html>`;
}
