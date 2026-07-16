import { UserIcon } from './Icon';

type Props = {
  src?: string | null;
  name?: string;
  size?: number;
  className?: string;
};

/**
 * Photo de profil circulaire.
 * Si src est présent → <img>. Sinon initiales du name ou UserIcon.
 */
export function Avatar({ src, name, size = 44, className = '' }: Props) {
  const initials = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  const style = { width: size, height: size };

  if (src) {
    return (
      <img
        src={src}
        alt={name ?? 'Avatar'}
        loading="lazy"
        style={style}
        className={`rounded-full object-cover ring-2 ring-white shadow-md ${className}`}
      />
    );
  }

  return (
    <div
      style={style}
      className={`grid place-items-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 font-bold text-white shadow-md ${className}`}
      aria-label={name ?? 'Avatar'}
    >
      {initials ? (
        <span style={{ fontSize: size * 0.36 }}>{initials}</span>
      ) : (
        <UserIcon className="h-1/2 w-1/2" />
      )}
    </div>
  );
}
