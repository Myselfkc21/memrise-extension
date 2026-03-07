import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export function StatusBar() {
  const { isConnected, checkBackendConnection } = useAuth();
  const [statusText, setStatusText] = useState('Checking...');

  useEffect(() => {
    updateStatus();
    const interval = setInterval(() => {
      checkBackendConnection();
      updateStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, [isConnected, checkBackendConnection]);

  const updateStatus = () => {
    setStatusText(isConnected ? 'Connected' : 'Disconnected');
  };

  return (
    <div className="relative z-10 px-4 py-2 bg-black/60 border-y-2 border-cyan-400 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-xs font-mono">
        <div
          className={`w-2 h-2 rounded-full ${
            isConnected
              ? 'bg-green-400 shadow-[0_0_10px_rgba(0,255,0,0.8)] animate-pulse'
              : 'bg-red-500 shadow-[0_0_10px_rgba(255,0,0,0.8)]'
          }`}
          style={{
            animation: isConnected ? 'pulse-neon 2s infinite' : 'none'
          }}
        ></div>
        <span className={`font-bold ${
          isConnected ? 'text-green-400' : 'text-red-400'
        }`} style={{
          textShadow: isConnected 
            ? '0 0 5px #00ff00' 
            : '0 0 5px #ff0000'
        }}>
          {statusText}
        </span>
      </div>
    </div>
  );
}
