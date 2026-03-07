import { useState } from "react";
import { useProfiles } from "../hooks/useProfiles";
import { useAuth } from "../hooks/useAuth";
import { ProfileModal } from "./ProfileModal";

export function ProfileSection({ onProfileSelect, showToast }) {
  const { isAuthenticated } = useAuth();
  const {
    profiles,
    activeProfile,
    isLoading,
    error,
    loadProfiles,
    addProfile,
    selectProfile,
  } = useProfiles();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleAddProfile = () => {
    if (!isAuthenticated) {
      showToast?.("Please sign in to create a profile", "error");
      return;
    }
    setIsModalOpen(true);
  };

  const handleCreateProfile = async (name) => {
    setIsCreating(true);
    try {
      await addProfile(name);
      showToast?.(`Profile "${name}" created!`, "success");
    } catch (err) {
      showToast?.(err.message || "Failed to create profile", "error");
      throw err;
    } finally {
      setIsCreating(false);
    }
  };

  const handleProfileClick = async (profileId) => {
    try {
      await selectProfile(profileId);
      const profile = profiles.find((p) => p.id === profileId);
      showToast?.(
        `Switched to profile: ${profile?.name || profileId}`,
        "success"
      );
      onProfileSelect?.(profileId);
    } catch (error) {
      console.error("Error selecting profile:", error);
      showToast?.("Failed to switch profile", "error");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="border-2 border-pink-400 bg-black/60 backdrop-blur-sm p-4 rounded-lg shadow-[0_0_15px_rgba(255,0,255,0.3)]">
        <div
          className="text-xs font-bold text-pink-400 uppercase tracking-wider mb-2 font-mono"
          style={{
            textShadow: "0 0 5px #ff00ff",
          }}
        >
          Profiles
        </div>
        <div className="text-center py-4 text-sm text-gray-400 font-mono">
          Sign in to create and manage profiles
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="border-2 border-pink-400 bg-black/60 backdrop-blur-sm p-4 rounded-lg shadow-[0_0_15px_rgba(255,0,255,0.3)]">
        <div
          className="text-xs font-bold text-pink-400 uppercase tracking-wider mb-3 font-mono"
          style={{
            textShadow: "0 0 5px #ff00ff",
          }}
        >
          Profiles
        </div>

        {isLoading && profiles.length === 0 ? (
          <div className="text-center py-4 text-sm text-cyan-400 font-mono animate-pulse">
            Loading profiles...
          </div>
        ) : error ? (
          <div className="px-3 py-2 bg-red-900/50 border border-red-500 rounded text-xs text-red-200 font-mono">
            {error}
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-4 text-sm text-gray-400 font-mono">
            No profiles yet. Create one to get started.
          </div>
        ) : (
          <div className="space-y-2 mb-3 max-h-[200px] overflow-y-auto pr-1">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className={`px-3 py-2 rounded border-2 cursor-pointer transition-all duration-200 font-mono text-sm ${
                  profile.id === activeProfile
                    ? "bg-cyan-900/50 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(0,255,255,0.5)]"
                    : "bg-purple-900/30 border-pink-400/50 text-white hover:bg-purple-900/50 hover:border-pink-400 hover:shadow-[0_0_10px_rgba(255,0,255,0.3)]"
                }`}
                onClick={() => handleProfileClick(profile.id)}
                style={{
                  textShadow:
                    profile.id === activeProfile ? "0 0 5px #00ffff" : "none",
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">
                    {profile.name || `Profile ${profile.id}`}
                  </span>
                  {profile.id === activeProfile && (
                    <span
                      className="text-cyan-400 font-bold ml-2"
                      style={{
                        textShadow: "0 0 5px #00ffff",
                      }}
                    >
                      ✓
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs uppercase border-2 border-pink-400 rounded transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
          onClick={handleAddProfile}
          disabled={!isAuthenticated || isLoading}
          style={{
            boxShadow:
              "0 0 10px rgba(255,0,255,0.4), inset 0 0 10px rgba(128,0,128,0.3)",
          }}
        >
          + Add Profile
        </button>
      </div>

      <ProfileModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateProfile}
        isLoading={isCreating}
      />
    </>
  );
}
