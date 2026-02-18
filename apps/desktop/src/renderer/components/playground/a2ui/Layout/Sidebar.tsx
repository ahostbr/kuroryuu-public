/**
 * Sidebar Component
 * Two-column layout with sticky sidebar. Responsive stacking on mobile.
 */
import React from 'react';

export interface SidebarProps {
  sidebar: React.ReactNode;
  content: React.ReactNode;
  sidebarWidth?: 'sm' | 'md' | 'lg';
  position?: 'left' | 'right';
  className?: string;
}

export function Sidebar({
  sidebar,
  content,
  sidebarWidth = 'md',
  position = 'left',
  className,
}: SidebarProps): React.ReactElement {
  const widthClasses = { sm: 'md:w-48', md: 'md:w-64', lg: 'md:w-80' };

  return (
    <div className={`flex flex-col md:flex-row gap-6 ${position === 'right' ? 'md:flex-row-reverse' : ''} ${className || ''}`}>
      <aside className={`w-full ${widthClasses[sidebarWidth]} md:sticky md:top-4 md:self-start md:max-h-[calc(100vh-2rem)] md:overflow-y-auto`}>
        <div className="p-4 bg-card rounded-lg border border-border backdrop-blur-sm">
          {sidebar}
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        {content}
      </main>
    </div>
  );
}

export default Sidebar;
