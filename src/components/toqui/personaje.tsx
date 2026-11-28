// US-151: dibujo de Toqui (SVG con los colores de la marca). Sin estado: lo usan el botón
// flotante, el chat y cualquier pantalla que quiera mostrarlo. Las animaciones están en toqui.css
// y se apagan solas con «reducir movimiento».
export function PersonajeToqui({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 72" aria-hidden="true" focusable="false" className={`toqui-svg ${className}`}>
      <ellipse className="toqui-sombra fill-marino" cx="32" cy="69" rx="14" ry="2.5" opacity=".18" />
      <g className="toqui-cuerpo">
        <circle cx="10" cy="47" r="4.2" className="fill-marca-hover" />
        <g className="toqui-mano"><circle cx="54" cy="41" r="4.2" className="fill-marca-hover" /></g>
        <circle cx="32" cy="42" r="22" className="fill-marca" />
        <polygon points="19,23 45,23 41,13 32,10 23,13" className="fill-superficie stroke-marca-hover" strokeWidth="1.5" strokeLinejoin="round" />
        <rect x="19" y="20" width="26" height="4" rx="1.5" className="fill-acento" />
        <g className="toqui-ojos">
          <ellipse cx="24" cy="38" rx="3.4" ry="4.2" className="fill-superficie" />
          <ellipse cx="40" cy="38" rx="3.4" ry="4.2" className="fill-superficie" />
          <circle cx="24.8" cy="38.8" r="1.9" className="fill-marino" />
          <circle cx="40.8" cy="38.8" r="1.9" className="fill-marino" />
        </g>
        <circle cx="19" cy="46" r="2.6" className="fill-acento" opacity=".7" />
        <circle cx="45" cy="46" r="2.6" className="fill-acento" opacity=".7" />
        <path d="M26 47 Q32 52.5 38 47" className="stroke-superficie" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <polygon points="26,60 32,62.5 26,65" className="fill-acento" />
        <polygon points="38,60 32,62.5 38,65" className="fill-acento" />
        <circle cx="32" cy="62.5" r="1.6" className="fill-marca-hover" />
      </g>
    </svg>
  );
}
