import React from 'react';
import { Cpu, ArrowRight } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { HeroVideo } from '../video';
import { GuidedTour } from '../GuidedTour';
import { useWelcomeStore } from '../../../stores/welcome-store';

// Import dragon logo
import kuroryuuDragon from '../../../assets/shared/logos/kuroryuu-dragon.png';

interface OverviewSectionProps {
  className?: string;
}

export function OverviewSection({ className }: OverviewSectionProps) {
  const { setSection, tourActive } = useWelcomeStore();

  return (
    <div className={cn('w-full space-y-8', className)}>
      {/* Hero area */}
      <div className="text-center space-y-4">
        {/* Logo */}
        <div className="flex justify-center">
          <img
            src={kuroryuuDragon}
            alt="Kuroryuu"
            className="w-24 h-24"
            style={{ filter: 'drop-shadow(0 0 20px rgba(201, 162, 39, 0.4))' }}
          />
        </div>

        {/* Title */}
        <div>
          <h1
            className="text-4xl font-bold text-primary tracking-wider"
            style={{ textShadow: '0 0 30px rgba(201, 162, 39, 0.3)' }}
          >
            Kuroryuu-Genmu
          </h1>
          <p className="text-lg text-muted-foreground mt-2">
            黒き幻影の霧の龍
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1 italic">
            Black Dragon Of Illusionary Fog
          </p>
        </div>
      </div>

      {/* Hero Video */}
      <HeroVideo
        // src will be provided when video is ready
        captions={[
          { text: 'Kanban', startTime: 0, endTime: 2 },
          { text: 'Multi-Agent Terminals', startTime: 2, endTime: 4 },
          { text: 'Traffic Monitor', startTime: 4, endTime: 6 },
          { text: 'Real-time Capture', startTime: 6, endTime: 8 },
        ]}
      />

      {/* Guided Tour */}
      <div className="mt-8">
        <GuidedTour />
      </div>

      {/* Quick action cards - shown when tour is not active */}
      {!tourActive && (
        <div className="grid grid-cols-2 gap-4 mt-8">
          <button
            onClick={() => setSection('cliproxyapi')}
            className={cn(
              'flex flex-col items-center justify-center p-6 rounded-xl',
              'bg-card/50 border border-primary/30 hover:border-primary/50',
              'hover:bg-secondary hover:shadow-lg transition-all group',
              'shadow-[0_0_15px_rgba(201,162,39,0.1)]'
            )}
          >
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
              <Cpu className="w-6 h-6 text-primary" />
            </div>
            <span className="font-semibold text-foreground">Set up CLIProxyAPI</span>
            <span className="text-sm text-muted-foreground mt-1">
              Configure AI providers
            </span>
          </button>

          <button
            onClick={() => setSection('architecture')}
            className={cn(
              'flex flex-col items-center justify-center p-6 rounded-xl',
              'bg-card/50 border border-primary/30 hover:border-primary/50',
              'hover:bg-secondary hover:shadow-lg transition-all group',
              'shadow-[0_0_15px_rgba(201,162,39,0.1)]'
            )}
          >
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
              <ArrowRight className="w-6 h-6 text-primary" />
            </div>
            <span className="font-semibold text-foreground">Explore Architecture</span>
            <span className="text-sm text-muted-foreground mt-1">
              See how it works
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
