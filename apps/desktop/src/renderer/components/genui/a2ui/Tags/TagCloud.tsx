/**
 * TagCloud Component
 * Displays multiple tags in a word cloud or fluid layout with optional size variation.
 */
import React from 'react';
import { Badge } from '../../../ui/badge';

export interface TagItem { name: string; count?: number; }

export interface TagCloudProps {
  tags: string[] | TagItem[];
  maxTags?: number;
  onTagClick?: (tag: string) => void;
  sizeVariation?: boolean;
  minSize?: number;
  maxSize?: number;
}

export function TagCloud({ tags, maxTags, onTagClick, sizeVariation = true, minSize = 0.75, maxSize = 1.5 }: TagCloudProps): React.ReactElement {
  const normalizedTags: TagItem[] = tags.map(tag => typeof tag === 'string' ? { name: tag, count: 1 } : tag);
  const displayedTags = maxTags ? normalizedTags.slice(0, maxTags) : normalizedTags;
  const counts = displayedTags.map(t => t.count || 1);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);

  const getTagSize = (count: number = 1): number => {
    if (!sizeVariation || minCount === maxCount) return 1;
    const normalized = (count - minCount) / (maxCount - minCount);
    return minSize + normalized * (maxSize - minSize);
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {displayedTags.map((tag, idx) => {
        const tagName = typeof tag === 'string' ? tag : tag.name;
        const tagCount = typeof tag === 'string' ? 1 : tag.count;
        const size = getTagSize(tagCount);
        return (
          <Badge
            key={idx}
            variant="secondary"
            className={`bg-secondary text-foreground border border-border hover:bg-primary/10 hover:border-primary/30 ${onTagClick ? 'cursor-pointer transition-all duration-200' : ''}`}
            style={{ fontSize: `${size}rem` }}
            onClick={() => onTagClick?.(tagName)}
          >
            {tagName}
            {tagCount !== undefined && tagCount > 1 && <span className="ml-1.5 text-xs text-muted-foreground">({tagCount})</span>}
          </Badge>
        );
      })}
    </div>
  );
}

export default TagCloud;
