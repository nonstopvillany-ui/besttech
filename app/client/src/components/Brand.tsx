// Szöveges Besttech-embléma. Ha elkészül a hivatalos logófájl (Drive: Arculati elemek),
// ide kell beilleszteni.
export function Brand({ light = false, size = 'md' }: { light?: boolean; size?: 'md' | 'lg' }) {
  return (
    <span className={`brand ${light ? 'brand--light' : ''} brand--${size}`}>
      <svg className="brand__mark" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="currentColor" />
        <path d="M14 33 32 17l18 16" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 30v17h24V30" fill="none" stroke="#5fb0ff" strokeWidth="5" strokeLinejoin="round" />
      </svg>
      <span className="brand__text">
        <b>BESTTECH</b>
        <small>Kft.</small>
      </span>
    </span>
  );
}
