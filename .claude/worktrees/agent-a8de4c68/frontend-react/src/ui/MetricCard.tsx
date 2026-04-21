import { ReactNode } from 'react';
import { motion } from 'framer-motion';

type Props = {
  title: string;
  value: string | number;
  delta?: string;
  icon?: ReactNode;
  tone?: 'pink' | 'purple' | 'cyan' | 'green' | 'amber';
};

const toneStyles: Record<NonNullable<Props['tone']>, { bar: string; glow: string; icon: string }> = {
  pink: { bar: 'bg-gradient-to-r from-[#ff0844] to-[#ff6b9d]', glow: 'shadow-[0_16px_40px_rgba(255,8,68,0.25)]', icon: 'bg-[#ff0844]/15 text-[#ff6b9d]' },
  purple: { bar: 'bg-gradient-to-r from-[#667eea] to-[#764ba2]', glow: 'shadow-[0_16px_40px_rgba(118,75,162,0.25)]', icon: 'bg-[#8b5cf6]/15 text-[#c4b5fd]' },
  cyan: { bar: 'bg-gradient-to-r from-[#00d2ff] to-[#3a7bd5]', glow: 'shadow-[0_16px_40px_rgba(0,210,255,0.2)]', icon: 'bg-[#00f5ff]/15 text-[#7dd3fc]' },
  green: { bar: 'bg-gradient-to-r from-[#00f5a0] to-[#00d9f5]', glow: 'shadow-[0_16px_40px_rgba(0,245,160,0.18)]', icon: 'bg-[#00f5a0]/15 text-[#86efac]' },
  amber: { bar: 'bg-gradient-to-r from-[#ffa500] to-[#ffd700]', glow: 'shadow-[0_16px_40px_rgba(255,165,0,0.2)]', icon: 'bg-[#ffd700]/15 text-[#fde68a]' },
};

export default function MetricCard({ title, value, delta, icon, tone = 'purple' }: Props) {
  const palette = toneStyles[tone];
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`rounded-2xl bg-black/50 border border-white/10 p-4 ${palette.glow} backdrop-blur-xl flex items-center gap-4 relative overflow-hidden`}
    >
      <span className={`absolute top-0 left-0 h-1 w-full ${palette.bar}`} />
      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${palette.icon}`}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm text-slate-400">{title}</div>
        <div className="text-xl font-semibold text-slate-100 font-data">{value}</div>
        {delta && <div className="text-xs text-slate-400">{delta}</div>}
      </div>
    </motion.div>
  );
}
