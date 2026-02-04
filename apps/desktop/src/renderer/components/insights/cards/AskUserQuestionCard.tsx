/**
 * AskUserQuestionCard - Interactive user input card for k_askuserquestion results
 *
 * Mirrors Claude Code CLI's AskUserQuestion tool:
 * - 1-4 questions per card
 * - 2-4 options per question (radio or checkbox)
 * - "Other" option with text input always available
 * - Option descriptions for context
 * - Submit all answers at once
 */

import { useState, useCallback } from 'react';
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Send,
  Loader,
  CheckCircle,
} from 'lucide-react';
import type { AskUserQuestionData } from '../../../types/insights';

interface AskUserQuestionCardProps {
  data: AskUserQuestionData;
  collapsed?: boolean;
  onAnswered?: () => void;  // Callback when user submits answers
}

export function AskUserQuestionCard({
  data,
  collapsed: initialCollapsed = false,
  onAnswered,
}: AskUserQuestionCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(
    data.answers || {}
  );
  const [otherInputs, setOtherInputs] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(data.submitted || false);
  const [error, setError] = useState<string | null>(null);

  // Handle option selection (radio or checkbox)
  const handleSelect = useCallback(
    (questionIdx: number, optionLabel: string, isMulti: boolean) => {
      if (submitted) return;

      const key = `question_${questionIdx}`;
      if (isMulti) {
        // Checkbox: toggle in array
        const current = (answers[key] as string[]) || [];
        const newVal = current.includes(optionLabel)
          ? current.filter((v) => v !== optionLabel)
          : [...current, optionLabel];
        setAnswers({ ...answers, [key]: newVal });
        // Clear "Other" if selecting predefined options
        if (otherInputs[key]) {
          setOtherInputs({ ...otherInputs, [key]: '' });
        }
      } else {
        // Radio: single value
        setAnswers({ ...answers, [key]: optionLabel });
        // Clear "Other" if selecting predefined options
        if (otherInputs[key]) {
          setOtherInputs({ ...otherInputs, [key]: '' });
        }
      }
    },
    [answers, otherInputs, submitted]
  );

  // Handle "Other" text input
  const handleOtherInput = useCallback(
    (questionIdx: number, value: string) => {
      if (submitted) return;

      const key = `question_${questionIdx}`;
      setOtherInputs({ ...otherInputs, [key]: value });
      // Set as answer when typing (overrides radio/checkbox selection)
      if (value.trim()) {
        setAnswers({ ...answers, [key]: value });
      }
    },
    [answers, otherInputs, submitted]
  );

  // Check if "Other" is selected for a question
  const isOtherSelected = useCallback(
    (questionIdx: number) => {
      const key = `question_${questionIdx}`;
      const otherValue = otherInputs[key];
      return otherValue && otherValue.trim().length > 0;
    },
    [otherInputs]
  );

  // Submit all answers
  const handleSubmit = useCallback(async () => {
    if (submitted || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `http://localhost:8200/interact/respond/${data.questionId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      setSubmitted(true);
      // Notify parent (e.g., PendingQuestionsPoller) that this question was answered
      onAnswered?.();
    } catch (err) {
      console.error('[AskUserQuestion] Submit error:', err);
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  }, [answers, data.questionId, submitted, isSubmitting]);

  // Check if all questions have answers
  const allAnswered = data.questions.every((_, idx) => {
    const answer = answers[`question_${idx}`];
    if (!answer) return false;
    if (Array.isArray(answer)) return answer.length > 0;
    return answer.length > 0;
  });

  const questionCount = data.questions.length;

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        {submitted ? (
          <CheckCircle className="w-4 h-4 text-green-400" />
        ) : (
          <HelpCircle className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium text-foreground">
          {submitted ? 'Answered' : 'User Input Required'}
        </span>
        <span className="text-xs text-muted-foreground">
          ({questionCount} question{questionCount > 1 ? 's' : ''})
        </span>
        <span className="flex-1" />
        <span className="text-muted-foreground">
          {isCollapsed ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </span>
      </button>

      {/* Body */}
      {!isCollapsed && (
        <div className="p-3 space-y-4">
          {/* Render each question */}
          {data.questions.map((q, qIdx) => {
            const key = `question_${qIdx}`;
            const currentAnswer = answers[key];
            const otherValue = otherInputs[key] || '';

            return (
              <div key={qIdx} className="space-y-2">
                {/* Header chip */}
                <span className="inline-block px-2 py-0.5 rounded bg-muted text-muted-foreground text-[10px] uppercase tracking-wide">
                  {q.header}
                </span>

                {/* Question text */}
                <div className="text-sm text-foreground">{q.question}</div>

                {/* Options: Radio or Checkbox */}
                <div className="space-y-1">
                  {q.options.map((opt, oIdx) => {
                    const isSelected = q.multiSelect
                      ? ((currentAnswer as string[]) || []).includes(opt.label)
                      : currentAnswer === opt.label;

                    return (
                      <label
                        key={oIdx}
                        className={`flex items-start gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-primary/50 bg-primary/10'
                            : 'border-border/50 hover:bg-muted/30'
                        } ${submitted ? 'cursor-default opacity-70' : ''}`}
                      >
                        <input
                          type={q.multiSelect ? 'checkbox' : 'radio'}
                          name={key}
                          checked={isSelected && !isOtherSelected(qIdx)}
                          onChange={() =>
                            handleSelect(qIdx, opt.label, q.multiSelect)
                          }
                          disabled={submitted}
                          className="mt-0.5 w-4 h-4 accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-foreground">
                            {opt.label}
                          </div>
                          {opt.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {opt.description}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}

                  {/* "Other" option with text input */}
                  <label
                    className={`flex items-start gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                      isOtherSelected(qIdx)
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border/50 hover:bg-muted/30'
                    } ${submitted ? 'cursor-default opacity-70' : ''}`}
                  >
                    <input
                      type={q.multiSelect ? 'checkbox' : 'radio'}
                      name={key}
                      checked={isOtherSelected(qIdx)}
                      onChange={() => {}}
                      disabled={submitted}
                      className="mt-0.5 w-4 h-4 accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground mb-1">Other</div>
                      <input
                        type="text"
                        placeholder="Type your answer..."
                        value={otherValue}
                        onChange={(e) => handleOtherInput(qIdx, e.target.value)}
                        disabled={submitted}
                        className="w-full px-2 py-1 text-sm bg-background border border-border/50 rounded focus:outline-none focus:border-primary/50 disabled:opacity-50"
                      />
                    </div>
                  </label>
                </div>
              </div>
            );
          })}

          {/* Error message */}
          {error && (
            <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Submit button or success state */}
          {!submitted ? (
            <button
              onClick={handleSubmit}
              disabled={!allAnswered || isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium text-primary-foreground"
            >
              {isSubmitting ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit Answer{questionCount > 1 ? 's' : ''}
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-green-400">
              <CheckCircle className="w-4 h-4" />
              Answers submitted
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground/50 pt-2 border-t border-border/30">
            <span className="flex items-center gap-1">
              {data.questionId}
            </span>
            {submitted && (
              <span className="flex items-center gap-1 text-green-400/70">
                <CheckCircle className="w-3 h-3" />
                Complete
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
