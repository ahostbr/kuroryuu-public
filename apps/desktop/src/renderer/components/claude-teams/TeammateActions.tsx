/**
 * TeammateActions - Action buttons for interacting with a selected teammate.
 * Send messages, request shutdown, and view plan mode status.
 */
import { useState, useCallback } from 'react';
import { Send, Power, Eye } from 'lucide-react';
import { useClaudeTeamsStore } from '../../stores/claude-teams-store';

interface TeammateActionsProps {
  teamName: string;
  memberName: string;
  isLead: boolean;
  planModeRequired?: boolean;
}

export function TeammateActions({ teamName, memberName, isLead, planModeRequired }: TeammateActionsProps) {
  const messageTeammate = useClaudeTeamsStore((s) => s.messageTeammate);
  const shutdownTeammate = useClaudeTeamsStore((s) => s.shutdownTeammate);

  // Message form state
  const [showMessageForm, setShowMessageForm] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [messageResult, setMessageResult] = useState<'success' | 'error' | null>(null);

  // Shutdown state
  const [showShutdownConfirm, setShowShutdownConfirm] = useState(false);
  const [shutdownSending, setShutdownSending] = useState(false);
  const [shutdownResult, setShutdownResult] = useState<'success' | 'error' | null>(null);

  const clearFeedback = useCallback((setter: (v: 'success' | 'error' | null) => void) => {
    setTimeout(() => setter(null), 3000);
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!messageText.trim()) return;
    setMessageSending(true);
    setMessageResult(null);
    const ok = await messageTeammate({
      teamName,
      recipient: memberName,
      content: messageText.trim(),
      summary: messageText.trim().slice(0, 60),
    });
    setMessageSending(false);
    setMessageResult(ok ? 'success' : 'error');
    if (ok) {
      setMessageText('');
      setShowMessageForm(false);
    }
    clearFeedback(setMessageResult);
  }, [messageText, teamName, memberName, messageTeammate, clearFeedback]);

  const handleShutdown = useCallback(async () => {
    setShutdownSending(true);
    setShutdownResult(null);
    const ok = await shutdownTeammate({
      teamName,
      recipient: memberName,
      content: 'Shutdown requested from Kuroryuu Desktop',
    });
    setShutdownSending(false);
    setShutdownResult(ok ? 'success' : 'error');
    setShowShutdownConfirm(false);
    clearFeedback(setShutdownResult);
  }, [teamName, memberName, shutdownTeammate, clearFeedback]);

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Actions</div>

      {/* Send Message */}
      {!showMessageForm ? (
        <button
          onClick={() => setShowMessageForm(true)}
          disabled={isLead}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded
            bg-gray-800 border border-gray-700 text-gray-300
            hover:bg-gray-700 hover:border-gray-600 hover:text-white
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-800
            transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          Send Message
        </button>
      ) : (
        <div className="rounded border border-gray-700 bg-gray-800/50 p-2 space-y-2">
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Type a message..."
            rows={3}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5
              text-xs text-gray-200 placeholder-gray-600
              focus:border-cyan-600 focus:outline-none resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handleSendMessage();
              }
            }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSendMessage}
              disabled={messageSending || !messageText.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded
                bg-cyan-700 text-white hover:bg-cyan-600
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-colors"
            >
              <Send className="w-3 h-3" />
              {messageSending ? 'Sending...' : 'Send'}
            </button>
            <button
              onClick={() => { setShowMessageForm(false); setMessageText(''); }}
              className="px-3 py-1.5 text-xs rounded text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {messageResult && (
        <div className={`text-[11px] px-2 py-1 rounded ${
          messageResult === 'success'
            ? 'text-green-400 bg-green-900/30'
            : 'text-red-400 bg-red-900/30'
        }`}>
          {messageResult === 'success' ? 'Message sent' : 'Failed to send message'}
        </div>
      )}

      {/* Request Shutdown */}
      {!showShutdownConfirm ? (
        <button
          onClick={() => setShowShutdownConfirm(true)}
          disabled={isLead || shutdownSending}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded
            bg-gray-800 border border-gray-700 text-gray-300
            hover:bg-red-900/40 hover:border-red-700 hover:text-red-300
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-800
            transition-colors"
        >
          <Power className="w-3.5 h-3.5" />
          Request Shutdown
        </button>
      ) : (
        <div className="rounded border border-red-800/50 bg-red-900/20 p-2 space-y-2">
          <p className="text-xs text-red-300">
            Are you sure you want to request shutdown for <span className="font-bold">{memberName}</span>?
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShutdown}
              disabled={shutdownSending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded
                bg-red-700 text-white hover:bg-red-600
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-colors"
            >
              <Power className="w-3 h-3" />
              {shutdownSending ? 'Sending...' : 'Confirm'}
            </button>
            <button
              onClick={() => setShowShutdownConfirm(false)}
              className="px-3 py-1.5 text-xs rounded text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {shutdownResult && (
        <div className={`text-[11px] px-2 py-1 rounded ${
          shutdownResult === 'success'
            ? 'text-green-400 bg-green-900/30'
            : 'text-red-400 bg-red-900/30'
        }`}>
          {shutdownResult === 'success' ? 'Shutdown requested' : 'Failed to request shutdown'}
        </div>
      )}

      {/* View Plan */}
      {planModeRequired && (
        <button
          disabled
          className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded
            bg-gray-800 border border-gray-700 text-gray-500
            cursor-not-allowed transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          Plan mode not active
        </button>
      )}

      {isLead && (
        <p className="text-[10px] text-gray-600 italic">
          Cannot send messages or shutdown the team lead.
        </p>
      )}
    </div>
  );
}
