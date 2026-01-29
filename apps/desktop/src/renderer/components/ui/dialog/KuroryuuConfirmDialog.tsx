/**
 * KuroryuuConfirmDialog - Pre-configured Confirm/Alert/Destructive Dialog
 * Part of the Genmu Spirit Dialog System
 *
 * Simplified API for common dialog patterns:
 * - Confirm: Yes/No decisions
 * - Alert: Informational with OK button
 * - Destructive: Dangerous actions with red styling
 */

import { ReactNode, useState } from 'react';
import { KuroryuuDialog, DialogVariant } from './KuroryuuDialog';
import { useIsThemedStyle } from '../../../hooks/useTheme';

export type ConfirmDialogType = 'confirm' | 'alert' | 'destructive';

export interface KuroryuuConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string | ReactNode;
  type?: ConfirmDialogType;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

// Default labels by type
const DEFAULT_LABELS: Record<ConfirmDialogType, { confirm: string; cancel: string }> = {
  confirm: { confirm: 'Yes', cancel: 'No' },
  alert: { confirm: 'OK', cancel: '' },
  destructive: { confirm: 'Delete', cancel: 'Cancel' },
};

// Map dialog type to variant
const TYPE_TO_VARIANT: Record<ConfirmDialogType, DialogVariant> = {
  confirm: 'default',
  alert: 'default',
  destructive: 'destructive',
};

export function KuroryuuConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  type = 'confirm',
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  isLoading = false,
}: KuroryuuConfirmDialogProps) {
  const { isKuroryuu } = useIsThemedStyle();
  const [isPending, setIsPending] = useState(false);

  const defaults = DEFAULT_LABELS[type];
  const finalConfirmLabel = confirmLabel ?? defaults.confirm;
  const finalCancelLabel = cancelLabel ?? defaults.cancel;
  const showCancel = type !== 'alert' && finalCancelLabel;

  const handleConfirm = async () => {
    setIsPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error('[KuroryuuConfirmDialog] Confirm action failed:', error);
    } finally {
      setIsPending(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const loading = isLoading || isPending;

  // Button styles
  const getConfirmButtonStyle = () => {
    const base = {
      padding: '8px 20px',
      borderRadius: '6px',
      fontWeight: 600,
      fontSize: '14px',
      letterSpacing: '0.025em',
      transition: 'all 0.2s ease',
      cursor: loading ? 'not-allowed' : 'pointer',
      opacity: loading ? 0.7 : 1,
    };

    if (isKuroryuu) {
      if (type === 'destructive') {
        return {
          ...base,
          backgroundColor: '#8b1e1e',
          color: '#e8d5b5',
          border: '1px solid rgba(139, 30, 30, 0.8)',
        };
      }
      return {
        ...base,
        backgroundColor: '#c9a227',
        color: '#0a0a0c',
        border: '1px solid rgba(201, 162, 39, 0.8)',
      };
    }

    // Non-Kuroryuu theme
    if (type === 'destructive') {
      return {
        ...base,
        backgroundColor: 'var(--destructive)',
        color: 'var(--destructive-foreground)',
        border: '1px solid var(--destructive)',
      };
    }
    return {
      ...base,
      backgroundColor: 'var(--primary)',
      color: 'var(--primary-foreground)',
      border: '1px solid var(--primary)',
    };
  };

  const getCancelButtonStyle = () => {
    const base = {
      padding: '8px 20px',
      borderRadius: '6px',
      fontWeight: 500,
      fontSize: '14px',
      letterSpacing: '0.025em',
      transition: 'all 0.2s ease',
      cursor: 'pointer',
      backgroundColor: 'transparent',
    };

    if (isKuroryuu) {
      return {
        ...base,
        color: '#9a8a6a',
        border: '1px solid transparent',
      };
    }

    return {
      ...base,
      color: 'var(--muted-foreground)',
      border: '1px solid transparent',
    };
  };

  return (
    <KuroryuuDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      variant={TYPE_TO_VARIANT[type]}
      size="sm"
      showMist={type !== 'alert'}
      hideCloseButton={type === 'alert'}
      footer={
        <div className="flex items-center justify-end gap-3">
          {showCancel && (
            <button
              onClick={handleCancel}
              disabled={loading}
              style={getCancelButtonStyle()}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isKuroryuu
                  ? 'rgba(201, 162, 39, 0.1)'
                  : 'var(--secondary)';
                e.currentTarget.style.color = isKuroryuu ? '#c9a227' : 'var(--foreground)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isKuroryuu ? '#9a8a6a' : 'var(--muted-foreground)';
              }}
            >
              {finalCancelLabel}
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={getConfirmButtonStyle()}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                if (isKuroryuu) {
                  e.currentTarget.style.boxShadow =
                    type === 'destructive'
                      ? '0 4px 20px rgba(139, 30, 30, 0.4)'
                      : '0 4px 20px rgba(201, 162, 39, 0.4)';
                }
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processing...
              </span>
            ) : (
              finalConfirmLabel
            )}
          </button>
        </div>
      }
    >
      <div
        className="text-sm"
        style={{
          color: isKuroryuu ? '#c9b896' : 'var(--muted-foreground)',
          lineHeight: 1.6,
        }}
      >
        {typeof message === 'string' ? <p>{message}</p> : message}
      </div>
    </KuroryuuDialog>
  );
}

export default KuroryuuConfirmDialog;
