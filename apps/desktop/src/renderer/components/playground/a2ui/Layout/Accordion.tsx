/**
 * Accordion Component
 * Expandable sections (no dependency on shadcn Accordion).
 */
import React, { useState } from 'react';

export interface AccordionItemData {
  label: string;
  content: React.ReactNode;
}

export interface AccordionProps {
  items: AccordionItemData[];
  multiple?: boolean;
  allowEmpty?: boolean;
  className?: string;
}

export function Accordion({ items, multiple = false, className }: AccordionProps): React.ReactElement {
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());

  const toggleItem = (index: number) => {
    setOpenItems(prev => {
      const next = new Set(multiple ? prev : []);
      if (prev.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className={`bg-secondary/30 rounded-lg border border-border ${className || ''}`}>
      {items.map((item, index) => {
        const isOpen = openItems.has(index);
        return (
          <div key={index} className="border-b border-border last:border-0">
            <button
              onClick={() => toggleItem(index)}
              className="w-full px-4 py-3 flex items-center justify-between text-foreground hover:text-primary hover:bg-primary/5 transition-colors text-left"
            >
              <span className="font-medium">{item.label}</span>
              <span className={`text-primary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                {'\u25BC'}
              </span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 text-foreground/80 text-sm">
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default Accordion;
