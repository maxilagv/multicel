import { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'framer-motion';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'outline';
  loading?: boolean;
};

export default function Button({ children, className, variant = 'primary', loading, disabled, ...rest }: Props) {
  const base =
    'touch-target inline-flex items-center justify-center rounded-xl px-4 h-11 text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-400/50';

  const variants = {
    primary:
      'text-white bg-gradient-to-br from-indigo-500 to-fuchsia-600 shadow-[0_12px_30px_rgba(139,92,246,0.35)] hover:shadow-[0_18px_40px_rgba(139,92,246,0.45)]',
    ghost: 'text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10',
    outline: 'text-slate-200 bg-transparent border border-white/20 hover:bg-white/10',
  } as const;

  return (
    <motion.button
      whileHover={{ scale: disabled || loading ? 1 : 1.015 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      className={[
        base,
        variants[variant],
        disabled || loading ? 'opacity-60 cursor-not-allowed' : '',
        className || '',
      ].join(' ')}
      disabled={disabled || loading}
      {...(rest as any)}
    >
      {children}
    </motion.button>
  );
}
