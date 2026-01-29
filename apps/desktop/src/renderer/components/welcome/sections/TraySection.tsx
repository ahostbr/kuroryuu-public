import React from 'react';
import { Command, Volume2, Mic, MessageSquare, Search, Keyboard, Clipboard } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { VideoPlaceholder } from '../video';

interface FeatureItem {
  icon: React.ElementType;
  title: string;
  description: string;
}

const features: FeatureItem[] = [
  {
    icon: Volume2,
    title: 'Text-to-Speech',
    description: 'Windows SAPI or Edge neural voices for reading text aloud',
  },
  {
    icon: Mic,
    title: 'Voice Input',
    description: 'Speak to AI with real-time waveform visualization',
  },
  {
    icon: MessageSquare,
    title: 'LMStudio Chat',
    description: 'Devstral AI conversations with auto-speak responses',
  },
  {
    icon: Search,
    title: 'RAG Search',
    description: 'Quick codebase search via Kuroryuu MCP integration',
  },
  {
    icon: Keyboard,
    title: 'Global Hotkeys',
    description: 'Ctrl+Shift+S to speak clipboard anywhere on your system',
  },
  {
    icon: Clipboard,
    title: 'Auto-Speak',
    description: 'Automatically speak copied text with clipboard monitoring',
  },
];

interface TraySectionProps {
  className?: string;
}

export function TraySection({ className }: TraySectionProps) {
  return (
    <div className={cn('w-full space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Command className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Tray Companion</h2>
          <p className="text-sm text-muted-foreground">
            TTS, voice input, and AI chat in your system tray
          </p>
        </div>
      </div>

      {/* Video placeholder */}
      <VideoPlaceholder message="Tray Companion Demo" />

      {/* Feature grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.title}
              className="p-4 rounded-xl bg-card border border-border"
            >
              <Icon className="w-6 h-6 text-primary mb-2" />
              <h3 className="font-medium text-foreground">{feature.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {feature.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* How to access */}
      <div className="p-4 rounded-xl bg-secondary/50 border border-border">
        <h3 className="font-medium text-foreground mb-2">How to Access</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Click &quot;Tray Companion&quot; in the sidebar to launch</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Find the dragon icon in your system tray</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Right-click for quick TTS and RAG actions</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Use Ctrl+Shift+S to speak any clipboard text</span>
          </li>
        </ul>
      </div>

      {/* Requirements */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
        <h3 className="font-medium text-foreground mb-2">Requirements</h3>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-amber-500">•</span>
            <span>Python with <code className="text-primary">edge-tts</code> and <code className="text-primary">SpeechRecognition</code> packages</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-500">•</span>
            <span>LMStudio running at localhost:1234 for AI chat</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-500">•</span>
            <span>Internet connection for Edge TTS neural voices</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
