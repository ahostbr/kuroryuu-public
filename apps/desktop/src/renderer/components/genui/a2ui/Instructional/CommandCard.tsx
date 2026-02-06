/**
 * CommandCard Component
 * Displays terminal/shell commands with copy functionality and optional command prefix.
 */
import React, { useState } from 'react';
import { Card, CardContent } from '../../../ui/card';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';

export interface CommandCardProps {
  command: string;
  language?: string;
  description?: string;
  copyable?: boolean;
}

export function CommandCard({ command, language, description, copyable = true }: CommandCardProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy command:', err);
    }
  };

  const getCommandPrefix = () => {
    if (!language) return '$';
    const lang = language.toLowerCase();
    if (lang === 'powershell' || lang === 'cmd') return '>';
    return '$';
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-6 space-y-3">
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        <div className="flex items-center gap-2 bg-secondary p-4 rounded-lg border border-border">
          <div className="flex items-center gap-2 flex-1 overflow-x-auto">
            {language && (
              <Badge variant="outline" className="text-xs shrink-0 bg-primary/10 border-primary/30 text-primary">{language}</Badge>
            )}
            <code className="font-mono text-sm flex-1 text-foreground">
              <span className="text-primary select-none">{getCommandPrefix()}</span>{' '}
              {command}
            </code>
          </div>
          {copyable && (
            <Button size="sm" variant="ghost" onClick={handleCopy} className="shrink-0 text-muted-foreground hover:text-foreground">
              {copied ? '\u2713 Copied' : 'Copy'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default CommandCard;
