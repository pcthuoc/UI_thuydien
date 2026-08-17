interface PotecoLogoProps {
  /** 'full' for expanded sidebar / login, 'icon' for collapsed sidebar / square */
  variant?: 'full' | 'icon';
  className?: string;
  alt?: string;
}

export function PotecoLogo({
  variant = 'full',
  className = '',
  alt = 'Poteco Hydro Logo',
}: PotecoLogoProps) {
  if (variant === 'icon') {
    return (
      <img
        src="/img/favicon.svg"
        alt={alt}
        className={`h-9 w-9 object-contain select-none transition-transform duration-200 ${className}`}
        loading="eager"
        decoding="async"
      />
    );
  }

  return (
    <img
      src="/img/poteco-logo.svg"
      alt={alt}
      className={`h-11 w-auto max-w-[200px] object-contain select-none transition-all duration-200 ${className}`}
      loading="eager"
      decoding="async"
    />
  );
}
