import { useState, useEffect, useRef } from 'react';

export function ProfileModal({ isOpen, onClose, onSubmit, isLoading }) {
  const [profileName, setProfileName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setProfileName('');
      setError('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedName = profileName.trim();

    if (!trimmedName) {
      setError('Profile name cannot be empty');
      inputRef.current?.focus();
      return;
    }

    if (trimmedName.length > 50) {
      setError('Profile name must be less than 50 characters');
      inputRef.current?.focus();
      return;
    }

    try {
      await onSubmit(trimmedName);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create profile');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center"
      onClick={handleOverlayClick}
    >
      <div 
        className="bg-gradient-to-br from-purple-900 to-blue-900 border-4 border-cyan-400 rounded-lg p-6 w-[320px] max-w-[90%] shadow-[0_0_30px_rgba(0,255,255,0.6)]"
        onKeyDown={handleKeyDown}
        style={{
          boxShadow: '0 0 30px rgba(0,255,255,0.6), inset 0 0 20px rgba(255,0,255,0.2)'
        }}
      >
        <h3 className="text-lg font-bold text-cyan-400 mb-4 uppercase tracking-wider font-mono" style={{
          textShadow: '0 0 10px #00ffff'
        }}>
          Create New Profile
        </h3>
        
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={profileName}
            onChange={(e) => {
              setProfileName(e.target.value);
              setError('');
            }}
            placeholder="Enter profile name"
            maxLength={50}
            autoComplete="off"
            disabled={isLoading}
            className="w-full px-3 py-2 bg-black/60 border-2 border-cyan-400 rounded text-white placeholder-gray-400 font-mono text-sm focus:outline-none focus:border-pink-400 focus:shadow-[0_0_15px_rgba(255,0,255,0.5)] disabled:opacity-50 disabled:cursor-not-allowed mb-3"
            style={{
              boxShadow: 'inset 0 0 10px rgba(0,255,255,0.2)'
            }}
          />
          
          {error && (
            <div className="mb-3 px-3 py-2 bg-red-900/50 border border-red-500 rounded text-xs text-red-200 font-mono">
              ⚠️ {error}
            </div>
          )}
          
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs uppercase border-2 border-gray-500 rounded transition-all duration-200 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-400 hover:to-pink-400 text-white font-bold text-xs uppercase border-2 border-cyan-400 rounded transition-all duration-200 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !profileName.trim()}
              style={{
                boxShadow: '0 0 15px rgba(0,255,255,0.5), inset 0 0 10px rgba(255,0,255,0.3)'
              }}
            >
              {isLoading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
