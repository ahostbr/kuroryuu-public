/**
 * ToolCard Component
 * Displays a tool/software resource with name, description, rating, and optional logo.
 */
import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../ui/card';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';

export interface ToolCardProps {
  name: string;
  description?: string;
  rating?: number;
  icon?: string;
  iconUrl?: string;
  url?: string;
  category?: string;
  pricing?: string;
  features?: string[];
}

export function ToolCard({ name, description, rating, icon, iconUrl, url, category, pricing, features }: ToolCardProps): React.ReactElement {
  const displayIcon = icon || iconUrl;

  const renderStars = () => {
    if (rating === undefined || rating === null) return null;
    const clamped = Math.min(5, Math.max(1, rating));
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(<span key={i} className={i <= clamped ? 'text-yellow-500' : 'text-muted-foreground/30'}>{'\u2605'}</span>);
    }
    return (
      <div className="flex items-center text-lg leading-none">
        {stars}
        <span className="text-xs text-muted-foreground ml-1">({rating})</span>
      </div>
    );
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            {displayIcon && (
              <img src={displayIcon} alt={name} className="w-10 h-10 rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base text-foreground">{name}</CardTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {category && <CardDescription className="text-muted-foreground">{category}</CardDescription>}
                {renderStars()}
              </div>
            </div>
          </div>
          {pricing && <Badge className="shrink-0 bg-primary/20 text-primary border-primary/30 hover:bg-primary/30">{pricing}</Badge>}
        </div>
      </CardHeader>
      {(description || features) && (
        <CardContent className="space-y-2">
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          {features && features.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-1">
              {features.slice(0, 5).map((feature, i) => (
                <li key={i} className="flex items-start gap-1"><span className="text-primary">&bull;</span><span>{feature}</span></li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
      {url && (
        <CardFooter>
          <Button asChild variant="outline" className="w-full border-border text-muted-foreground hover:bg-primary/10 hover:text-foreground">
            <a href={url} target="_blank" rel="noopener noreferrer">Visit Tool</a>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export default ToolCard;
