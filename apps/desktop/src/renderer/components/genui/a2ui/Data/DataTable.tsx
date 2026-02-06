/**
 * DataTable Component
 * Displays tabular data with optional sorting functionality.
 */
import React, { useState } from 'react';
import { Card, CardContent } from '../../../ui/card';

export interface DataTableProps {
  headers?: string[];
  rows: ((string | number)[] | Record<string, string | number>)[];
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
  // Normalize rows: LLM may send objects instead of arrays
  const normalizeRow = (row: (string | number)[] | Record<string, string | number>): (string | number)[] => {
    if (Array.isArray(row)) return row;
    if (row && typeof row === 'object') return Object.values(row);
    return [String(row)];
  };

  const normalizedRows = (rows || []).map(normalizeRow);

  // Auto-derive headers from object keys if not provided
  const resolvedHeaders: string[] = headers && headers.length > 0
    ? headers
    : (rows?.length > 0 && rows[0] && !Array.isArray(rows[0]) && typeof rows[0] === 'object')
      ? Object.keys(rows[0])
      : [];

  const [sortedRows, setSortedRows] = useState(normalizedRows);

  const handleSort = (columnIndex: number) => {
    if (!sortable) return;
    const newDirection = sortColumn === columnIndex && sortDirection === 'asc' ? 'desc' : 'asc';
    const sorted = [...normalizedRows].sort((a, b) => {
      const aVal = a[columnIndex];
      const bVal = b[columnIndex];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return newDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal ?? '').toLowerCase();
      const bStr = String(bVal ?? '').toLowerCase();
      if (aStr < bStr) return newDirection === 'asc' ? -1 : 1;
      if (aStr > bStr) return newDirection === 'asc' ? 1 : -1;
      return 0;
    });
    setSortColumn(columnIndex);
    setSortDirection(newDirection);
    setSortedRows(sorted);
  };

  const displayRows = sortable ? sortedRows : normalizedRows;

  return (
    <Card className="border-border overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            {caption && <caption className="p-4 text-sm text-muted-foreground">{caption}</caption>}
            <thead className="border-b border-border bg-primary/10">
              <tr>
                {resolvedHeaders?.map((header: string, idx: number) => (
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
              {displayRows?.map((row, rowIdx) => (
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
