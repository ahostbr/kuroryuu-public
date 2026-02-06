/**
 * TLDR Component
 * Displays a quick summary in a highlighted box with optional key points.
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';

export interface TLDRProps {
  summary: string;
  key_points?: string[];
  icon?: string;
}

export function TLDR({ summary, key_points, icon = '\u26A1' }: TLDRProps): React.ReactElement {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="bg-primary/20 px-2 py-1 rounded text-primary border border-primary/30">
            {icon} TL;DR
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm font-medium text-foreground">{summary}</p>
        {key_points && key_points.length > 0 && (
          <ul className="space-y-1 mt-2">
            {key_points.map((point: string, idx: number) => (
              <li key={idx} className="text-sm text-foreground/80 flex gap-2">
                <span className="text-primary">&bull;</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default TLDR;
