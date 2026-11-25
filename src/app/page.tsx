import Link from "next/link";
import Image from "next/image";
import mesaPeruana from "../../public/images/mesa-peruana.webp";
import { Marca } from "@/components/marca";
import { BotonEnlace } from "@/components/ui";
import "./acceso.css";

export default function Home() {
  return <main id="contenido-principal" className="portada mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 sm:px-8">
    <header className="flex items-center justify-between gap-4 border-b border-borde py-6">
      <Marca /><Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-marca">Acceso del equipo</Link>
    </header>
    <div className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
      <section>
        <p className="mb-5 inline-flex rounded-full border border-exito-borde bg-exito-fondo px-3 py-1 text-sm font-semibold text-exito-texto">Del primer antojo al último detalle</p>
        <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight text-texto sm:text-6xl">Tu mesa.<br />Tu pedido.<br />Todo al toque.</h1>
        <p className="mt-6 max-w-md text-lg text-texto-suave">La carta, tu pedido y tu cuenta en un solo lugar. Escanea el QR de tu mesa y disfruta de la atención de tu restaurante.</p>
        <div className="mt-8 border-l-4 border-acento pl-4">
          <h2 className="font-semibold">¿Vienes a comer?</h2>
          <p className="mt-1 text-sm text-texto-suave">Abre la cámara de tu teléfono y escanea el código QR de tu mesa. No necesitas crear una cuenta.</p>
        </div>
        <BotonEnlace href="/login" className="mt-8" tamano="lg">Ingresar como personal</BotonEnlace>
      </section>
      <aside className="rounded-3xl bg-marino p-7 text-kds-texto sm:p-10" aria-label="Cómo funciona AlToque">
        <Image src={mesaPeruana} alt="Ceviche peruano y chicha morada servidos en una mesa" sizes="(min-width: 1024px) 480px, 92vw" className="mb-5 aspect-[2/1] w-full rounded-xl object-cover" />
        <span className="text-sm font-semibold text-acento">Una buena experiencia, de principio a fin</span>
        <h2 className="mt-4 text-3xl font-bold tracking-tight">Menos esperas.<br />Más sobremesa.</h2>
        <ol className="mt-8 divide-y divide-kds-borde">
          {[["Explora la carta", "Elige tus favoritos y revisa los detalles de cada plato."], ["Confirma tu pedido", "Personaliza tu selección y avisa si tienes alguna alergia."], ["Sigue y disfruta", "Consulta la preparación, pide ayuda y revisa tu cuenta."]].map(([titulo, detalle], i) => <li key={titulo} className="flex gap-4 py-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-kds-borde text-sm font-semibold text-acento">{i + 1}</span>
            <div><h3 className="font-semibold">{titulo}</h3><p className="mt-1 text-sm text-kds-texto">{detalle}</p></div>
          </li>)}
        </ol>
      </aside>
    </div>
    <footer className="border-t border-borde py-5 text-sm text-texto-suave">AlToque · Atención conectada, a tu ritmo.</footer>
  </main>;
}
