import { ReactNode } from 'react';

export default function StatCard({ title, value, delta, icon }: { title: string; value: string | number; delta?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_0_1px_rgba(255,255,255,0.04),0_0_0_1px_rgba(139,92,246,0.15),0_8px_20px_rgba(34,211,238,0.08)] p-4 flex items-center gap-4">
      <div className="text-primary-400">{icon}</div>
      <div className="flex-1">
        <div className="text-sm text-slate-400">{title}</div>
        <div className="text-xl font-semibold text-slate-100">{value}</div>
        {delta && <div className="text-xs text-slate-400">{delta}</div>}
      </div>
    </div>
  );
}
