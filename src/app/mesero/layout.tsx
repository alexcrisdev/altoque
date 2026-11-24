import "./mesero.css";
import { Suspense, type ReactNode } from "react";
import { NavegacionPanel } from "@/components/navegacion-panel";

export default function MeseroLayout({ children }: { children: ReactNode }) {
  return <div className="area-operativa area-mesero min-h-dvh"><Suspense fallback={null}><NavegacionPanel area="mesero" /></Suspense>{children}</div>;
}
