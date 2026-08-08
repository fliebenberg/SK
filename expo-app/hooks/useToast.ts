import { useToastStore } from '../store/toastStore';

export function useToast() {
  const toasts = useToastStore((state) => state.toasts);
  const showToast = useToastStore((state) => state.showToast);
  const showError = useToastStore((state) => state.showError);
  const showSuccess = useToastStore((state) => state.showSuccess);
  const showWarning = useToastStore((state) => state.showWarning);
  const showInfo = useToastStore((state) => state.showInfo);
  const dismissToast = useToastStore((state) => state.dismissToast);
  const clearAll = useToastStore((state) => state.clearAll);

  return {
    toasts,
    showToast,
    showError,
    showSuccess,
    showWarning,
    showInfo,
    dismissToast,
    clearAll,
  };
}
