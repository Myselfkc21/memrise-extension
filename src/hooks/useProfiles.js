import { useState, useEffect, useCallback, useRef } from 'react';
import { storageGet, storageSet } from '../utils/storage';
import { fetchProfiles, createProfile } from '../utils/profiles';
import { useAuth } from './useAuth';

export function useProfiles() {
  const { isAuthenticated } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const activeProfileRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    activeProfileRef.current = activeProfile;
  }, [activeProfile]);

  useEffect(() => {
    loadActiveProfile();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadProfiles();
    } else {
      setProfiles([]);
      setActiveProfile(null);
    }
  }, [isAuthenticated]);

  const loadActiveProfile = async () => {
    try {
      const result = await storageGet(['activeProfile']);
      if (result.activeProfile) {
        setActiveProfile(result.activeProfile);
      }
    } catch (error) {
      console.error('Error loading active profile:', error);
    }
  };

  const loadProfiles = useCallback(async () => {
    if (!isAuthenticated) {
      setProfiles([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const fetchedProfiles = await fetchProfiles();
      setProfiles(fetchedProfiles);

      const currentActiveProfile = activeProfileRef.current;
      if (currentActiveProfile) {
        const profileExists = fetchedProfiles.find(
          (p) => p.id === currentActiveProfile
        );
        if (!profileExists) {
          setActiveProfile(null);
          await storageSet({ activeProfile: null });
        }
      }
    } catch (err) {
      console.error('Error loading profiles:', err);
      setError(err.message || 'Failed to load profiles');
      setProfiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  const addProfile = useCallback(
    async (name) => {
      if (!isAuthenticated) {
        throw new Error('You must be signed in to create a profile');
      }

      const existingProfile = profiles.find(
        (p) => p.name && p.name.toLowerCase() === name.trim().toLowerCase()
      );
      if (existingProfile) {
        throw new Error(`Profile "${name.trim()}" already exists`);
      }

      setIsLoading(true);
      setError(null);

      try {
        await createProfile(name);
        await loadProfiles();
      } catch (err) {
        setError(err.message || 'Failed to create profile');
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [isAuthenticated, profiles, loadProfiles]
  );

  const selectProfile = useCallback(
    async (profileId) => {
      setActiveProfile(profileId);
      await storageSet({ activeProfile: profileId });
    },
    []
  );

  return {
    profiles,
    activeProfile,
    isLoading,
    error,
    loadProfiles,
    addProfile,
    selectProfile,
  };
}
