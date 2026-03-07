/**
 * Chrome Storage API wrapper utilities
 */

/**
 * Get data from Chrome storage
 * @param {string|string[]} keys - Single key or array of keys
 * @returns {Promise<any>}
 */
export function storageGet(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(err);
        resolve(result);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Set data in Chrome storage
 * @param {Object} obj - Object with key-value pairs to store
 * @returns {Promise<void>}
 */
export function storageSet(obj) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(obj, () => {
        const err = chrome.runtime.lastError;
        if (err) return reject(err);
        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Remove data from Chrome storage
 * @param {string|string[]} keys - Single key or array of keys to remove
 * @returns {Promise<void>}
 */
export function storageRemove(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.remove(keys, () => {
        const err = chrome.runtime.lastError;
        if (err) return reject(err);
        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

