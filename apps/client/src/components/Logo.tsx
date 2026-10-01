export function Logo({ className = '' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="TamCar"
      className={className}
      style={{ width: 'auto' }}
    />
  );
}

/**
 * Logo horizontal de l'accueil : l'emblème (recadré dans logo.png) suivi du
 * mot « TamCar » composé dans la police de l'app. Le logo.png d'origine est
 * vertical et entouré de blanc : trop haut pour une barre d'en-tête.
 */
export function LogoHorizontal({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-sm ${className}`} aria-label="TamCar">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.png" alt="" className="h-9 w-auto" />
      <span className="text-[26px] font-semibold leading-none tracking-tight text-primary-600">
        TamCar
      </span>
    </span>
  );
}
