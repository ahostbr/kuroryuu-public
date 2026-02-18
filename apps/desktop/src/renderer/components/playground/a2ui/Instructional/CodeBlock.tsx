/**
 * CodeBlock Component
 * Displays code with optional title, copy button, and language badge.
 */
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader } from '../../../ui/card';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';

export interface CodeBlockProps {
  code: string;
  language: string;
  title?: string;
  copyable?: boolean;
}

export function CodeBlock({ code, language, title, copyable = true }: CodeBlockProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <Card className="bg-card border-border">
      {(title || copyable) && (
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            {title && <CardDescription className="font-mono text-xs text-muted-foreground">{title}</CardDescription>}
            <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30 text-primary">{language}</Badge>
          </div>
          {copyable && (
            <Button size="sm" variant="ghost" onClick={handleCopy} className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
              {copied ? '\u2713 Copied' : 'Copy'}
            </Button>
          )}
        </CardHeader>
      )}
      <CardContent className="p-0">
        <pre className="p-4 overflow-x-auto bg-secondary rounded-b-lg m-0">
          <code className={`text-sm font-mono language-${language} text-foreground/90`}>{code}</code>
        </pre>
      </CardContent>
    </Card>
  );
}

export default CodeBlock;
