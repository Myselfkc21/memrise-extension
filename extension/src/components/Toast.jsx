import { useEffect, useState } from 'react';

/**
 * Toast notification component with retro styling
 */
export function Toast({ message, type = 'info', duration = 3000, onClose }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => {
          onClose?.();
        }, 300);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [message, duration, onClose]);

  if (!message) return null;

  const typeStyles = {
    success: 'bg-green-900/90 border-green-400 text-green-200',
    error: 'bg-red-900/90 border-red-400 text-red-200',
    info: 'bg-blue-900/90 border-blue-400 text-blue-200',
  };

  const glowColors = {
    success: '0 0 15px rgba(0,255,0,0.6)',
    error: '0 0 15px rgba(255,0,0,0.6)',
    info: '0 0 15px rgba(0,150,255,0.6)',
  };

  return (
    <div
      className={`px-4 py-3 rounded border-2 font-mono text-xs font-bold transition-all duration-300 ${
        typeStyles[type]
      } ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
      style={{
        boxShadow: glowColors[type],
        textShadow: '0 0 5px currentColor'
      }}
    >
      {message}
    </div>
  );
}

/**
 * Toast container component for managing multiple toasts
 */
export function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="fixed bottom-4 left-4 right-4 z-[1000] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );
}
