/**
 * ConversationList - Sidebar for managing chat conversations
 *
 * Shows list of past conversations with options to switch, rename, delete, and export.
 */

import { useState, memo } from 'react';
import { useLMStudioChatStore, type Conversation } from '../../stores/lmstudio-chat-store';
import {
  Plus,
  MessageSquare,
  Trash2,
  Download,
  Pencil,
  Check,
  X,
  ChevronLeft,
} from 'lucide-react';

// Single conversation item
const ConversationItem = memo(function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename,
  onExport,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onExport: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(conversation.name);

  const handleSave = () => {
    if (editName.trim()) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(conversation.name);
    setIsEditing(false);
  };

  const messageCount = conversation.messages.length;
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const lastMessagePreview = lastMessage?.content.slice(0, 50) || 'No messages';

  return (
    <div
      className={`group relative p-2 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? 'bg-primary/20 border border-primary/30'
          : 'hover:bg-muted/50 border border-transparent'
      }`}
      onClick={!isEditing ? onSelect : undefined}
    >
      {isEditing ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
            autoFocus
            className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSave();
            }}
            className="p-1 text-green-500 hover:bg-green-500/20 rounded"
          >
            <Check className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCancel();
            }}
            className="p-1 text-red-500 hover:bg-red-500/20 rounded"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <MessageSquare className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{conversation.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{lastMessagePreview}</div>
            </div>
          </div>

          {/* Action buttons - show on hover */}
          <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
              title="Rename"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExport();
              }}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
              title="Export as Markdown"
            >
              <Download className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>

          {/* Message count badge */}
          <div className="absolute bottom-1 right-1">
            <span className="text-[10px] text-muted-foreground/60">
              {messageCount} msg{messageCount !== 1 ? 's' : ''}
            </span>
          </div>
        </>
      )}
    </div>
  );
});

// Main ConversationList component
export function ConversationList() {
  const {
    conversations,
    currentConversationId,
    showConversationList,
    toggleConversationList,
    createNewConversation,
    switchConversation,
    deleteConversation,
    renameConversation,
    exportConversationAsMarkdown,
  } = useLMStudioChatStore();

  const handleExport = (convId: string) => {
    const markdown = exportConversationAsMarkdown(convId);

    // Create blob and download
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // NOTE: Visibility is controlled by the parent component (KuroryuuDesktopAssistantPanel)
  // which conditionally renders <ConversationList /> based on showSidebar (fullscreen) or
  // showConversationList (panel mode). We no longer check here to avoid the fullscreen bug.

  return (
    <div className="w-48 border-r border-border bg-card/30 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/50">
        <span className="text-xs font-medium">Conversations</span>
        <button
          onClick={toggleConversationList}
          className="p-1 text-muted-foreground hover:text-foreground rounded"
          title="Close"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* New conversation button */}
      <div className="p-2 border-b border-border">
        <button
          onClick={() => createNewConversation()}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-primary/20 hover:bg-primary/30 text-primary rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-4">
            No conversations yet
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === currentConversationId}
              onSelect={() => switchConversation(conv.id)}
              onDelete={() => deleteConversation(conv.id)}
              onRename={(name) => renameConversation(conv.id, name)}
              onExport={() => handleExport(conv.id)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground text-center">
        {conversations.length}/20 chats
      </div>
    </div>
  );
}

export default ConversationList;
