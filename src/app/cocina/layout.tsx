import "./cocina.css";
import { Suspense, type ReactNode } from "react";
import { NavegacionPanel } from "@/components/navegacion-panel";

export default function CocinaLayout({ children }: { children: ReactNode }) {
  return <div className="area-cocina min-h-dvh bg-kds-fondo"><Suspense fallback={null}><NavegacionPanel area="cocina" /></Suspense>{children}</div>;
}
