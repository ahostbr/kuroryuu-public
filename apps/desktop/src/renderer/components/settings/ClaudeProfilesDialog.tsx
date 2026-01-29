/**
 * Claude Profiles Dialog
 * Manage multiple API key profiles with rate limit tracking
 */

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Key,
  Plus,
  Trash2,
  Star,
  StarOff,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
  Cloud,
} from 'lucide-react';
import { useSettingsStore } from '../../stores/settings-store';
import type { ClaudeProfile } from '../../types/settings';
import { ThemedFrame } from '../ui/ThemedFrame';
import { useIsThemedStyle } from '../../hooks/useTheme';

function RateLimitMeter({
  label,
  current,
  max,
  color,
}: {
  label: string;
  current: number;
  max: number;
  color: string;
}) {
  const percentage = Math.min((current / max) * 100, 100);
  const isWarning = percentage > 80;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-xs ${isWarning ? 'text-primary' : 'text-muted-foreground'}`}>
          {current.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isWarning ? 'bg-primary' : color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function ProfileCard({
  profile,
  onSetDefault,
  onDelete,
  onUpdate,
}: {
  profile: ClaudeProfile;
  onSetDefault: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<ClaudeProfile>) => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(profile.name);

  const handleSaveName = () => {
    if (editName.trim() && editName !== profile.name) {
      onUpdate({ name: editName.trim() });
    }
    setIsEditing(false);
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`p-4 rounded-lg border ${profile.isDefault ? 'bg-secondary/50 border-primary/50' : 'bg-card border-border'}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              autoFocus
              className="px-2 py-1 bg-secondary border border-border rounded text-sm text-foreground focus:outline-none focus:border-primary"
            />
          ) : (
            <h4
              className="text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors"
              onClick={() => setIsEditing(true)}
            >
              {profile.name}
            </h4>
          )}
          {profile.isDefault && (
            <span className="px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded">
              Default
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onSetDefault}
            className="p-1.5 hover:bg-muted rounded transition-colors"
            title={profile.isDefault ? 'Default profile' : 'Set as default'}
          >
            {profile.isDefault ? (
              <Star className="w-4 h-4 text-primary fill-[#D6D876]" />
            ) : (
              <StarOff className="w-4 h-4 text-muted-foreground hover:text-primary" />
            )}
          </button>
          <button
            onClick={onDelete}
            disabled={profile.isDefault}
            className="p-1.5 hover:bg-muted rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Delete profile"
          >
            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-red-400" />
          </button>
        </div>
      </div>

      {/* API Key */}
      <div className="flex items-center gap-2 mb-3 p-2 bg-secondary/50 rounded">
        <Key className="w-4 h-4 text-muted-foreground" />
        <code className="flex-1 text-xs text-muted-foreground font-mono">
          {showKey ? profile.apiKey : '••••••••••••••••••••••••••••••'}
        </code>
        <button
          onClick={() => setShowKey(!showKey)}
          className="p-1 hover:bg-muted rounded transition-colors"
        >
          {showKey ? (
            <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Provider */}
      <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
        <Cloud className="w-3.5 h-3.5" />
        <span className="capitalize">{profile.provider.replace('-', ' ')}</span>
        <span className="text-muted-foreground">•</span>
        <span>Last used: {formatDate(profile.lastUsed)}</span>
      </div>

      {/* Rate Limits */}
      {profile.rateLimit && (
        <div className="space-y-2 pt-3 border-t border-border">
          <RateLimitMeter
            label="Requests/min"
            current={profile.rateLimit.currentUsage.requests}
            max={profile.rateLimit.requestsPerMinute}
            color="bg-blue-400"
          />
          <RateLimitMeter
            label="Tokens/min"
            current={profile.rateLimit.currentUsage.tokens}
            max={profile.rateLimit.tokensPerMinute}
            color="bg-green-400"
          />
        </div>
      )}
    </div>
  );
}

function AddProfileForm({ onAdd, onCancel }: { onAdd: (profile: Omit<ClaudeProfile, 'id' | 'createdAt'>) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<ClaudeProfile['provider']>('anthropic');

  const handleSubmit = () => {
    if (!name.trim() || !apiKey.trim()) return;
    onAdd({
      name: name.trim(),
      apiKey: apiKey.trim(),
      provider,
      isDefault: false,
    });
  };

  return (
    <div className="p-4 bg-card rounded-lg border border-border">
      <h4 className="text-sm font-medium text-foreground mb-3">Add New Profile</h4>
      
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Profile Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Personal, Work, Team"
            className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-muted"
          />
        </div>
        
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-api03-..."
            className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-muted"
          />
        </div>
        
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as ClaudeProfile['provider'])}
            className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-muted"
          >
            <option value="anthropic">Anthropic (Direct)</option>
            <option value="aws-bedrock">AWS Bedrock</option>
            <option value="gcp-vertex">GCP Vertex AI</option>
          </select>
        </div>
        
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !apiKey.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add Profile
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClaudeProfilesDialog() {
  const {
    activeDialog,
    closeDialog,
    claudeProfiles,
    addClaudeProfile,
    updateClaudeProfile,
    removeClaudeProfile,
    setDefaultProfile,
    saveSettings,
  } = useSettingsStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const isOpen = activeDialog === 'claude-profiles';
  const { isKuroryuu, isGrunge } = useIsThemedStyle();

  const handleAddProfile = (profile: Omit<ClaudeProfile, 'id' | 'createdAt'>) => {
    addClaudeProfile(profile);
    setShowAddForm(false);
  };

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
            className="w-[550px] max-h-[85vh] overflow-hidden flex flex-col"
            contentClassName="flex-1 flex flex-col min-h-0"
          >
            {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <div>
              <Dialog.Title className="text-lg font-semibold text-foreground">
                Claude Profiles
              </Dialog.Title>
              <p className="text-sm text-muted-foreground">Manage API keys and rate limits</p>
            </div>
            <Dialog.Close className="p-2 hover:bg-secondary rounded-lg transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
            {/* Warning */}
            <div className="flex items-start gap-3 p-3 bg-primary/10 border border-primary/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-primary">API keys are stored locally</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Keys are encrypted and never sent to any external server.
                </p>
              </div>
            </div>

            {/* Profiles */}
            {claudeProfiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onSetDefault={() => setDefaultProfile(profile.id)}
                onDelete={() => removeClaudeProfile(profile.id)}
                onUpdate={(updates) => updateClaudeProfile(profile.id, updates)}
              />
            ))}

            {/* Add Form */}
            {showAddForm ? (
              <AddProfileForm
                onAdd={handleAddProfile}
                onCancel={() => setShowAddForm(false)}
              />
            ) : (
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full flex items-center justify-center gap-2 p-3 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add New Profile
              </button>
            )}
          </div>

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
