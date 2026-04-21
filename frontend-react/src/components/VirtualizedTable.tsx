import type React from 'react';
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

type VirtualizedTableProps<T> = {
  items: T[];
  rowKey: (item: T, index: number) => string | number;
  renderHeader: () => React.ReactNode;
  renderRow: (item: T, index: number) => React.ReactNode;
  emptyState: React.ReactNode;
  maxHeight?: number;
  estimateSize?: number;
  tableClassName?: string;
};

export default function VirtualizedTable<T>({
  items,
  rowKey,
  renderHeader,
  renderRow,
  emptyState,
  maxHeight = 520,
  estimateSize = 52,
  tableClassName = 'min-w-full text-sm table-fixed',
}: VirtualizedTableProps<T>) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 8,
  });

  if (!items.length) {
    return (
      <div className="overflow-x-auto">
        <table className={tableClassName}>
          <thead>{renderHeader()}</thead>
          <tbody>{emptyState}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="overflow-auto" style={{ maxHeight }}>
      <table className={tableClassName}>
        <thead className="sticky top-0 z-10 backdrop-blur">{renderHeader()}</thead>
        <tbody
          className="relative block"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            return (
              <tr
                key={rowKey(item, virtualRow.index)}
                className="absolute left-0 top-0 table w-full table-fixed"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {renderRow(item, virtualRow.index)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
