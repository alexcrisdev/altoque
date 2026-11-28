import "./admin.css";
import { Suspense, type ReactNode } from "react";
import { NavegacionDelPanel } from "@/features/auth/navegacion";
import { ToquiAdmin } from "@/features/ia/toqui-admin/toqui-admin";

// US-152: Toqui flota sobre todas las pantallas del admin (solo OWNER y ADMIN).
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="area-gestion min-h-dvh">
      <Suspense fallback={null}><NavegacionDelPanel area="admin" /></Suspense>
      {children}
      <Suspense fallback={null}><ToquiAdmin /></Suspense>
    </div>
  );
}
