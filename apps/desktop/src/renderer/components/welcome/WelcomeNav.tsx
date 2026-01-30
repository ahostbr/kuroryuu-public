import React from 'react';
import {
  Home,
  Cpu,
  Terminal,
  Command,
  Layers,
  GitBranch,
  Puzzle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useWelcomeStore, WelcomeSection } from '../../stores/welcome-store';

interface NavItem {
  id: WelcomeSection;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'cliproxyapi', label: 'CLIProxyAPI', icon: Cpu },
  { id: 'tray', label: 'Tray', icon: Command },
  { id: 'cli', label: 'CLI', icon: Terminal },
  { id: 'features', label: 'Features', icon: Layers },
  { id: 'architecture', label: 'Architecture', icon: GitBranch },
  { id: 'plugin', label: 'Plugin', icon: Puzzle },
];

interface WelcomeNavProps {
  className?: string;
}

export function WelcomeNav({ className }: WelcomeNavProps) {
  const { currentSection, setSection, tourActive, endTour } = useWelcomeStore();

  const handleNavClick = (section: WelcomeSection) => {
    // End tour when navigating away
    if (tourActive) {
      endTour();
    }
    setSection(section);
  };

  return (
    <nav className={cn('w-full', className)}>
      <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary/50 border border-border">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentSection === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                'flex-1 justify-center',
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
