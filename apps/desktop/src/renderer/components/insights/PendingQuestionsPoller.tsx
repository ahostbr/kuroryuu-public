/**
 * PendingQuestionsPoller - Polls Gateway for pending k_askuserquestion questions
 *
 * This component runs independently of the tool call flow to ensure users can
 * answer questions as soon as they're created, without waiting for SSE events.
 *
 * It polls /interact/pending every 2 seconds and displays AskUserQuestionCard
 * for any unanswered questions.
 */

import { useState, useEffect, useCallback } from 'react';
import { AskUserQuestionCard } from './cards/AskUserQuestionCard';
import type { AskUserQuestionData } from '../../types/insights';
import { HelpCircle, RefreshCw } from 'lucide-react';

const GATEWAY_URL = 'http://localhost:8200';
const POLL_INTERVAL_MS = 2000;

interface PendingQuestion {
  question_id: string;
  questions: Array<{
    question: string;
    header: string;
    multiSelect?: boolean;
    options: Array<{ label: string; description?: string }>;
  }>;
  created_at: string;
}

export function PendingQuestionsPoller() {
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
  const [isPolling, setIsPolling] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null);

  const fetchPendingQuestions = useCallback(async () => {
    try {
      const response = await fetch(`${GATEWAY_URL}/interact/pending`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.ok && Array.isArray(data.pending)) {
        // Debug: log when questions change
        if (data.pending.length > 0) {
          console.log('[PendingQuestions] Found pending:', data.pending.length, data.pending.map((q: PendingQuestion) => q.question_id));
        }
        setPendingQuestions(data.pending);
        setError(null);
      }
      setLastPollTime(new Date());
    } catch (err) {
      console.warn('[PendingQuestions] Poll error:', err);
      setError(err instanceof Error ? err.message : 'Failed to poll');
    }
  }, []);

  // Poll for pending questions
  useEffect(() => {
    if (!isPolling) return;

    // Initial fetch
    fetchPendingQuestions();

    // Set up interval
    const intervalId = setInterval(fetchPendingQuestions, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isPolling, fetchPendingQuestions]);

  // Remove a question from the list when it's answered
  const handleQuestionAnswered = useCallback((questionId: string) => {
    setPendingQuestions(prev => prev.filter(q => q.question_id !== questionId));
  }, []);

  // Debug: log render
  console.log('[PendingQuestions] Render, count:', pendingQuestions.length);

  // Don't render anything if no pending questions
  if (pendingQuestions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <HelpCircle className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Pending User Input ({pendingQuestions.length})
        </span>
        <span className="flex-1" />
        <button
          onClick={fetchPendingQuestions}
          className="p-1 rounded hover:bg-secondary/50 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      {/* Pending question cards */}
      {pendingQuestions.map((pq) => {
        const cardData: AskUserQuestionData = {
          questionId: pq.question_id,
          questions: pq.questions.map(q => ({
            question: q.question,
            header: q.header,
            multiSelect: q.multiSelect || false,
            options: q.options,
          })),
          submitted: false,
        };

        return (
          <AskUserQuestionCard
            key={pq.question_id}
            data={cardData}
            onAnswered={() => handleQuestionAnswered(pq.question_id)}
          />
        );
      })}
    </div>
  );
}
