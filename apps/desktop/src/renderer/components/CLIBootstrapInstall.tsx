/**
 * CLIBootstrapInstall - 1-click install for CLI bootstrap files
 */
import { useState } from 'react';
import { CheckCircle2, Circle, Loader2, Download } from 'lucide-react';
import { Button } from './ui/button';

const CLI_LIST = [
  { id: 'kiro', name: 'Kiro', file: '.kiro/steering/KURORYUU_LAWS.md' },
  { id: 'claude', name: 'Claude', file: 'CLAUDE.md' },
  { id: 'copilot', name: 'GitHub Copilot', file: '.github/copilot-instructions.md' },
  { id: 'cline', name: 'Cline', file: '.Cline/Rules/.clinerules00-kuroryuu.md' },
  { id: 'codex', name: 'Codex', file: 'AGENTS.md' },
  { id: 'cursor', name: 'Cursor', file: '.cursorrules' },
  { id: 'windsurf', name: 'Windsurf', file: '.windsurfrules' },
] as const;

type CLIStatus = Record<string, 'pending' | 'installed' | 'error'>;

export function CLIBootstrapInstall() {
  const [status, setStatus] = useState<CLIStatus>({});
  const [installing, setInstalling] = useState(false);

  const handleInstallAll = async () => {
    setInstalling(true);
    for (const cli of CLI_LIST) {
      setStatus(s => ({ ...s, [cli.id]: 'pending' }));
      try {
        await window.electronAPI.bootstrap.install(cli.id);
        setStatus(s => ({ ...s, [cli.id]: 'installed' }));
      } catch {
        setStatus(s => ({ ...s, [cli.id]: 'error' }));
      }
    }
    setInstalling(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">CLI Bootstrap Files</h3>
        <Button size="sm" onClick={handleInstallAll} disabled={installing}>
          {installing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
          Install All
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {CLI_LIST.map(cli => (
          <div key={cli.id} className="flex items-center gap-2 p-2 rounded bg-card border border-border">
            {status[cli.id] === 'installed' ? (
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            ) : status[cli.id] === 'pending' ? (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            ) : (
              <Circle className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="text-sm text-foreground">{cli.name}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Installs redirect files that point CLIs to KURORYUU_BOOTSTRAP.md
      </p>
    </div>
  );
}
