/**
 * Project Settings Dialog
 * OAuth connections, MCP server overrides, environment variables
 */

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import {
  X,
  Github,
  GitlabIcon,
  Link2,
  Link2Off,
  Server,
  Key,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Check,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import { useSettingsStore } from '../../stores/settings-store';
import type { OAuthProvider } from '../../types/settings';
import { ThemedFrame } from '../ui/ThemedFrame';
import { useIsThemedStyle } from '../../hooks/useTheme';

// ============================================================================
// OAuth Tab
// ============================================================================

function OAuthProviderCard({
  provider,
  connected,
  username,
  onConnect,
  onDisconnect,
  isConnecting,
}: {
  provider: OAuthProvider;
  connected: boolean;
  username?: string;
  onConnect: () => void;
  onDisconnect: () => void;
  isConnecting: boolean;
}) {
  const icons: Record<OAuthProvider, React.ElementType> = {
    github: Github,
    gitlab: GitlabIcon,
    bitbucket: Settings2,
  };
  const Icon = icons[provider];
  const labels: Record<OAuthProvider, string> = {
    github: 'GitHub',
    gitlab: 'GitLab',
    bitbucket: 'Bitbucket',
  };

  return (
    <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-secondary rounded-lg">
          <Icon className="w-5 h-5 text-foreground" />
        </div>
        <div>
          <h4 className="text-sm font-medium text-foreground">{labels[provider]}</h4>
          {connected && username && (
            <p className="text-xs text-muted-foreground">Connected as @{username}</p>
          )}
        </div>
      </div>
      {connected ? (
        <button
          onClick={onDisconnect}
          className="flex items-center gap-2 px-3 py-1.5 text-xs bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
        >
          <Link2Off className="w-3.5 h-3.5" />
          Disconnect
        </button>
      ) : (
        <button
          onClick={onConnect}
          disabled={isConnecting}
          className="flex items-center gap-2 px-3 py-1.5 text-xs bg-primary text-black rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50"
        >
          {isConnecting ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Link2 className="w-3.5 h-3.5" />
          )}
          Connect
        </button>
      )}
    </div>
  );
}

function OAuthTab() {
  const { projectSettings, connectOAuth, disconnectOAuth } = useSettingsStore();
  const [connecting, setConnecting] = useState<OAuthProvider | null>(null);

  const handleConnect = async (provider: OAuthProvider) => {
    setConnecting(provider);
    await connectOAuth(provider);
    setConnecting(null);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-4">
        Connect your version control accounts to enable repository features.
      </p>
      {projectSettings.oauth.map((config) => (
        <OAuthProviderCard
          key={config.provider}
          provider={config.provider}
          connected={config.connected}
          username={config.username}
          onConnect={() => handleConnect(config.provider)}
          onDisconnect={() => disconnectOAuth(config.provider)}
          isConnecting={connecting === config.provider}
        />
      ))}
    </div>
  );
}

// ============================================================================
// MCP Servers Tab
// ============================================================================

function MCPServersTab() {
  const { projectSettings, updateMCPServer, removeMCPServer, addMCPServer } = useSettingsStore();
  const [newServerName, setNewServerName] = useState('');

  const handleAddServer = () => {
    if (!newServerName.trim()) return;
    addMCPServer({
      name: newServerName.trim(),
      enabled: true,
      endpoint: 'http://localhost:8080',
    });
    setNewServerName('');
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure MCP server connections for enhanced AI capabilities.
      </p>

      {/* Server List */}
      <div className="space-y-2">
        {projectSettings.mcpServers.map((server) => (
          <div
            key={server.id}
            className="p-3 bg-card rounded-lg border border-border"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-foreground">{server.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateMCPServer(server.id, { enabled: !server.enabled })}
                  className={`px-2 py-0.5 text-xs rounded ${
                    server.enabled
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {server.enabled ? 'Enabled' : 'Disabled'}
                </button>
                <button
                  onClick={() => removeMCPServer(server.id)}
                  className="p-1 hover:bg-secondary rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
                </button>
              </div>
            </div>
            <input
              type="text"
              value={server.endpoint || ''}
              onChange={(e) => updateMCPServer(server.id, { endpoint: e.target.value })}
              placeholder="Endpoint URL"
              className="w-full px-2 py-1.5 bg-secondary border border-border rounded text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-muted"
            />
          </div>
        ))}
      </div>

      {/* Add Server */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newServerName}
          onChange={(e) => setNewServerName(e.target.value)}
          placeholder="New server name"
          className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border"
          onKeyDown={(e) => e.key === 'Enter' && handleAddServer()}
        />
        <button
          onClick={handleAddServer}
          className="flex items-center gap-2 px-3 py-2 bg-secondary hover:bg-muted rounded-lg transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Environment Variables Tab
// ============================================================================

function EnvVariablesTab() {
  const { projectSettings, updateEnvVariable, removeEnvVariable, addEnvVariable } = useSettingsStore();
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const handleAddVariable = () => {
    if (!newKey.trim()) return;
    addEnvVariable({
      key: newKey.trim().toUpperCase(),
      value: newValue,
      isSecret: newKey.toLowerCase().includes('key') || newKey.toLowerCase().includes('secret'),
    });
    setNewKey('');
    setNewValue('');
  };

  const toggleShowSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Manage environment variables for your project.
      </p>

      {/* Variable List */}
      <div className="space-y-2">
        {projectSettings.envVariables.map((variable) => (
          <div
            key={variable.key}
            className="flex items-center gap-2 p-2 bg-card rounded-lg border border-border"
          >
            <code className="w-40 text-xs text-primary font-mono truncate">
              {variable.key}
            </code>
            <div className="flex-1 flex items-center gap-2">
              <input
                type={variable.isSecret && !showSecrets[variable.key] ? 'password' : 'text'}
                value={variable.value}
                onChange={(e) => updateEnvVariable(variable.key, { value: e.target.value })}
                className="flex-1 px-2 py-1 bg-secondary border border-border rounded text-xs text-foreground font-mono focus:outline-none focus:border-muted"
              />
              {variable.isSecret && (
                <button
                  onClick={() => toggleShowSecret(variable.key)}
                  className="p-1 hover:bg-secondary rounded transition-colors"
                >
                  {showSecrets[variable.key] ? (
                    <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>
              )}
            </div>
            <button
              onClick={() => removeEnvVariable(variable.key)}
              className="p-1 hover:bg-secondary rounded transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
            </button>
          </div>
        ))}
      </div>

      {/* Add Variable */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="KEY_NAME"
          className="w-40 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-border"
        />
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="value"
          className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border"
          onKeyDown={(e) => e.key === 'Enter' && handleAddVariable()}
        />
        <button
          onClick={handleAddVariable}
          className="flex items-center gap-2 px-3 py-2 bg-secondary hover:bg-muted rounded-lg transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Dialog
// ============================================================================

export function ProjectSettingsDialog() {
  const { activeDialog, closeDialog, saveSettings } = useSettingsStore();
  const isOpen = activeDialog === 'project';
  const { isKuroryuu, isGrunge } = useIsThemedStyle();

  const handleSave = async () => {
    await saveSettings();
    closeDialog();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="lg"
            className="w-[600px] max-h-[85vh] overflow-hidden flex flex-col"
            contentClassName="flex-1 flex flex-col min-h-0"
          >
            {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              Project Settings
            </Dialog.Title>
            <Dialog.Close className="p-2 hover:bg-secondary rounded-lg transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </Dialog.Close>
          </div>

          {/* Tabs */}
          <Tabs.Root defaultValue="oauth" className="flex-1 flex flex-col overflow-hidden min-h-0">
            <Tabs.List className="flex border-b border-border px-4 flex-shrink-0">
              <Tabs.Trigger
                value="oauth"
                className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground border-b-2 border-transparent data-[state=active]:text-primary data-[state=active]:border-primary transition-colors"
              >
                <Github className="w-4 h-4" />
                OAuth
              </Tabs.Trigger>
              <Tabs.Trigger
                value="mcp"
                className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground border-b-2 border-transparent data-[state=active]:text-primary data-[state=active]:border-primary transition-colors"
              >
                <Server className="w-4 h-4" />
                MCP Servers
              </Tabs.Trigger>
              <Tabs.Trigger
                value="env"
                className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground border-b-2 border-transparent data-[state=active]:text-primary data-[state=active]:border-primary transition-colors"
              >
                <Key className="w-4 h-4" />
                Environment
              </Tabs.Trigger>
            </Tabs.List>

            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              <Tabs.Content value="oauth">
                <OAuthTab />
              </Tabs.Content>
              <Tabs.Content value="mcp">
                <MCPServersTab />
              </Tabs.Content>
              <Tabs.Content value="env">
                <EnvVariablesTab />
              </Tabs.Content>
            </div>
          </Tabs.Root>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border flex-shrink-0">
            <button
              onClick={closeDialog}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 transition-colors text-sm font-medium"
            >
              <Check className="w-4 h-4" />
              Save Changes
            </button>
          </div>
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
