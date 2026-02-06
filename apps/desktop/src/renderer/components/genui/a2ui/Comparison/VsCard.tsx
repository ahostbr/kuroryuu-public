/**
 * VsCard Component
 * Head-to-head VS comparison card with visual styling.
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { Badge } from '../../../ui/badge';

export interface ComparisonPoint {
  metric: string;
  value_a: string | number;
  value_b: string | number;
  winner?: 'left' | 'right' | 'tie';
}

export interface VsCardItem {
  name: string;
  image_url?: string;
  description?: string;
}

export interface VsCardProps {
  leftItem?: string;
  item_a?: VsCardItem;
  rightItem?: string;
  item_b?: VsCardItem;
  leftImage?: string;
  rightImage?: string;
  winner?: 'left' | 'right' | 'tie';
  comparison_points?: ComparisonPoint[];
}

export function VsCard({ leftItem, rightItem, leftImage, rightImage, winner, item_a, item_b, comparison_points }: VsCardProps): React.ReactElement {
  const itemA = item_a || { name: leftItem || 'Item A', image_url: leftImage };
  const itemB = item_b || { name: rightItem || 'Item B', image_url: rightImage };

  return (
    <Card className={`bg-card border-border ${winner === 'left' ? 'border-l-4 border-l-primary' : winner === 'right' ? 'border-r-4 border-r-primary' : ''}`}>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 text-center">
            {itemA.image_url && <img src={itemA.image_url} alt={itemA.name} className="w-16 h-16 object-cover rounded-full mx-auto mb-2 border border-border" />}
            <CardTitle className="text-base text-foreground">{itemA.name}</CardTitle>
            {winner === 'left' && <Badge className="mt-1 bg-primary text-primary-foreground border-0">Winner</Badge>}
          </div>
          <Badge variant="outline" className="bg-primary border-primary text-primary-foreground px-3 py-1 text-sm font-bold">VS</Badge>
          <div className="flex-1 text-center">
            {itemB.image_url && <img src={itemB.image_url} alt={itemB.name} className="w-16 h-16 object-cover rounded-full mx-auto mb-2 border border-border" />}
            <CardTitle className="text-base text-foreground">{itemB.name}</CardTitle>
            {winner === 'right' && <Badge className="mt-1 bg-primary text-primary-foreground border-0">Winner</Badge>}
          </div>
        </div>
      </CardHeader>
      {comparison_points && comparison_points.length > 0 && (
        <CardContent>
          <div className="space-y-3">
            {comparison_points.map((point: ComparisonPoint, idx: number) => (
              <div key={idx} className="grid grid-cols-3 gap-4 items-center">
                <div className={`text-sm text-right text-foreground/80 ${point.winner === 'left' ? 'font-bold text-primary' : ''}`}>{point.value_a}</div>
                <div className="text-xs text-center text-muted-foreground font-medium">{point.metric}</div>
                <div className={`text-sm text-foreground/80 ${point.winner === 'right' ? 'font-bold text-primary' : ''}`}>{point.value_b}</div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default VsCard;
