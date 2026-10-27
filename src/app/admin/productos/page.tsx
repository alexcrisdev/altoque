import Link from "next/link";
import { Suspense } from "react";
import {
  cambiarActivoAction,
  cambiarDisponibilidadAction,
} from "@/features/carta/admin-actions";
import {
  listarCategorias,
  listarProductosAdmin,
  type CategoriaAdmin,
  type ProductoAdmin,
} from "@/features/carta/admin-productos";
import { requerirRol } from "@/features/auth/sesion";
import { FormularioProducto } from "./formulario-producto";

async function PanelProductos() {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find((m) => m.rol === "OWNER" || m.rol === "ADMIN");
  if (!membresia) return null;
  const restauranteId = membresia.restaurantId;

  const [categorias, productos] = await Promise.all([
    listarCategorias(restauranteId),
    listarProductosAdmin(restauranteId),
  ]);

  return (
    <>
      <section aria-labelledby="nuevo-producto" className="mt-6">
        <h2 id="nuevo-producto" className="mb-3 text-xl font-semibold">Nuevo producto</h2>
        {categorias.length ? (
          <FormularioProducto categorias={categorias} />
        ) : (
          <p className="rounded border p-4">Primero necesitas una categoría para registrar productos.</p>
        )}
      </section>

      <section aria-labelledby="productos-registrados" className="mt-10">
        <h2 id="productos-registrados" className="text-xl font-semibold">Productos registrados</h2>
        {productos.length === 0 ? (
          <p className="mt-3 rounded border p-4">Todavía no hay productos.</p>
        ) : (
          <div className="mt-4 grid gap-6">
            {categorias.map((categoria) => {
              const productosCategoria = productos.filter((producto) => producto.category_id === categoria.id);
              if (!productosCategoria.length) return null;
              return (
                <section key={categoria.id} aria-labelledby={`categoria-${categoria.id}`}>
                  <h3 id={`categoria-${categoria.id}`} className="mb-3 text-lg font-semibold">
                    {categoria.name}{categoria.active ? "" : " (inactiva)"}
                  </h3>
                  <ul className="grid gap-3">
                    {productosCategoria.map((producto) => (
                      <ProductoFila key={producto.id} producto={producto} categorias={categorias} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function ProductoFila({
  producto,
  categorias,
}: {
  producto: ProductoAdmin;
  categorias: CategoriaAdmin[];
}) {
  return (
    <li className="grid gap-4 rounded border p-4 sm:grid-cols-[1fr_auto]">
      <div>
        <h4 className="font-semibold">{producto.name}</h4>
        <p className="text-sm text-zinc-700">S/ {producto.price.toFixed(2)}</p>
        <p className="mt-1 text-sm">
          {producto.active ? "Activo en la carta" : "Desactivado"} ·{" "}
          {producto.available ? "Disponible" : "Agotado"}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <form action={cambiarDisponibilidadAction}>
          <input type="hidden" name="productoId" value={producto.id} />
          <input type="hidden" name="valor" value={String(!producto.available)} />
          <button className="min-h-10 rounded border px-3 py-1">
            {producto.available ? "Marcar agotado" : "Marcar disponible"}
          </button>
        </form>
        <form action={cambiarActivoAction}>
          <input type="hidden" name="productoId" value={producto.id} />
          <input type="hidden" name="valor" value={String(!producto.active)} />
          <button className="min-h-10 rounded border px-3 py-1">
            {producto.active ? "Desactivar" : "Reactivar"}
          </button>
        </form>
        <details className="basis-full">
          <summary className="cursor-pointer py-2 underline">Editar producto</summary>
          <FormularioProducto categorias={categorias} producto={producto} />
        </details>
      </div>
    </li>
  );
}

export default function ProductosPage() {
  return (
    <main className="mx-auto w-full max-w-4xl p-8">
      <Link href="/admin" className="text-sm underline">← Panel administrador</Link>
      <h1 className="mt-2 text-3xl font-bold">Administrar productos</h1>
      <Suspense fallback={<p className="mt-6">Cargando productos…</p>}>
        <PanelProductos />
      </Suspense>
    </main>
  );
}
