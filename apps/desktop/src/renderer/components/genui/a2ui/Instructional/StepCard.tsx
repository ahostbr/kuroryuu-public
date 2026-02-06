/**
 * StepCard Component
 * Displays an instructional step with number, title, description, and status indicator.
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { Badge } from '../../../ui/badge';

export interface StepCardProps {
  stepNumber: number;
  title: string;
  description: string;
  icon?: string;
  status?: 'pending' | 'active' | 'complete';
}

export function StepCard({
  stepNumber,
  title,
  description,
  icon,
  status = 'pending',
}: StepCardProps): React.ReactElement {
  const getStatusColor = () => {
    if (status === 'complete') return 'bg-emerald-500';
    if (status === 'active') return 'bg-primary';
    return 'bg-primary/50';
  };

  const getStatusBadge = () => {
    if (status === 'complete') return { text: 'Complete', cls: 'bg-emerald-500/20 text-emerald-400' };
    if (status === 'active') return { text: 'Active', cls: 'bg-primary/20 text-primary' };
    return { text: 'Pending', cls: 'bg-primary/10 text-muted-foreground' };
  };

  const statusBadge = getStatusBadge();

  return (
    <Card className={`bg-card border-border ${status === 'active' ? 'border-primary/50' : ''}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${getStatusColor()} text-primary-foreground font-bold shrink-0`}>
              {status === 'complete' ? '\u2713' : stepNumber}
            </div>
            <div className="flex-1">
              <CardTitle className="text-base flex items-center gap-2 text-foreground">
                {icon && <span>{icon}</span>}
                {title}
              </CardTitle>
            </div>
          </div>
          <Badge variant="secondary" className={statusBadge.cls}>{statusBadge.text}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-foreground/70 ml-[52px]">{description}</p>
      </CardContent>
    </Card>
  );
}

export default StepCard;
