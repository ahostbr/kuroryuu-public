import { ToastContainer } from './toast';

/**
 * Toaster component - renders the toast container
 * Place this once in your root App component
 * Use the toast functions from toast.tsx to trigger toasts
 */
export function Toaster() {
  return <ToastContainer />;
}

// Export convenience hook and functions
export { useToastStore, toast } from './toast';
