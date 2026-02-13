const API_BASE = "http://[::1]:4002";

export function createTimeoutSignal(ms) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function getAuthToken() {
  try {
    return new Promise((resolve) => {
      chrome.storage.local.get(["authToken"], (result) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.error("Error getting auth token:", err);
          resolve(null);
        } else {
          resolve(result.authToken?.accessToken || null);
        }
      });
    });
  } catch (error) {
    console.error("Error getting auth token:", error);
    return null;
  }
}

export async function refreshToken(authToken) {
  if (!authToken?.refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: authToken.refreshToken }),
    });

    const data = await response.json();
    if (data.success === 1 && data.data) {
      const updatedToken = {
        ...authToken,
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken || authToken.refreshToken,
      };
      await new Promise((resolve) => {
        chrome.storage.local.set({ authToken: updatedToken }, resolve);
      });
      return true;
    }
  } catch (error) {
    console.error("Token refresh failed:", error);
  }
  return false;
}

export async function apiCall(endpoint, options = {}) {
  const token = await getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const fetchOptions = {
      method: options.method || "GET",
      headers,
      signal: options.signal || createTimeoutSignal(30000),
    };

    if (options.body) {
      fetchOptions.body = options.body;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, fetchOptions);

    if (response.status === 401 && token) {
      const authData = await new Promise((resolve) => {
        chrome.storage.local.get(["authToken"], resolve);
      });
      const authToken = authData.authToken;

      if (authToken?.refreshToken) {
        const refreshed = await refreshToken(authToken);
        if (refreshed) {
          const newToken = await getAuthToken();
          headers.Authorization = `Bearer ${newToken}`;

          const retryOptions = {
            method: options.method || "GET",
            headers,
            signal: options.signal || createTimeoutSignal(30000),
          };

          if (options.body) {
            retryOptions.body = options.body;
          }

          return fetch(`${API_BASE}${endpoint}`, retryOptions);
        }
      }

      await new Promise((resolve) => {
        chrome.storage.local.remove(["authToken"], resolve);
      });
      throw new Error("Authentication expired. Please sign in again.");
    }

    return response;
  } catch (error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      throw new Error(
        "Request timeout. Please check your connection and try again."
      );
    }
    if (error.message?.includes("Failed to fetch")) {
      throw new Error(
        "Network error. Please check if the backend server is running."
      );
    }
    throw error;
  }
}

export async function checkConnection() {
  try {
    const response = await fetch(`${API_BASE}/`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: createTimeoutSignal(5000),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}
