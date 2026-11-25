export function Marca({ inversa = false }: { inversa?: boolean }) {
  return <span className={`inline-flex items-center gap-2.5 ${inversa ? "text-white" : "text-texto"}`}>
    <svg viewBox="0 0 36 36" width="36" height="36" fill="none" aria-hidden="true" className="shrink-0">
      <rect width="36" height="36" rx="11" fill="currentColor" />
      <path d="M10 23h16M12 20a6 6 0 0 1 12 0M18 11v3" className={inversa ? "stroke-texto" : "stroke-white"} strokeWidth="2" strokeLinecap="round" />
    </svg>
    <span className="text-xl font-bold tracking-tight">AlToque<span className="text-acento">.</span></span>
  </span>;
}
