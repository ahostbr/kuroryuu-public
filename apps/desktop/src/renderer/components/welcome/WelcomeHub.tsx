import React from 'react';
import { cn } from '../../lib/utils';
import { WelcomeNav } from './WelcomeNav';
import {
  OverviewSection,
  CLIProxyAPISection,
  TraySection,
  CLISection,
  FeaturesSection,
  ArchitectureSection,
  PluginSection,
} from './sections';
import { useWelcomeStore, WelcomeSection } from '../../stores/welcome-store';

interface WelcomeHubProps {
  className?: string;
}

// Section component mapping
const sectionComponents: Record<WelcomeSection, React.ComponentType<{ className?: string }>> = {
  overview: OverviewSection,
  cliproxyapi: CLIProxyAPISection,
  tray: TraySection,
  cli: CLISection,
  features: FeaturesSection,
  architecture: ArchitectureSection,
  plugin: PluginSection,
};

export function WelcomeHub({ className }: WelcomeHubProps) {
  const { currentSection } = useWelcomeStore();

  const SectionComponent = sectionComponents[currentSection];

  return (
    <div
      className={cn(
        'h-full w-full flex flex-col bg-background overflow-hidden',
        className
      )}
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-secondary/20 to-background pointer-events-none" />

      {/* Content container */}
      <div className="relative z-10 flex flex-col h-full overflow-hidden">
        {/* Navigation tabs - sticky at top */}
        <div className="flex-shrink-0 p-4 pb-0">
          <WelcomeNav />
        </div>

        {/* Section content - scrollable */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-4xl mx-auto">
            <SectionComponent />
          </div>
        </div>
      </div>
    </div>
  );
}
