import { Suspense, type ReactNode } from "react";
import { NavegacionPanel } from "@/components/navegacion-panel";

export default function CajaLayout({ children }: { children: ReactNode }) {
  return <div className="area-caja min-h-screen"><Suspense fallback={null}><NavegacionPanel area="caja" /></Suspense>{children}</div>;
}
