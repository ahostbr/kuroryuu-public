import React, { useState } from 'react';
import {
  Download,
  Box,
  Cpu,
  FileCode,
  Server,
  CheckCircle,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../../lib/utils';

interface Step {
  id: string;
  title: string;
  icon: React.ElementType;
  content: React.ReactNode;
}

const steps: Step[] = [
  {
    id: 'download',
    title: 'Download LMStudio',
    icon: Download,
    content: (
      <div className="space-y-3">
        <p className="text-muted-foreground">
          LMStudio is a desktop application for running local language models.
        </p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Visit <a href="https://lmstudio.ai" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">lmstudio.ai</a></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Download for your platform (Windows/Mac/Linux)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Install and launch the application</span>
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'model',
    title: 'Download Model',
    icon: Box,
    content: (
      <div className="space-y-3">
        <p className="text-muted-foreground">
          Download the recommended model for Kuroryuu.
        </p>
        <div className="p-3 rounded-lg bg-secondary/50 border border-border">
          <div className="font-mono text-sm text-foreground">
            mistralai/devstral-small-2-2512
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Staff Picks • Q4_K_M • 15.21 GB download
          </div>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Open LMStudio → &quot;Discover&quot; tab</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Search for the model above or browse &quot;Staff Picks&quot;</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Select <strong>Q4_K_M</strong> quantization</span>
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'gpu',
    title: 'Configure GPU',
    icon: Cpu,
    content: (
      <div className="space-y-3">
        <p className="text-muted-foreground">
          Optimize GPU settings for best performance.
        </p>
        <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">GPU Offload:</span>
            <span className="font-mono text-foreground">40/40 layers</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Expected VRAM:</span>
            <span className="font-mono text-foreground">~22.90 GB @ 128k context</span>
          </div>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Model Settings → GPU Offload</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>If less VRAM: reduce context or offload fewer layers</span>
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'jinja',
    title: 'Jinja Template',
    icon: FileCode,
    content: (
      <div className="space-y-3">
        <p className="text-muted-foreground">
          Configure the chat template for tool use.
        </p>
        <div className="p-3 rounded-lg bg-secondary/50 border border-border">
          <div className="text-xs text-muted-foreground">Reference:</div>
          <div className="font-mono text-xs text-foreground break-all">
            apps/gateway/llm/schemas/kuroryuu_tools_schema.json
          </div>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Chat Settings → Advanced → Jinja Template</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Or use model default (usually works)</span>
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'server',
    title: 'Start Server',
    icon: Server,
    content: (
      <div className="space-y-3">
        <p className="text-muted-foreground">
          Start the local API server.
        </p>
        <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Port:</span>
            <span className="font-mono text-foreground">1234 (default)</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">CORS:</span>
            <span className="font-mono text-foreground">Enabled</span>
          </div>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Click &quot;Local Server&quot; tab</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Enable &quot;Enable CORS&quot;</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Click &quot;Start Server&quot;</span>
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'test',
    title: 'Test Connection',
    icon: CheckCircle,
    content: (
      <div className="space-y-3">
        <p className="text-muted-foreground">
          Verify Kuroryuu can connect to LMStudio.
        </p>
        <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Endpoint:</span>
            <span className="font-mono text-foreground">http://localhost:1234</span>
          </div>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>In Kuroryuu: Settings → LMStudio</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Click &quot;Test Connection&quot;</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">•</span>
            <span>Green checkmark = ready!</span>
          </li>
        </ul>
      </div>
    ),
  },
];

interface LMStudioSectionProps {
  className?: string;
}

export function LMStudioSection({ className }: LMStudioSectionProps) {
  const [activeStep, setActiveStep] = useState(0);
  const currentStep = steps[activeStep];

  return (
    <div className={cn('w-full space-y-6', className)}>
      {/* LMStudio intro banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-purple-500/10 border border-purple-500/30">
        <Cpu className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-medium text-foreground">LMStudio - Local LLM Setup</div>
          <p className="text-sm text-muted-foreground mt-1">
            Run models locally for offline access and complete privacy.
          </p>
          <ul className="text-sm text-muted-foreground mt-2 space-y-1">
            <li className="flex items-start gap-2">
              <span className="text-purple-500">•</span>
              <span>No internet required after model download</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-500">•</span>
              <span>Complete privacy - data never leaves your machine</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-2">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const isActive = i === activeStep;
          const isComplete = i < activeStep;

          return (
            <React.Fragment key={step.id}>
              <button
                onClick={() => setActiveStep(i)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg transition-all',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isComplete
                    ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium hidden lg:inline">{step.title}</span>
              </button>
              {i < steps.length - 1 && (
                <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step content */}
      <div className="p-6 rounded-xl bg-card border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <currentStep.icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              Step {activeStep + 1} of {steps.length}
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              {currentStep.title}
            </h3>
          </div>
        </div>

        {currentStep.content}

        {/* Navigation */}
        <div className="flex justify-between mt-6 pt-4 border-t border-border">
          <button
            onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
            disabled={activeStep === 0}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeStep === 0
                ? 'text-muted-foreground/50 cursor-not-allowed'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            Previous
          </button>
          <button
            onClick={() => setActiveStep(Math.min(steps.length - 1, activeStep + 1))}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {activeStep === steps.length - 1 ? 'Done' : 'Next'}
          </button>
        </div>
      </div>

      {/* Note */}
      <p className="text-center text-sm text-muted-foreground">
        LMStudio runs models locally on your GPU. Ensure you have sufficient VRAM for your chosen model.
      </p>
    </div>
  );
}
