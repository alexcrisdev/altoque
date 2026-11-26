import "./mesero.css";
import { Suspense, type ReactNode } from "react";
import { NavegacionDelPanel } from "@/features/auth/navegacion";

export default function MeseroLayout({ children }: { children: ReactNode }) {
  return <div className="area-operativa area-mesero min-h-dvh"><Suspense fallback={null}><NavegacionDelPanel area="mesero" /></Suspense>{children}</div>;
}
