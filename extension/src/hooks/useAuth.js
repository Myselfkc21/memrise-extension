import { useState, useEffect, useCallback } from 'react';
import { storageGet, storageSet, storageRemove } from '../utils/storage';
import { checkConnection } from '../utils/api';

const tabsCreate = (options) => {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.create(options, (tab) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(err);
        resolve(tab);
      });
    } catch (e) {
      reject(e);
    }
  });
};

export function useAuth() {
  const [authToken, setAuthToken] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    loadAuthState();
    checkBackendConnection();
  }, []);

  useEffect(() => {
    const messageListener = (message) => {
      if (message.type === 'AUTH_SUCCESS') {
        handleAuthSuccess(message.token);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    const checkInterval = setInterval(() => {
      checkForNewAuthToken();
    }, 2000);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      clearInterval(checkInterval);
    };
  }, []);

  const loadAuthState = async () => {
    try {
      const result = await storageGet(['authToken']);
      if (result.authToken) {
        setAuthToken(result.authToken);
        setUserInfo(result.authToken.user || null);
      }
    } catch (error) {
      console.error('Error loading auth state:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkForNewAuthToken = async () => {
    try {
      const result = await storageGet(['authToken', 'authTokenReceived']);
      if (result.authToken && result.authTokenReceived) {
        const tokenAge = Date.now() - result.authTokenReceived;
        if (
          tokenAge < 10000 &&
          (!authToken ||
            authToken.accessToken !== result.authToken.accessToken)
        ) {
          await handleAuthSuccess(result.authToken);
        }
      }
    } catch (error) {
      console.error('Error checking for new auth token:', error);
    }
  };

  const checkBackendConnection = async () => {
    const connected = await checkConnection();
    setIsConnected(connected);
  };

  const handleAuthSuccess = async (tokenData) => {
    try {
      const normalizedToken = {
        accessToken:
          tokenData.accessToken ||
          tokenData.access_token ||
          (typeof tokenData.token === 'string'
            ? tokenData.token
            : tokenData.token?.accessToken),
        refreshToken:
          tokenData.refreshToken ||
          tokenData.refresh_token ||
          tokenData.token?.refreshToken ||
          null,
        user: tokenData.user || null,
      };

      setAuthToken(normalizedToken);
      setUserInfo(normalizedToken.user || null);
      await storageSet({ authToken: normalizedToken });
    } catch (error) {
      console.error('Error processing auth success:', error);
    }
  };

  const signInWithGoogle = useCallback(async () => {
    try {
      const connected = await checkConnection();
      if (!connected) {
        throw new Error(
          'Cannot reach backend. Make sure the server is running.'
        );
      }

      await tabsCreate({ url: 'http://[::1]:4002/auth/google' });
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthToken(null);
    setUserInfo(null);
    await storageRemove(['authToken', 'currentUser']);
  }, []);

  const isAuthenticated = !!authToken?.accessToken;

  return {
    authToken,
    userInfo,
    isLoading,
    isConnected,
    isAuthenticated,
    signInWithGoogle,
    signOut,
    checkBackendConnection,
  };
}
