/**
 * CompanyCard Component
 * Displays company information with logo, name, description, and metrics.
 */
import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../ui/card';
import { Button } from '../../../ui/button';
import { Badge } from '../../../ui/badge';

export interface CompanyCardProps {
  name: string;
  description?: string;
  industry?: string;
  size?: string;
  logo_url?: string;
  founded?: string | number;
  location?: string;
  url?: string;
}

export function CompanyCard({ name, description, industry, size, logo_url, founded, location, url }: CompanyCardProps): React.ReactElement {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-start gap-3">
          {logo_url ? (
            <img src={logo_url} alt={name} className="w-12 h-12 rounded object-contain bg-secondary p-1 border border-border" />
          ) : (
            <div className="w-12 h-12 rounded bg-secondary border border-border flex items-center justify-center">
              <span className="text-lg font-bold text-muted-foreground">{name.substring(0, 2).toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1">
            <CardTitle className="text-base text-foreground">{name}</CardTitle>
            <CardDescription className="text-muted-foreground flex flex-wrap gap-1 items-center">
              {industry && <span>{industry}</span>}
              {size && industry && <span>&bull;</span>}
              {size && <span>{size} employees</span>}
              {location && (industry || size) && <span>&bull;</span>}
              {location && <span>{location}</span>}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      {description && (
        <CardContent className="space-y-2">
          <p className="text-sm text-foreground/80">{description}</p>
          {founded && (
            <div className="flex gap-2">
              <Badge variant="secondary" className="bg-secondary text-muted-foreground border border-border">Founded {founded}</Badge>
            </div>
          )}
        </CardContent>
      )}
      {url && (
        <CardFooter>
          <Button asChild variant="outline" className="w-full border-border text-muted-foreground hover:bg-primary/10 hover:text-foreground">
            <a href={url} target="_blank" rel="noopener noreferrer">Visit Website</a>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export default CompanyCard;
