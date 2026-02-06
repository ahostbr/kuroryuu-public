/**
 * Tabs Component
 * A simple tabbed interface (no dependency on shadcn Tabs).
 */
import React, { useState } from 'react';
import { Card, CardContent } from '../../../ui/card';

export interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  defaultTab?: number;
  className?: string;
}

export function Tabs({ tabs, defaultTab = 0, className }: TabsProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState(tabs[defaultTab]?.id || tabs[0]?.id || '');

  return (
    <div className={className}>
      <div className="flex w-full bg-secondary border border-border rounded-lg p-1 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-all ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        tab.id === activeTab ? (
          <Card key={tab.id} className="bg-card border-border">
            <CardContent className="pt-6">{tab.content}</CardContent>
          </Card>
        ) : null
      ))}
    </div>
  );
}

export default Tabs;
