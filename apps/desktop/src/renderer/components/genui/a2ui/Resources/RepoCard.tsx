/**
 * RepoCard Component
 * Displays a GitHub repository resource with GitHub-style formatting.
 */
import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../ui/card';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';

export interface RepoCardProps {
  name: string;
  url: string;
  description: string;
  language: string;
  stars: number;
  owner: string;
  forks?: number;
}

export function RepoCard({ name, url, description, language, stars, owner, forks }: RepoCardProps): React.ReactElement {
  const formatNumber = (num: number): string => num >= 1000 ? `${(num / 1000).toFixed(1)}k` : num.toString();

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-foreground">
          <span className="text-primary shrink-0">{'\uD83D\uDCE6'}</span>
          {owner && <span className="text-sm text-muted-foreground font-normal">{owner} /</span>}
          <span className="truncate">{name}</span>
        </CardTitle>
        <CardDescription className="flex items-center gap-3 flex-wrap">
          {language && <Badge variant="outline" className="shrink-0 bg-primary/10 text-primary border-primary/30">{language}</Badge>}
          {stars !== undefined && stars !== null && (
            <span className="text-xs flex items-center gap-1 text-muted-foreground">
              <span className="text-primary">{'\u2B50'}</span>{formatNumber(stars)}
            </span>
          )}
          {forks !== undefined && forks !== null && (
            <span className="text-xs flex items-center gap-1 text-muted-foreground">
              <span className="text-primary">{'\uD83D\uDD00'}</span>{formatNumber(forks)}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      {description && <CardContent><p className="text-sm text-muted-foreground line-clamp-2">{description}</p></CardContent>}
      {url && (
        <CardFooter>
          <Button asChild variant="outline" className="w-full border-border text-muted-foreground hover:bg-primary/10 hover:text-foreground">
            <a href={url} target="_blank" rel="noopener noreferrer">View Repository</a>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export default RepoCard;
