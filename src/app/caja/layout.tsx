import "./caja.css";
import { Suspense, type ReactNode } from "react";
import { NavegacionDelPanel } from "@/features/auth/navegacion";

export default function CajaLayout({ children }: { children: ReactNode }) {
  return <div className="area-caja min-h-dvh"><Suspense fallback={null}><NavegacionDelPanel area="caja" /></Suspense>{children}</div>;
}
