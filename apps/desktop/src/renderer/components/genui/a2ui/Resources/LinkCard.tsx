/**
 * LinkCard Component
 * Displays a clickable link resource card with title, description, and optional favicon.
 */
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card';

export interface LinkCardProps {
  title: string;
  url: string;
  description?: string;
  favicon?: string;
  domain?: string;
}

export function LinkCard({ title, url, description, favicon, domain }: LinkCardProps): React.ReactElement {
  const handleClick = () => { window.open(url, '_blank', 'noopener,noreferrer'); };

  return (
    <Card className="bg-card border-border hover:border-primary/40 transition-all cursor-pointer group" onClick={handleClick}>
      <CardHeader>
        <div className="flex items-start gap-3">
          {favicon ? (
            <img src={favicon} alt="" className="w-6 h-6 rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <span className="text-primary text-xl shrink-0">{'\uD83D\uDD17'}</span>
          )}
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base line-clamp-2 text-foreground group-hover:text-primary transition-colors">{title}</CardTitle>
            {domain && <CardDescription className="mt-1 text-muted-foreground">{domain}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      {description && (
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
        </CardContent>
      )}
    </Card>
  );
}

export default LinkCard;
