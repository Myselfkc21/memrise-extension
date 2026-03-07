import { AuthSection } from './components/AuthSection';
import { StatusBar } from './components/StatusBar';
import { ProfileSection } from './components/ProfileSection';
import { ToastContainer } from './components/Toast';
import { useToast } from './hooks/useToast';

function App() {
  const { toasts, removeToast, showToast } = useToast();

  return (
    <div className="min-h-[500px] w-[380px] bg-gradient-to-br from-purple-900 via-blue-900 to-purple-950 text-white relative overflow-hidden">
      {/* Retro Grid Background */}
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: `
          linear-gradient(cyan 1px, transparent 1px),
          linear-gradient(90deg, cyan 1px, transparent 1px)
        `,
        backgroundSize: '20px 20px'
      }}></div>
      
      {/* Animated Scanline Effect */}
      <div className="absolute inset-0 pointer-events-none z-50">
        <div className="h-full w-full bg-gradient-to-b from-transparent via-cyan-500/10 to-transparent animate-pulse"></div>
      </div>

      {/* Header */}
      <div className="relative z-10 border-b-2 border-cyan-400 bg-black/40 backdrop-blur-sm px-4 py-3 shadow-[0_0_20px_rgba(0,255,255,0.5)]">
        <h2 className="text-xl font-bold text-cyan-400 tracking-wider uppercase" style={{
          textShadow: '0 0 10px #00ffff, 0 0 20px #00ffff, 0 0 30px #00ffff'
        }}>
          🧠 ContextKeeper
        </h2>
        <p className="text-xs text-pink-400 mt-1 font-mono">AI Memory Management v1.0</p>
      </div>

      {/* Status Bar */}
      <StatusBar />

      {/* Content */}
      <div className="relative z-10 px-4 py-3 space-y-4 max-h-[400px] overflow-y-auto">
        <AuthSection />
        <ProfileSection showToast={showToast} />
      </div>

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default App;
