import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import {
  cambiarActivoAction,
  cambiarDisponibilidadAction,
} from "@/features/carta/admin-actions";
import {
  listarCategorias,
  listarProductosAdmin,
  productosSinStockHoy,
  type CategoriaAdmin,
  type ProductoAdmin,
} from "@/features/carta/admin-productos";
import {
  categoriasParaFormulario,
  tarjetasCategorias,
} from "@/features/carta/categorias-admin";
import { requerirRol } from "@/features/auth/sesion";
import { FormularioProducto } from "./formulario-producto";
import { ImagenProducto } from "@/components/imagen-producto";

const ENLACE = "rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

async function PanelProductos({ searchParams }: Pick<PageProps<"/admin/productos">, "searchParams">) {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find((m) => m.rol === "OWNER" || m.rol === "ADMIN");
  if (!membresia) return null;
  const restauranteId = membresia.restaurantId;

  const [{ categoria: elegida }, categorias, productos, sinStock] = await Promise.all([
    searchParams,
    listarCategorias(restauranteId),
    listarProductosAdmin(restauranteId),
    productosSinStockHoy(restauranteId),
  ]);

  // US-148: agotado = marcado agotado o sin unidades hoy (lo mismo que ve el cliente con candado).
  const tarjetas = tarjetasCategorias(
    categorias,
    productos.map((producto) => ({ ...producto, agotado: !producto.available || sinStock.has(producto.id) })),
  );
  const activas = categoriasParaFormulario(categorias);
  const actual = typeof elegida === "string" ? tarjetas.find((tarjeta) => tarjeta.id === elegida) : undefined;

  if (!actual) {
    return (
      <section aria-labelledby="categorias-carta" className="mt-6">
        <h2 id="categorias-carta" className="text-xl font-semibold">Categorías</h2>
        <p className="mt-1 text-sm text-texto-suave">Elige una categoría para ver sus platos o registrar uno nuevo.</p>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {tarjetas.map((tarjeta) => (
            <li key={tarjeta.id} className="min-w-0">
              <Link
                href={`/admin/productos?categoria=${tarjeta.id}`}
                className={`flex h-full flex-col gap-2 border border-borde bg-superficie p-3 hover:border-marca ${ENLACE}`}
              >
                <Image unoptimized src={tarjeta.imagen} alt="" width={160} height={96} className="h-20 w-full rounded-lg bg-marca-suave object-contain p-2" />
                <span className="break-words font-semibold">
                  {tarjeta.name}{tarjeta.active ? "" : " (inactiva)"}
                </span>
                <span className="text-sm text-texto-suave">{tarjeta.resumen}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const productosCategoria = productos.filter((producto) => producto.category_id === actual.id);

  return (
    <>
      <Link href="/admin/productos" className={`mt-4 inline-flex min-h-11 items-center text-sm text-marca underline ${ENLACE}`}>
        ← Todas las categorías
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <Image unoptimized src={actual.imagen} alt="" width={64} height={64} className="h-14 w-14 shrink-0 rounded-xl bg-marca-suave object-contain p-2" />
        <div className="min-w-0">
          <h2 className="break-words text-2xl font-semibold">{actual.name}{actual.active ? "" : " (inactiva)"}</h2>
          <p className="text-sm text-texto-suave">{actual.resumen}</p>
        </div>
      </div>

      <div className="mt-6 grid items-start gap-8 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section aria-labelledby="nuevo-producto" className="min-w-0">
          <h3 id="nuevo-producto" className="mb-3 text-xl font-semibold">Nuevo producto</h3>
          {activas.length ? (
            <FormularioProducto
              key={actual.id}
              categorias={activas}
              categoriaInicial={actual.active ? actual.id : undefined}
            />
          ) : (
            <p className="rounded border p-4">Primero necesitas una categoría para registrar productos.</p>
          )}
        </section>

        <section aria-labelledby="productos-registrados" className="min-w-0">
          <h3 id="productos-registrados" className="text-xl font-semibold">Platos de {actual.name}</h3>
          {productosCategoria.length === 0 ? (
            <p className="mt-3 rounded border p-4">Todavía no hay platos en esta categoría.</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {productosCategoria.map((producto) => (
                <ProductoFila
                  key={producto.id}
                  producto={producto}
                  sinStock={sinStock.has(producto.id)}
                  categorias={categoriasParaFormulario(categorias, producto.category_id)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function ProductoFila({
  producto,
  sinStock,
  categorias,
}: {
  producto: ProductoAdmin;
  sinStock: boolean;
  categorias: CategoriaAdmin[];
}) {
  return (
    <li className="producto-admin grid gap-4 rounded-2xl border border-borde bg-superficie p-5">
      <div className="flex min-w-0 items-start gap-3">
        <ImagenProducto src={producto.image_url} nombre={producto.name} decorativa className="h-20 w-20 shrink-0 rounded-xl" />
        <div className="min-w-0">
        <h4 className="break-words font-semibold">{producto.name}</h4>
        <p className="text-lg font-bold tabular-nums text-marca">S/ {producto.price.toFixed(2)}</p>
        <p className="mt-1 text-sm">
          {producto.active ? "Activo en la carta" : "Desactivado"} ·{" "}
          {!producto.available ? "Agotado" : sinStock ? "Sin stock hoy" : "Disponible"}
        </p>
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <form action={cambiarDisponibilidadAction}>
          <input type="hidden" name="productoId" value={producto.id} />
          <input type="hidden" name="valor" value={String(!producto.available)} />
          <button className="min-h-11 rounded-xl border border-borde px-3 py-1 text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
            {producto.available ? "Marcar agotado" : "Marcar disponible"}
          </button>
        </form>
        <form action={cambiarActivoAction}>
          <input type="hidden" name="productoId" value={producto.id} />
          <input type="hidden" name="valor" value={String(!producto.active)} />
          <button className="min-h-11 rounded-xl border border-borde px-3 py-1 text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
            {producto.active ? "Desactivar" : "Reactivar"}
          </button>
        </form>
        <details className="basis-full">
          <summary className="min-h-11 cursor-pointer rounded-lg py-3 text-marca underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">Editar producto</summary>
          <FormularioProducto categorias={categorias} producto={producto} />
        </details>
      </div>
    </li>
  );
}

export default function ProductosPage({ searchParams }: PageProps<"/admin/productos">) {
  return (
    <main id="contenido-principal" className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <Link href="/admin" className={`inline-flex min-h-11 items-center text-sm text-marca underline ${ENLACE}`}>← Panel administrador</Link>
      <h1 className="mt-2 text-3xl font-bold">Administrar productos</h1>
      <Suspense fallback={<p role="status" aria-busy="true" className="mt-6">Cargando productos…</p>}>
        <PanelProductos searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
