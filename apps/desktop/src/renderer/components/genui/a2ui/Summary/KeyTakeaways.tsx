/**
 * KeyTakeaways Component
 * Displays a bulleted list of key points with optional category badges.
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { Badge } from '../../../ui/badge';

export interface TakeawayItem {
  text: string;
  category?: 'insights' | 'learnings' | 'conclusions' | 'recommendations';
}

export interface KeyTakeawaysProps {
  items: (string | TakeawayItem)[];
  title?: string;
}

export function KeyTakeaways({ items, title = 'Key Takeaways' }: KeyTakeawaysProps): React.ReactElement {
  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'insights': return 'bg-blue-500/20 text-blue-400';
      case 'learnings': return 'bg-green-500/20 text-green-400';
      case 'conclusions': return 'bg-purple-500/20 text-purple-400';
      case 'recommendations': return 'bg-orange-500/20 text-orange-400';
      default: return '';
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base text-primary">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((item, idx) => {
            const isString = typeof item === 'string';
            const text = isString ? item : item.text;
            const category = isString ? undefined : item.category;
            return (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-primary mt-1">{'\u2713'}</span>
                <div className="flex-1 flex items-start gap-2 flex-wrap">
                  <span className="text-sm text-foreground">{text}</span>
                  {category && (
                    <Badge variant="secondary" className={getCategoryColor(category)}>
                      {category}
                    </Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export default KeyTakeaways;
