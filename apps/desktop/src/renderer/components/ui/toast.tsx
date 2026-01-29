import { create } from 'zustand';
import { useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: ToastAction;
}

interface ToastOptions {
  duration?: number;
  action?: ToastAction;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  addToast: (message, type = 'info', options = {}) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const duration = options.duration ?? 4000;
    set({ toasts: [...get().toasts, { id, message, type, duration, action: options.action }] });

    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }
  },
  removeToast: (id) => {
    set({ toasts: get().toasts.filter(t => t.id !== id) });
  }
}));

// Convenience functions (backward compatible: accepts number or options object)
export const toast = {
  success: (message: string, optionsOrDuration?: ToastOptions | number) => {
    const options = typeof optionsOrDuration === 'number' ? { duration: optionsOrDuration } : optionsOrDuration;
    useToastStore.getState().addToast(message, 'success', options);
  },
  error: (message: string, optionsOrDuration?: ToastOptions | number) => {
    const options = typeof optionsOrDuration === 'number' ? { duration: optionsOrDuration } : optionsOrDuration;
    useToastStore.getState().addToast(message, 'error', options);
  },
  warning: (message: string, optionsOrDuration?: ToastOptions | number) => {
    const options = typeof optionsOrDuration === 'number' ? { duration: optionsOrDuration } : optionsOrDuration;
    useToastStore.getState().addToast(message, 'warning', options);
  },
  info: (message: string, optionsOrDuration?: ToastOptions | number) => {
    const options = typeof optionsOrDuration === 'number' ? { duration: optionsOrDuration } : optionsOrDuration;
    useToastStore.getState().addToast(message, 'info', options);
  },
};

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap = {
  success: 'border-green-500/50 bg-green-500/10 text-green-400',
  error: 'border-red-500/50 bg-red-500/10 text-red-400',
  warning: 'border-primary/50 bg-primary/10 text-primary',
  info: 'border-blue-500/50 bg-blue-500/10 text-blue-400',
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const Icon = iconMap[toast.type];

  const handleActionClick = () => {
    toast.action?.onClick();
    onRemove();
  };

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm shadow-lg ${colorMap[toast.type]} animate-in slide-in-from-right`}>
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className="text-sm flex-1">{toast.message}</span>
      {toast.action && (
        <button
          onClick={handleActionClick}
          className="px-2 py-1 text-xs font-medium bg-white/10 hover:bg-white/20 rounded transition-colors"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onRemove}
        className="p-1 hover:bg-white/10 rounded transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
      ))}
    </div>
  );
}
