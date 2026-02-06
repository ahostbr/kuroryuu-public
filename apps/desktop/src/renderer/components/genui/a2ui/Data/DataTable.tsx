/**
 * DataTable Component
 * Displays tabular data with optional sorting functionality.
 */
import React, { useState } from 'react';
import { Card, CardContent } from '../../../ui/card';

export interface DataTableProps {
  headers: string[];
  rows: (string | number)[][];
  caption?: string;
  sortable?: boolean;
}

export function DataTable({
  headers,
  rows,
  caption,
  sortable = false,
}: DataTableProps): React.ReactElement {
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [sortedRows, setSortedRows] = useState(rows);

  const handleSort = (columnIndex: number) => {
    if (!sortable) return;
    const newDirection = sortColumn === columnIndex && sortDirection === 'asc' ? 'desc' : 'asc';
    const sorted = [...rows].sort((a, b) => {
      const aVal = a[columnIndex];
      const bVal = b[columnIndex];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return newDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (aStr < bStr) return newDirection === 'asc' ? -1 : 1;
      if (aStr > bStr) return newDirection === 'asc' ? 1 : -1;
      return 0;
    });
    setSortColumn(columnIndex);
    setSortDirection(newDirection);
    setSortedRows(sorted);
  };

  const displayRows = sortable ? sortedRows : rows;

  return (
    <Card className="border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            {caption && <caption className="p-4 text-sm text-muted-foreground">{caption}</caption>}
            <thead className="border-b border-border bg-primary/10">
              <tr>
                {headers?.map((header: string, idx: number) => (
                  <th
                    key={idx}
                    className={`px-4 py-3 text-left text-sm font-semibold text-foreground ${sortable ? 'cursor-pointer hover:bg-primary/10' : ''}`}
                    onClick={() => handleSort(idx)}
                  >
                    <div className="flex items-center gap-2">
                      {header}
                      {sortable && sortColumn === idx && (
                        <span className="text-xs text-primary">{sortDirection === 'asc' ? '\u2191' : '\u2193'}</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows?.map((row: (string | number)[], rowIdx: number) => (
                <tr
                  key={rowIdx}
                  className={`border-b border-border last:border-0 hover:bg-primary/5 transition-colors ${rowIdx % 2 === 0 ? 'bg-secondary/20' : 'bg-transparent'}`}
                >
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="px-4 py-3 text-sm text-foreground/90">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default DataTable;
