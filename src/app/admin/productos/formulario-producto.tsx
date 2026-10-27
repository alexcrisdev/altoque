"use client";

import { useActionState } from "react";
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
  const [estado, accion, pendiente] = useActionState(
    guardarProductoAction,
    estadoInicialProducto,
  );

  return (
    <form action={accion} className="grid gap-3 rounded border p-4">
      {producto && <input type="hidden" name="productoId" value={producto.id} />}
      <label className="grid gap-1">
        Nombre
        <input
          name="nombre"
          required
          maxLength={80}
          defaultValue={producto?.name ?? ""}
          className="rounded border p-2"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">
          Precio (S/)
          <input
            name="precio"
            type="text"
            inputMode="decimal"
            required
            defaultValue={producto?.price.toFixed(2) ?? ""}
            className="rounded border p-2"
          />
        </label>
        <label className="grid gap-1">
          Categoría
          <select
            name="categoriaId"
            required
            defaultValue={producto?.category_id ?? ""}
            className="rounded border p-2"
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
        <textarea name="descripcion" defaultValue={producto?.description ?? ""} className="rounded border p-2" rows={2} />
      </label>
      <label className="grid gap-1">
        Ingredientes
        <textarea name="ingredientes" defaultValue={producto?.ingredients ?? ""} className="rounded border p-2" rows={2} />
      </label>
      <label className="grid gap-1">
        Alérgenos (separados por comas)
        <input name="alergenos" defaultValue={producto?.allergens.join(", ") ?? ""} className="rounded border p-2" />
      </label>
      <label className="grid gap-1">
        URL de imagen (HTTPS)
        <input name="imageUrl" type="url" defaultValue={producto?.image_url ?? ""} className="rounded border p-2" />
      </label>
      <button disabled={pendiente} className="min-h-11 rounded bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
        {pendiente ? "Guardando…" : producto ? "Guardar cambios" : "Crear producto"}
      </button>
      {estado.mensaje && (
        <p role={estado.tipo === "error" ? "alert" : "status"} className={estado.tipo === "error" ? "text-red-700" : "text-teal-800"}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
