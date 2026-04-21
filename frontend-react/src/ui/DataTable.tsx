import { ReactNode } from 'react';

export default function DataTable({ headers, children }: { headers: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto app-table-shell">
      <table className="min-w-full text-xs sm:text-sm text-slate-200">
        {headers}
        {children}
      </table>
    </div>
  );
}
