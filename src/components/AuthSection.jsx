import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

export function AuthSection() {
  const {
    authToken,
    userInfo,
    isAuthenticated,
    signInWithGoogle,
    signOut,
    isConnected,
  } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState(null);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setError(null);

    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || "Failed to sign in");
      console.error("Sign in error:", err);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      setError("Failed to sign out");
      console.error("Sign out error:", err);
    }
  };

  const getUserDisplayName = () => {
    if (!userInfo) return "Signed in";
    return (
      userInfo.displayName || userInfo.name || userInfo.email || "Signed in"
    );
  };

  return (
    <div className="border-2 border-cyan-400 bg-black/60 backdrop-blur-sm p-4 rounded-lg shadow-[0_0_15px_rgba(0,255,255,0.3)]">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex-1 min-w-0">
          {isAuthenticated ? (
            <div className="space-y-1">
              <div
                className="text-sm font-bold text-cyan-300 font-mono truncate"
                style={{
                  textShadow: "0 0 5px #00ffff",
                }}
              >
                {getUserDisplayName()}
              </div>
              {userInfo?.email && (
                <div className="text-xs text-pink-300 font-mono truncate">
                  {userInfo.email}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-400 font-mono">Not signed in</div>
          )}
        </div>
        <div className="flex gap-2">
          {isAuthenticated ? (
            <button
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase border-2 border-red-400 rounded transition-all duration-200 hover:shadow-[0_0_15px_rgba(255,0,0,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSignOut}
              disabled={isSigningIn}
            >
              Sign Out
            </button>
          ) : (
            <button
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-400 hover:to-pink-400 text-white font-bold text-xs uppercase border-2 border-cyan-400 rounded transition-all duration-200 hover:shadow-[0_0_20px_rgba(0,255,255,0.6)] disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSignIn}
              disabled={isSigningIn || !isConnected}
              style={{
                boxShadow:
                  "0 0 10px rgba(0,255,255,0.5), inset 0 0 10px rgba(255,0,255,0.3)",
              }}
            >
              {isSigningIn ? "Signing in..." : "Sign in with Google"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2 px-3 py-2 bg-red-900/50 border border-red-500 rounded text-xs text-red-200 font-mono">
          ⚠️ {error}
        </div>
      )}

      {!isConnected && (
        <div className="mt-2 px-3 py-2 bg-yellow-900/50 border border-yellow-500 rounded text-xs text-yellow-200 font-mono">
          ⚠️ Backend not connected. Please ensure the server is running.
        </div>
      )}
    </div>
  );
}
