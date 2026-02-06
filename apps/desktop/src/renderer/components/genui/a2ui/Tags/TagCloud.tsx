/**
 * TagCloud Component — Imperial tag display
 * Terminal-style monospace tags with gold accents.
 */
import React from 'react';

export interface TagItem { name: string; count?: number; }

export interface TagCloudProps {
  tags: string[] | TagItem[];
  maxTags?: number;
  onTagClick?: (tag: string) => void;
  sizeVariation?: boolean;
  minSize?: number;
  maxSize?: number;
}

export function TagCloud({ tags, maxTags, onTagClick }: TagCloudProps): React.ReactElement {
  const normalizedTags: TagItem[] = (tags || []).map(tag =>
    typeof tag === 'string' ? { name: tag, count: 1 } : tag
  );
  const displayedTags = maxTags ? normalizedTags.slice(0, maxTags) : normalizedTags;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {displayedTags.map((tag, idx) => {
        const tagName = typeof tag === 'string' ? tag : tag.name;
        const tagCount = typeof tag === 'string' ? 1 : tag.count;
        return (
          <span
            key={idx}
            className={`genui-tag ${onTagClick ? 'cursor-pointer' : ''}`}
            onClick={() => onTagClick?.(tagName)}
          >
            {tagName}
            {tagCount !== undefined && tagCount > 1 && (
              <span style={{ marginLeft: '4px', opacity: 0.5, fontSize: '0.6rem' }}>
                {tagCount}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export default TagCloud;
