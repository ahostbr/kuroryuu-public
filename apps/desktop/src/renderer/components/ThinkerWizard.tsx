import { useState, useEffect } from 'react';
import {
  X,
  Lightbulb,
  Search,
  Wrench,
  GitMerge,
  Flame,
  Atom,
  Target,
  Shield,
  Heart,
  Network,
  Loader2,
  Sparkles
} from 'lucide-react';

interface ThinkerPersona {
  id: string;
  name: string;
  file: string;
  category: string;
  description: string;
  style: string;
  icon: string;
  color: string;
  compatible_with: string[];
  tags: string[];
}

interface ThinkerWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunch: (basePath: string, personaPath: string, personaName: string) => void;
  embedded?: boolean;
}

// Map icon names from index.json to Lucide components
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  lightbulb: Lightbulb,
  search: Search,
  wrench: Wrench,
  merge: GitMerge,
  flame: Flame,
  atom: Atom,
  target: Target,
  shield: Shield,
  heart: Heart,
  network: Network,
};

export function ThinkerWizard({ isOpen, onClose, onLaunch, embedded = false }: ThinkerWizardProps) {
  const [personas, setPersonas] = useState<ThinkerPersona[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load personas on mount
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    window.electronAPI.thinker.listPersonas()
      .then((result: { ok: boolean; packs?: ThinkerPersona[]; error?: string }) => {
        if (result.ok && result.packs) {
          setPersonas(result.packs);
        } else {
          setError(result.error || 'Failed to load personas');
        }
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen]);

  const handleLaunch = async () => {
    if (!selectedId) return;

    const persona = personas.find(p => p.id === selectedId);
    if (!persona) return;

    setLaunching(true);

    try {
      const result = await window.electronAPI.thinker.getPromptPaths(selectedId);
      if (result.ok && result.basePath && result.personaPath) {
        onLaunch(result.basePath, result.personaPath, persona.name);
        onClose();
      } else {
        setError(result.error || 'Failed to get prompt paths');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Launch failed');
    } finally {
      setLaunching(false);
    }
  };

  if (!isOpen) return null;

  const selectedPersona = personas.find(p => p.id === selectedId);

  // Content shared between embedded and modal modes
  const content = (
    <>
      {/* Content */}
      <div className={embedded ? "space-y-4" : "p-6 overflow-y-auto max-h-[calc(80vh-140px)]"}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Reload
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Select a thinker persona to launch a Claude debate session.
            </p>

            {/* Persona Grid */}
            <div className="grid grid-cols-2 gap-3">
              {personas.map((persona) => {
                const IconComponent = ICON_MAP[persona.icon] || Sparkles;
                const isSelected = selectedId === persona.id;

                return (
                  <button
                    key={persona.id}
                    onClick={() => setSelectedId(persona.id)}
                    className={`
                      p-3 rounded-lg border text-left transition-all duration-200
                      ${isSelected
                        ? 'border-primary bg-secondary/80 ring-1 ring-primary/30'
                        : 'border-border bg-secondary/50 hover:border-muted-foreground hover:bg-secondary'
                      }
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="p-2 rounded-lg"
                        style={{ backgroundColor: `${persona.color}20` }}
                      >
                        <span style={{ color: persona.color }}>
                          <IconComponent className="w-5 h-5" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground truncate text-sm">
                          {persona.name}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                          {persona.category} / {persona.style}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {persona.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer - only shown in embedded mode, modal has its own footer */}
      {embedded && (
        <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
          <div className="text-sm text-muted-foreground">
            {selectedPersona ? (
              <span>
                Selected: <span className="text-primary font-medium">{selectedPersona.name}</span>
              </span>
            ) : (
              'Select a persona'
            )}
          </div>
          <button
            onClick={handleLaunch}
            disabled={!selectedId || launching}
            className={`
              px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${selectedId && !launching
                ? 'bg-primary text-black hover:bg-yellow-300'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
              }
            `}
          >
            {launching ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Launching...
              </span>
            ) : (
              'Launch Thinker'
            )}
          </button>
        </div>
      )}
    </>
  );

  // Embedded mode: return content directly without modal wrapper
  if (embedded) {
    return content;
  }

  // Modal mode: wrap content in modal
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl w-[700px] max-h-[80vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Activate Thinker</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Reload
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-6">
                Select a thinker persona to launch a Claude debate session.
              </p>

              {/* Persona Grid */}
              <div className="grid grid-cols-2 gap-4">
                {personas.map((persona) => {
                  const IconComponent = ICON_MAP[persona.icon] || Sparkles;
                  const isSelected = selectedId === persona.id;

                  return (
                    <button
                      key={persona.id}
                      onClick={() => setSelectedId(persona.id)}
                      className={`
                        p-4 rounded-lg border text-left transition-all duration-200
                        ${isSelected
                          ? 'border-primary bg-secondary/80 ring-1 ring-primary/30'
                          : 'border-border bg-secondary/50 hover:border-muted-foreground hover:bg-secondary'
                        }
                      `}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: `${persona.color}20` }}
                        >
                          <span style={{ color: persona.color }}>
                            <IconComponent className="w-5 h-5" />
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-foreground truncate">
                            {persona.name}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                            {persona.category} / {persona.style}
                          </p>
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {persona.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-card/50">
          <div className="text-sm text-muted-foreground">
            {selectedPersona ? (
              <span>
                Selected: <span className="text-primary font-medium">{selectedPersona.name}</span>
              </span>
            ) : (
              'Select a persona to continue'
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleLaunch}
              disabled={!selectedId || launching}
              className={`
                px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200
                ${selectedId && !launching
                  ? 'bg-primary text-black hover:bg-yellow-300'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
                }
              `}
            >
              {launching ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Launching...
                </span>
              ) : (
                'Launch Thinker'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
