/**
 * ProfileCard Component
 * Displays user profile information with avatar, name, title, bio, and social links.
 */
import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../../ui/card';
import { Button } from '../../../ui/button';

export interface SocialLink { platform: string; url: string; }

export interface ProfileCardProps {
  name: string;
  title?: string;
  bio?: string;
  avatar_url?: string;
  company?: string;
  location?: string;
  social_links?: SocialLink[];
}

export function ProfileCard({ name, title, bio, avatar_url, company, location, social_links }: ProfileCardProps): React.ReactElement {
  const displayedLinks = social_links?.slice(0, 5) || [];

  return (
    <Card className="group cursor-default bg-card border-border">
      <CardHeader>
        <div className="flex items-start gap-4">
          {avatar_url ? (
            <div className="overflow-hidden rounded-full border-2 border-primary/40 transition-all duration-300 group-hover:border-primary/60">
              <img src={avatar_url} alt={name} className="w-16 h-16 object-cover transition-transform duration-300 group-hover:scale-110" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full border-2 border-primary/40 bg-secondary flex items-center justify-center transition-all duration-300 group-hover:border-primary/60">
              <span className="text-2xl font-bold text-muted-foreground">{name.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1">
            <CardTitle className="text-base text-foreground">{name}</CardTitle>
            <CardDescription className="text-muted-foreground">
              {title}{company && ` at ${company}`}{location && ` \u2022 ${location}`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      {bio && <CardContent><p className="text-sm text-foreground/80">{bio}</p></CardContent>}
      {displayedLinks.length > 0 && (
        <CardFooter className="flex gap-2 flex-wrap">
          {displayedLinks.map((link, idx) => (
            <Button key={idx} asChild variant="outline" size="sm" className="border-border text-muted-foreground hover:bg-primary/10 hover:text-foreground">
              <a href={link.url} target="_blank" rel="noopener noreferrer">{link.platform}</a>
            </Button>
          ))}
        </CardFooter>
      )}
    </Card>
  );
}

export default ProfileCard;
