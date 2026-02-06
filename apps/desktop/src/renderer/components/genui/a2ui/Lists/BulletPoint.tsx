/**
 * BulletPoint Component
 * Displays a bullet point item with text, optional indentation levels, and customizable icon.
 */
import React from 'react';

export interface BulletPointProps {
  text: string;
  level?: number;
  icon?: string;
  color?: string;
}

export function BulletPoint({ text, level = 0, icon = '\u2022' }: BulletPointProps): React.ReactElement {
  const leftMargin = level * 1.5;
  return (
    <div className="flex items-start gap-2 py-1" style={{ marginLeft: `${leftMargin}rem` }}>
      <span className="mt-1 text-primary shrink-0 font-bold">{icon}</span>
      <span className="text-sm flex-1 text-foreground leading-relaxed">{text}</span>
    </div>
  );
}

export default BulletPoint;
