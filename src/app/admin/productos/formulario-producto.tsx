"use client";

import { useActionState, useEffect, useId, useState } from "react";
import Image from "next/image";
import { ImagenProducto } from "@/components/imagen-producto";
import { Boton } from "@/components/ui";
import {
  guardarProductoAction, type EstadoFormularioProducto,
} from "@/features/carta/admin-actions";
import { TIPOS_FOTO_PRODUCTO } from "@/features/carta/foto-producto";
import { prepararFotoProducto } from "@/features/carta/preparar-foto-producto";
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
  const [foto, setFoto] = useState<{ archivo: File; vista: string } | null>(null);
  const id = useId();
  const vista = foto?.vista;
  useEffect(() => () => { if (vista) URL.revokeObjectURL(vista); }, [vista]);

  const [estado, accion, pendiente] = useActionState(
    async (anterior: EstadoFormularioProducto, datos: FormData) => {
      if (foto) {
        try {
          datos.set("fotoProducto", await prepararFotoProducto(foto.archivo));
        } catch {
          return { tipo: "error", mensaje: "No se pudo preparar la foto. Prueba con una imagen más pequeña." } as const;
        }
      }
      const resultado = await guardarProductoAction(anterior, datos);
      if (resultado.tipo === "exito") {
        setFoto(null);
        setImagen(producto ? resultado.imagenGuardada ?? "" : "");
      }
      return resultado;
    },
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
      <div className="grid gap-1">
        <label htmlFor={`${id}-foto`}>Foto desde tu equipo</label>
        <input
          id={`${id}-foto`}
          type="file"
          disabled={pendiente}
          accept={TIPOS_FOTO_PRODUCTO.join(",")}
          aria-describedby={`${id}-foto-ayuda`}
          className="w-full min-w-0 text-sm file:mr-2 file:min-h-11 file:rounded-lg file:border-0 file:bg-marca-suave file:px-3 file:font-semibold file:text-marca-hover"
          onChange={(evento) => {
            const archivo = evento.target.files?.[0];
            if (!archivo) return;
            if (archivo.size > 25 * 1024 * 1024 || !TIPOS_FOTO_PRODUCTO.some((tipo) => tipo === archivo.type) || !archivo.size) {
              setFoto(null);
              evento.currentTarget.value = "";
              evento.currentTarget.setCustomValidity("Elige una foto JPG, PNG o WebP de hasta 25 MB.");
              evento.currentTarget.reportValidity();
              evento.currentTarget.setCustomValidity("");
              return;
            }
            setFoto({ archivo, vista: URL.createObjectURL(archivo) });
          }}
        />
        <p id={`${id}-foto-ayuda`} className="text-xs text-texto-suave">JPG, PNG o WebP de hasta 25 MB. Se comprime si hace falta.</p>
        {foto && <Boton type="button" variante="enlace" tamano="propio" esquina="ninguna" className="w-fit text-sm font-semibold text-marca" onClick={() => {
          const campo = document.getElementById(`${id}-foto`);
          if (campo instanceof HTMLInputElement) {
            campo.value = "";
            campo.focus();
          }
          setFoto(null);
        }}>Quitar foto seleccionada</Boton>}
      </div>
      <label className="grid gap-1">
        URL de imagen (HTTPS)
        <input name="imageUrl" type="url" value={imagen} disabled={!!foto} onChange={(evento) => setImagen(evento.target.value)} aria-describedby={producto ? `imagen-ayuda-${producto.id}` : "imagen-ayuda-nuevo"} placeholder="https://…" className="min-h-11 w-full min-w-0 rounded-xl border border-borde bg-superficie p-2 text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca" />
      </label>
      <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3 rounded-xl bg-superficie-suave p-3">
        {vista
          ? <Image unoptimized src={vista} alt="Vista previa del producto" width={96} height={80} className="h-20 w-24 rounded-lg object-cover" />
          : <ImagenProducto src={imagen} nombre="Vista previa del producto" className="h-20 w-24 rounded-lg" />}
        <p id={producto ? `imagen-ayuda-${producto.id}` : "imagen-ayuda-nuevo"} className="text-xs text-texto-suave">Imagen opcional. Pega un enlace HTTPS directo a una foto. Si dejas el campo vacío o la imagen no carga, se mostrará una referencia. Guarda los cambios para actualizar la carta.</p>
      </div>
      <Boton type="submit" tamano="propio" cargando={pendiente} className="px-4 py-3 font-semibold">
        {pendiente ? "Guardando…" : producto ? "Guardar cambios" : "Crear producto"}
      </Boton>
      {estado.mensaje && (
        <p role={estado.tipo === "error" ? "alert" : "status"} className={estado.tipo === "error" ? "text-peligro-texto" : "text-exito-texto"}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
