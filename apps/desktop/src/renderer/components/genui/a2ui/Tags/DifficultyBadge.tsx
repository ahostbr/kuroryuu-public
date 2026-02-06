/**
 * DifficultyBadge Component
 * Displays difficulty level with appropriate color-coding and optional icons.
 */
import React from 'react';
import { Badge } from '../../../ui/badge';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

interface DifficultyConfig { label: string; color: string; bars: number; }

const DIFFICULTY_CONFIGS: Record<DifficultyLevel, DifficultyConfig> = {
  beginner: { label: 'Beginner', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', bars: 1 },
  intermediate: { label: 'Intermediate', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', bars: 2 },
  advanced: { label: 'Advanced', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', bars: 3 },
  expert: { label: 'Expert', color: 'bg-red-500/20 text-red-400 border-red-500/30', bars: 4 },
};

export interface DifficultyBadgeProps {
  level: DifficultyLevel;
  icon?: boolean;
  iconStyle?: 'bars' | 'emoji';
  showLabel?: boolean;
}

export function DifficultyBadge({ level, icon = true, iconStyle = 'bars', showLabel = true }: DifficultyBadgeProps): React.ReactElement {
  const config = DIFFICULTY_CONFIGS[level] || DIFFICULTY_CONFIGS.beginner;

  const renderBars = () => (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={idx} className={`w-1 h-3 rounded-sm ${idx < config.bars ? 'bg-current' : 'bg-current opacity-20'}`} />
      ))}
    </div>
  );

  return (
    <Badge variant="outline" className={`${config.color} font-medium flex items-center gap-2 px-2.5 py-1 w-fit`}>
      {icon && <span className="flex-shrink-0">{iconStyle === 'bars' ? renderBars() : '\u25CF'}</span>}
      {showLabel && <span>{config.label}</span>}
    </Badge>
  );
}

export default DifficultyBadge;
