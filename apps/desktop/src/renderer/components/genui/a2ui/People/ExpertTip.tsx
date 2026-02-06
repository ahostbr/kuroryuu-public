/**
 * ExpertTip Component
 * Displays expert advice with expertise area badge, tip title, and description.
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { Badge } from '../../../ui/badge';

export interface ExpertTipProps {
  tip?: string;
  content?: string;
  expert?: string;
  expertName?: string;
  category?: string;
  title?: string;
  difficulty?: string;
  icon?: string;
}

export function ExpertTip({ tip, content, expert, expertName, category, title, difficulty, icon }: ExpertTipProps): React.ReactElement {
  const displayTip = tip || content || 'Expert tip';
  const displayExpert = expert || expertName;

  return (
    <Card className="bg-card border-l-4 border-l-primary border-border">
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xl text-primary">{icon || '\uD83D\uDCA1'}</span>
          <CardTitle className="text-sm text-foreground">{title || 'Expert Tip'}</CardTitle>
          {category && <Badge variant="secondary" className="bg-secondary text-muted-foreground border border-border">{category}</Badge>}
          {difficulty && <Badge variant="outline" className="text-xs border-border text-muted-foreground">{difficulty}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-foreground/80">{displayTip}</p>
        {displayExpert && <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">&mdash; {displayExpert}</p>}
      </CardContent>
    </Card>
  );
}

export default ExpertTip;
