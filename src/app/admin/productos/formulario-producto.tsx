"use client";

import { useActionState, useState } from "react";
import { ImagenProducto } from "@/components/imagen-producto";
import {
  guardarProductoAction,
} from "@/features/carta/admin-actions";
import type { CategoriaAdmin, ProductoAdmin } from "@/features/carta/admin-productos";

const estadoInicialProducto = { tipo: "inicial", mensaje: "" } as const;

export function FormularioProducto({
  categorias,
  producto,
}: {
  categorias: CategoriaAdmin[];
  producto?: ProductoAdmin;
}) {
  const [imagen, setImagen] = useState(producto?.image_url ?? "");
  const [estado, accion, pendiente] = useActionState(
    guardarProductoAction,
    estadoInicialProducto,
  );

  return (
    <form action={accion} className="superficie-formulario grid gap-4">
      {producto && <input type="hidden" name="productoId" value={producto.id} />}
      <label className="grid gap-1">
        Nombre
        <input
          name="nombre"
          required
          maxLength={80}
          defaultValue={producto?.name ?? ""}
          className="min-h-11 w-full min-w-0 rounded-xl border border-borde bg-superficie p-2 text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <label className="grid gap-1">
          Precio (S/)
          <input
            name="precio"
            type="text"
            inputMode="decimal"
            required
            defaultValue={producto?.price.toFixed(2) ?? ""}
            className="min-h-11 w-full min-w-0 rounded-xl border border-borde bg-superficie p-2 text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
          />
        </label>
        <label className="grid gap-1">
          Categoría
          <select
            name="categoriaId"
            required
            defaultValue={producto?.category_id ?? ""}
            className="min-h-11 w-full min-w-0 rounded-xl border border-borde bg-superficie p-2 text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
          >
            <option value="" disabled>Selecciona una categoría</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.name}{categoria.active ? "" : " (inactiva)"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1">
        Descripción
        <textarea name="descripcion" defaultValue={producto?.description ?? ""} className="min-h-11 w-full min-w-0 rounded-xl border border-borde bg-superficie p-2 text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca" rows={2} />
      </label>
      <label className="grid gap-1">
        Ingredientes
        <textarea name="ingredientes" defaultValue={producto?.ingredients ?? ""} className="min-h-11 w-full min-w-0 rounded-xl border border-borde bg-superficie p-2 text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca" rows={2} />
      </label>
      <label className="grid gap-1">
        Alérgenos (separados por comas)
        <input name="alergenos" defaultValue={producto?.allergens.join(", ") ?? ""} className="min-h-11 w-full min-w-0 rounded-xl border border-borde bg-superficie p-2 text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca" />
      </label>
      <label className="grid gap-1">
        URL de imagen (HTTPS)
        <input name="imageUrl" type="url" value={imagen} onChange={(evento) => setImagen(evento.target.value)} aria-describedby={producto ? `imagen-ayuda-${producto.id}` : "imagen-ayuda-nuevo"} placeholder="https://…" className="min-h-11 w-full min-w-0 rounded-xl border border-borde bg-superficie p-2 text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca" />
      </label>
      <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3 rounded-xl bg-superficie-suave p-3">
        <ImagenProducto src={imagen} nombre="Vista previa del producto" className="h-20 w-24 rounded-lg" />
        <p id={producto ? `imagen-ayuda-${producto.id}` : "imagen-ayuda-nuevo"} className="text-xs text-texto-suave">Imagen opcional. Pega un enlace HTTPS directo a una foto. Si dejas el campo vacío o la imagen no carga, se mostrará una referencia. Guarda los cambios para actualizar la carta.</p>
      </div>
      <button disabled={pendiente} className="min-h-11 rounded-xl bg-marca px-4 py-3 font-semibold text-white transition-colors hover:bg-marca-hover disabled:opacity-50">
        {pendiente ? "Guardando…" : producto ? "Guardar cambios" : "Crear producto"}
      </button>
      {estado.mensaje && (
        <p role={estado.tipo === "error" ? "alert" : "status"} className={estado.tipo === "error" ? "text-peligro-texto" : "text-exito-texto"}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
