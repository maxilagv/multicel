import type { ReactNode } from 'react';

type Props = {
  kind?: 'error' | 'warning' | 'info';
  message?: ReactNode | null;
  className?: string;
};

export default function Alert({ kind = 'error', message, className = '' }: Props) {
  if (!message) return null;

  const base = 'w-full rounded-md px-3 py-2 text-sm flex items-start gap-2';
  const palette =
    kind === 'error'
      ? 'bg-red-500/10 text-red-300 border border-red-500/30'
      : kind === 'warning'
      ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
      : 'bg-blue-500/10 text-blue-300 border border-blue-500/30';

  const icon = kind === 'info' ? 'i' : '!';

  return (
    <div className={`${base} ${palette} ${className}`.trim()}>
      <span aria-hidden className="pt-0.5 select-none">{icon}</span>
      <p>{message}</p>
    </div>
  );
}
