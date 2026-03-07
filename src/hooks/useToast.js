import { useState, useCallback } from 'react';

let toastIdCounter = 0;

/**
 * Custom hook for managing toast notifications
 */
export function useToast() {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++toastIdCounter;
    const newToast = { id, message, type, duration };

    setToasts((prev) => [...prev, newToast]);

    // Auto-remove after duration
    setTimeout(() => {
      removeToast(id);
    }, duration + 300); // Add fade out time
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const success = useCallback(
    (message, duration) => showToast(message, 'success', duration),
    [showToast]
  );

  const error = useCallback(
    (message, duration) => showToast(message, 'error', duration),
    [showToast]
  );

  const info = useCallback(
    (message, duration) => showToast(message, 'info', duration),
    [showToast]
  );

  return {
    toasts,
    showToast,
    removeToast,
    success,
    error,
    info,
  };
}

