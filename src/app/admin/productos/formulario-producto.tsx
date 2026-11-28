"use client";

import { useActionState, useEffect, useId, useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import { ImagenProducto } from "@/components/imagen-producto";
import { Boton } from "@/components/ui";
import {
  guardarProductoAction, type EstadoFormularioProducto,
} from "@/features/carta/admin-actions";
import { TIPOS_FOTO_PRODUCTO } from "@/features/carta/foto-producto";
import { prepararFotoProducto } from "@/features/carta/preparar-foto-producto";
import type { CategoriaAdmin, ProductoAdmin } from "@/features/carta/admin-productos";
import { CATEGORIA_CON_ALCOHOL, textoTragosEstandar } from "@/features/carta/bebidas-alcohol";
import { autocompletarProducto } from "@/features/ia/autocompletar-producto/actions";
import { llenarSoloVacios, type CampoAutocompletable } from "@/features/ia/autocompletar-producto/reglas";

const CLASE_CAMPO = "min-h-11 w-full min-w-0 rounded-xl border border-borde bg-superficie p-2 text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

// US-156: marca de los campos que llenó «✨ Autocompletar» (se quita al editarlos).
function Etiqueta({ children, sugerido }: { children: ReactNode; sugerido: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-1">
      {children}
      {sugerido && <span className="text-xs font-semibold text-marca-hover"><span aria-hidden="true">✨</span> Sugerido</span>}
    </span>
  );
}

const estadoInicialProducto = { tipo: "inicial", mensaje: "" } as const;

export function FormularioProducto({
  categorias,
  producto,
  categoriaInicial,
}: {
  categorias: CategoriaAdmin[];
  producto?: ProductoAdmin;
  // US-148: al crear desde una tarjeta, la categoría ya viene elegida.
  categoriaInicial?: string;
}) {
  const [imagen, setImagen] = useState(producto?.image_url ?? "");
  const [foto, setFoto] = useState<{ archivo: File; vista: string } | null>(null);
  // US-156: campos que puede llenar «✨ Autocompletar» (controlados para no pisar lo escrito).
  const [nombre, setNombre] = useState(producto?.name ?? "");
  const [campos, setCampos] = useState(() => ({
    categoriaId: producto?.category_id ?? categoriaInicial ?? "",
    descripcion: producto?.description ?? "",
    ingredientes: producto?.ingredients ?? "",
    porcentajeAlcohol: producto?.alcohol_percent == null ? "" : String(producto.alcohol_percent),
    ml: producto?.volume_ml == null ? "" : String(producto.volume_ml),
  }));
  const [alergenos, setAlergenos] = useState(producto?.allergens.join(", ") ?? "");
  const [sugeridos, setSugeridos] = useState<CampoAutocompletable[]>([]);
  const [alergenosSugeridos, setAlergenosSugeridos] = useState<string[]>([]);
  const [avisoIa, setAvisoIa] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [pensando, iniciarAutocompletar] = useTransition();
  const id = useId();
  const categoriaElegida = categorias.find((categoria) => categoria.id === campos.categoriaId);
  const conAlcohol = categoriaElegida?.name === CATEGORIA_CON_ALCOHOL;
  const tragos = textoTragosEstandar(Number(campos.ml), Number(campos.porcentajeAlcohol.replace(",", ".")));
  const listaAlergenos = alergenos.split(",").map((a) => a.trim()).filter(Boolean);
  const mismo = (a: string, b: string) => a.toLocaleLowerCase("es-PE") === b.toLocaleLowerCase("es-PE");
  const tieneAlergeno = (alergeno: string) => listaAlergenos.some((a) => mismo(a, alergeno));

  function cambiarCampo(campo: CampoAutocompletable, valor: string) {
    setCampos((actuales) => ({ ...actuales, [campo]: valor }));
    setSugeridos((lista) => lista.filter((c) => c !== campo)); // al editarlo deja de ser sugerencia
  }

  // El dueño confirma cada alérgeno sugerido: se agrega (o se quita) del campo de alérgenos.
  function alternarAlergeno(alergeno: string) {
    setAlergenos(tieneAlergeno(alergeno)
      ? listaAlergenos.filter((a) => !mismo(a, alergeno)).join(", ")
      : [...listaAlergenos, alergeno].join(", "));
  }

  function autocompletar() {
    setAvisoIa(null);
    iniciarAutocompletar(async () => {
      let resultado: Awaited<ReturnType<typeof autocompletarProducto>>;
      try {
        resultado = await autocompletarProducto(nombre);
      } catch {
        resultado = { ok: false, motivo: "No pude autocompletar, llénalo a mano" };
      }
      if (!resultado.ok) {
        setAvisoIa({ tipo: "error", texto: resultado.motivo });
        return;
      }
      const { cambios, sugeridos: nuevos, alergenosSugeridos: chips } =
        llenarSoloVacios({ ...campos, alergenos }, resultado.sugerencia, categorias);
      setCampos((actuales) => ({ ...actuales, ...cambios }));
      setSugeridos((lista) => [...new Set([...lista, ...nuevos])]);
      setAlergenosSugeridos(chips);
      setAvisoIa(nuevos.length || chips.length
        ? { tipo: "ok", texto: "Revisa lo sugerido antes de guardar." }
        : { tipo: "error", texto: "No había campos vacíos que llenar." });
    });
  }

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
        setSugeridos([]);
        setAlergenosSugeridos([]);
        setAvisoIa(null);
        if (!producto) {
          // Producto nuevo creado: el formulario queda limpio para el siguiente.
          setNombre("");
          setAlergenos("");
          setCampos({ categoriaId: categoriaInicial ?? "", descripcion: "", ingredientes: "", porcentajeAlcohol: "", ml: "" });
        }
      }
      return resultado;
    },
    estadoInicialProducto,
  );

  return (
    <form action={accion} className="superficie-formulario grid gap-4">
      {producto && <input type="hidden" name="productoId" value={producto.id} />}
      <div className="grid gap-1">
        <label htmlFor={`${id}-nombre`}>Nombre</label>
        <div className="flex gap-2">
          <input
            id={`${id}-nombre`}
            name="nombre"
            required
            maxLength={80}
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
            aria-describedby={`${id}-ia`}
            className={`${CLASE_CAMPO} flex-1`}
          />
          <Boton type="button" variante="secundario" cargando={pensando} disabled={nombre.trim().length < 2}
            onClick={autocompletar} className="shrink-0">
            <span aria-hidden="true">✨</span> {pensando ? "Pensando…" : "Autocompletar"}
          </Boton>
        </div>
        <p id={`${id}-ia`} aria-live="polite"
          className={`text-xs ${avisoIa?.tipo === "error" ? "font-semibold text-peligro-texto" : avisoIa ? "font-semibold text-exito-texto" : "text-texto-suave"}`}>
          {avisoIa?.texto ?? "Escribe el nombre y toca Autocompletar: llena solo los campos vacíos. El precio y la foto los pones tú."}
        </p>
      </div>
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
          <Etiqueta sugerido={sugeridos.includes("categoriaId")}>Categoría</Etiqueta>
          <select
            name="categoriaId"
            required
            value={campos.categoriaId}
            onChange={(evento) => cambiarCampo("categoriaId", evento.target.value)}
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
      {conAlcohol && (
        <fieldset className="grid min-w-0 gap-3 rounded-xl border border-borde p-3">
          <legend className="px-1 font-semibold">Datos de la bebida con alcohol</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <Etiqueta sugerido={sugeridos.includes("porcentajeAlcohol")}>% de alcohol</Etiqueta>
              <input name="porcentajeAlcohol" type="text" inputMode="decimal" required value={campos.porcentajeAlcohol}
                onChange={(evento) => cambiarCampo("porcentajeAlcohol", evento.target.value)} placeholder="5.0"
                aria-describedby={`${id}-tragos`} className={CLASE_CAMPO} />
            </label>
            <label className="grid gap-1">
              <Etiqueta sugerido={sugeridos.includes("ml")}>Contenido (ml)</Etiqueta>
              <input name="ml" type="text" inputMode="numeric" required value={campos.ml}
                onChange={(evento) => cambiarCampo("ml", evento.target.value)} placeholder="620"
                aria-describedby={`${id}-tragos`} className={CLASE_CAMPO} />
            </label>
          </div>
          <p id={`${id}-tragos`} aria-live="polite" className="text-sm">
            {tragos
              ? <><strong>{tragos}</strong> <span className="text-texto-suave">(1 trago estándar = 10 g de alcohol)</span></>
              : <span className="text-texto-suave">Completa % y ml para calcular los tragos estándar.</span>}
          </p>
        </fieldset>
      )}
      <label className="grid gap-1">
        <Etiqueta sugerido={sugeridos.includes("descripcion")}>Descripción</Etiqueta>
        <textarea name="descripcion" value={campos.descripcion} onChange={(evento) => cambiarCampo("descripcion", evento.target.value)} className={CLASE_CAMPO} rows={2} />
      </label>
      <label className="grid gap-1">
        <Etiqueta sugerido={sugeridos.includes("ingredientes")}>Ingredientes</Etiqueta>
        <textarea name="ingredientes" value={campos.ingredientes} onChange={(evento) => cambiarCampo("ingredientes", evento.target.value)} className={CLASE_CAMPO} rows={2} />
      </label>
      <div className="grid gap-2">
        <label className="grid gap-1">
          Alérgenos (separados por comas)
          <input name="alergenos" value={alergenos} onChange={(evento) => setAlergenos(evento.target.value)} className={CLASE_CAMPO} />
        </label>
        {alergenosSugeridos.length > 0 && (
          <div role="group" aria-labelledby={`${id}-alergenos-ia`} className="grid gap-1.5 rounded-xl border border-dashed border-aviso-borde bg-aviso-fondo p-3">
            <p id={`${id}-alergenos-ia`} className="text-xs font-semibold text-aviso-texto">
              <span aria-hidden="true">✨</span> Alérgenos sugeridos: no cuentan hasta que los confirmes (el cliente los verá en la carta).
            </p>
            <div className="flex flex-wrap gap-2">
              {alergenosSugeridos.map((alergeno) => (
                <button key={alergeno} type="button" aria-pressed={tieneAlergeno(alergeno)} onClick={() => alternarAlergeno(alergeno)}
                  className="min-h-11 rounded-full border border-borde bg-superficie px-3 text-sm font-semibold text-texto hover:border-marca aria-pressed:border-marca aria-pressed:bg-marca aria-pressed:text-texto-inverso">
                  {tieneAlergeno(alergeno)
                    ? <><span aria-hidden="true">✓ </span>Contiene {alergeno.toLocaleLowerCase("es-PE")}</>
                    : <>¿Contiene {alergeno.toLocaleLowerCase("es-PE")}?</>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
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
