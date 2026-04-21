import { ReactNode } from 'react';

export default function ChartCard({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="app-card p-3 sm:p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-medium text-slate-300">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}
