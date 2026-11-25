import "./cocina.css";
import { Suspense, type ReactNode } from "react";
import { NavegacionDelPanel } from "@/features/auth/navegacion";

export default function CocinaLayout({ children }: { children: ReactNode }) {
  return <div className="area-cocina min-h-dvh bg-kds-fondo"><Suspense fallback={null}><NavegacionDelPanel area="cocina" /></Suspense>{children}</div>;
}
