/**
 * ComparisonTable Component
 * Side-by-side table comparison for displaying features/items in tabular format.
 */
import React from 'react';
import { Card, CardContent } from '../../../ui/card';

export interface ComparisonTableProps {
  headers: string[];
  rows: Array<string[] | any[]>;
  title?: string;
  subtitle?: string;
  caption?: string;
}

export function ComparisonTable({ headers, rows, title, subtitle, caption }: ComparisonTableProps): React.ReactElement {
  return (
    <Card className="bg-card border-border">
      {(title || subtitle) && (
        <div className="p-4 border-b border-border">
          {title && <h3 className="text-lg font-semibold text-foreground">{title}</h3>}
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      )}
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            {caption && <caption className="p-4 text-sm font-semibold text-muted-foreground">{caption}</caption>}
            <thead className="bg-secondary border-b border-border">
              <tr>
                {headers?.map((header: string, idx: number) => (
                  <th key={idx} className="px-4 py-3 text-left text-sm font-semibold text-foreground">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows?.map((row: any, rowIdx: number) => (
                <tr key={rowIdx} className={`border-b last:border-0 border-border ${rowIdx % 2 === 0 ? 'bg-secondary/20' : 'bg-transparent'}`}>
                  {row.map((cell: any, cellIdx: number) => (
                    <td key={cellIdx} className="px-4 py-3 text-sm text-foreground/80">
                      {typeof cell === 'boolean' ? (
                        <span className={cell ? 'text-primary' : 'text-muted-foreground/50'}>{cell ? '\u2713' : '\u2717'}</span>
                      ) : cell}
                    </td>
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

export default ComparisonTable;
