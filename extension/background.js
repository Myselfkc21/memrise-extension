// background.js - Background service worker for ContextKeeper Extension

const API_BASE = "http://[::1]:4002";

// Listen for tab updates to detect auth callback
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only process when page is fully loaded
  if (changeInfo.status !== "complete" || !tab.url) {
    return;
  }

  // Check if this is the auth callback URL (support both localhost formats)
  if (
    tab.url.includes("/auth/google/callback") &&
    (tab.url.includes("localhost:4002") || tab.url.includes("[::1]:4002"))
  ) {
    // Wait for the page to fully load and render
    setTimeout(async () => {
      try {
        console.log("Attempting to extract token from auth callback page...");

        // Execute script to extract token from the page
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: extractAuthTokenFromPage,
        });

        console.log("Token extraction results:", results);

        if (results && results[0] && results[0].result) {
          const tokenData = results[0].result;
          console.log("Extracted token data:", tokenData);

          if (
            tokenData &&
            (tokenData.accessToken || tokenData.access_token || tokenData.token)
          ) {
            // Normalize token structure
            const normalizedToken = {
              accessToken:
                tokenData.accessToken ||
                tokenData.access_token ||
                (typeof tokenData.token === "string"
                  ? tokenData.token
                  : tokenData.token?.accessToken),
              refreshToken:
                tokenData.refreshToken ||
                tokenData.refresh_token ||
                tokenData.token?.refreshToken ||
                null,
              user: tokenData.user || null,
            };

            console.log("Normalized token:", normalizedToken);

            // Save token to storage
            await chrome.storage.local.set({
              authToken: normalizedToken,
              authTokenReceived: Date.now(),
            });

            console.log("Token saved to storage");

            // Notify popup if it's open
            chrome.runtime
              .sendMessage({
                type: "AUTH_SUCCESS",
                token: normalizedToken,
              })
              .catch(() => {
                // Popup might not be open, that's okay
              });

            // Close the auth tab after a short delay
            setTimeout(() => {
              chrome.tabs.remove(tabId).catch(() => {
                // Tab might already be closed
              });
            }, 2000);
          } else {
            console.warn(
              "Token data extracted but no access token found:",
              tokenData
            );
          }
        } else {
          console.warn("No token data extracted from page");
        }
      } catch (error) {
        console.error("Error extracting auth token:", error);
      }
    }, 2000); // Wait 2 seconds for page to fully render
  }

  // Also check for token in URL hash/query (alternative method)
  if (tab.url.includes("/auth/success")) {
    (async () => {
      try {
        const url = new URL(tab.url);
        const tokenParam = url.searchParams.get("token");
        const userParam = url.searchParams.get("user");

        if (tokenParam) {
          let tokenData;
          try {
            tokenData = JSON.parse(decodeURIComponent(tokenParam));
          } catch {
            // If not JSON, treat as string access token
            tokenData = { accessToken: tokenParam };
          }

          if (userParam) {
            try {
              tokenData.user = JSON.parse(decodeURIComponent(userParam));
            } catch {
              tokenData.user = { email: userParam };
            }
          }

          // Save token
          await chrome.storage.local.set({
            authToken: tokenData,
            authTokenReceived: Date.now(),
          });

          // Notify popup
          chrome.runtime
            .sendMessage({
              type: "AUTH_SUCCESS",
              token: tokenData,
            })
            .catch(() => {});

          // Close tab
          setTimeout(() => {
            chrome.tabs.remove(tabId).catch(() => {});
          }, 1500);
        }
      } catch (error) {
        console.error("Error processing auth success URL:", error);
      }
    })();
  }
});

// Function to extract token from the callback page
function extractAuthTokenFromPage() {
  try {
    // Method 1: Try to get from window.extensionAuthData (most reliable)
    if (typeof window !== "undefined" && window.extensionAuthData) {
      const payload = window.extensionAuthData;
      if (payload && payload.data && payload.data.token) {
        return {
          ...payload.data.token,
          user: payload.data.user,
        };
      }
    }

    // Method 2: Try to get from meta tag
    const metaTag = document.querySelector('meta[name="extension-auth-data"]');
    if (metaTag && metaTag.content) {
      try {
        const payload = JSON.parse(metaTag.content);
        if (payload && payload.data && payload.data.token) {
          return {
            ...payload.data.token,
            user: payload.data.user,
          };
        }
      } catch (e) {
        console.log("Could not parse from meta tag:", e);
      }
    }

    // Method 3: Try to get from script tag
    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
      if (script.textContent && script.textContent.includes("const payload")) {
        try {
          // Extract the payload object from the script
          const scriptContent = script.textContent;
          const payloadMatch = scriptContent.match(
            /const payload\s*=\s*({[\s\S]*?});/
          );
          if (payloadMatch) {
            // Replace escaped unicode and parse
            const payloadStr = payloadMatch[1].replace(/\\u003c/g, "<");
            const payload = JSON.parse(payloadStr);
            if (payload && payload.data && payload.data.token) {
              return {
                ...payload.data.token,
                user: payload.data.user,
              };
            }
          }
        } catch (e) {
          console.log("Could not parse payload from script:", e);
        }
      }
    }

    // Method 4: Fallback - Look for the payload in the pre element
    const preElement = document.getElementById("payload");
    if (preElement && preElement.textContent) {
      try {
        const payload = JSON.parse(preElement.textContent);
        if (payload && payload.data && payload.data.token) {
          return {
            ...payload.data.token,
            user: payload.data.user,
          };
        }
      } catch (e) {
        console.log("Could not parse payload from pre element:", e);
      }
    }

    return null;
  } catch (error) {
    console.error("Error in extractAuthTokenFromPage:", error);
    return null;
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CHECK_AUTH_STATUS") {
    chrome.storage.local.get(["authToken"]).then((result) => {
      sendResponse({
        hasAuth: !!result.authToken,
        token: result.authToken,
      });
    });
    return true; // Keep channel open for async response
  }
});

// Create debug context menu items and handlers
try {
  chrome.runtime.onInstalled.addListener(() => {
    try {
      chrome.contextMenus.create({
        id: "contextkeeper-send-test",
        title: "ContextKeeper: send test message",
        contexts: ["all"],
      });
      chrome.contextMenus.create({
        id: "contextkeeper-inject-test",
        title: "ContextKeeper: inject test runner",
        contexts: ["all"],
      });
      chrome.contextMenus.create({
        id: "contextkeeper-inject-main",
        title: "ContextKeeper: inject MAIN-world probe",
        contexts: ["all"],
      });
    } catch (e) {
      console.error("Failed to create context menu", e);
    }
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "contextkeeper-send-test") {
      try {
        console.log("[background] context menu clicked - sending test message");
        const testPayload = {
          text: "Test message from ContextKeeper debug context menu",
          role: "user",
          source: tab?.url ? new URL(tab.url).hostname : "debug",
          profile_id: null,
          conversation_id: tab?.url ? new URL(tab.url).pathname : null,
        };

        const stored = await new Promise((resolve) =>
          chrome.storage.local.get(["authToken", "activeProfile"], resolve)
        );
        const authToken = stored.authToken?.accessToken || null;
        const headers = { "Content-Type": "application/json" };
        if (authToken) headers.Authorization = `Bearer ${authToken}`;

        console.log(
          "[background] POST to",
          `${API_BASE}/context/messages`,
          "payload=",
          testPayload
        );
        const resp = await fetch(`${API_BASE}/context/messages`, {
          method: "POST",
          headers,
          body: JSON.stringify(testPayload),
        });
        console.log(
          "[background] Test POST response",
          resp.status,
          resp.ok ? "OK" : "NOT_OK"
        );
        try {
          const body = await resp.text();
          console.log("[background] Test POST response body", body);
        } catch (e) {
          // ignore body parsing errors
        }
      } catch (e) {
        console.error(
          "[background] Error sending test message from context menu",
          e
        );
      }
      return;
    }

    if (info.menuItemId === "contextkeeper-inject-test") {
      try {
        console.log(
          "[background] context menu clicked - injecting test runner into tab",
          tab?.id
        );
        if (!tab || !tab.id) {
          console.warn("[background] no active tab to inject into");
          return;
        }

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            try {
              console.log("[injected] test runner executing in page");
              try {
                chrome.runtime.sendMessage({
                  type: "INJECTED_TEST",
                  data: { ts: Date.now() },
                });
              } catch (e) {
                console.error(
                  "[injected] chrome.runtime.sendMessage failed",
                  e
                );
              }
            } catch (e) {
              console.error("[injected] test runner error", e);
            }
          },
        });
      } catch (e) {
        console.error("[background] Error injecting test runner", e);
      }
      return;
    }

    if (info.menuItemId === "contextkeeper-inject-main") {
      try {
        console.log(
          "[background] context menu clicked - injecting MAIN-world probe into tab",
          tab?.id
        );
        if (!tab || !tab.id) {
          console.warn("[background] no active tab to inject into");
          return;
        }

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          func: () => {
            try {
              const hostname = location.hostname || "unknown";
              console.log(
                `[collector-main] initialized on ${hostname} mapped to ${hostname}`
              );

              try {
                const sampleSelectors = [
                  '[data-testid="chat-message"]',
                  '[role="listitem"]',
                  ".message",
                  ".chat",
                ];
                let found = 0;
                for (const s of sampleSelectors) {
                  const n = document.querySelectorAll(s);
                  if (n && n.length) found += n.length;
                }
                console.log(
                  `[collector-main] probe found sample nodes: ${found}`
                );
              } catch (e) {
                console.log("[collector-main] probe query error", e);
              }
            } catch (err) {
              console.error("[collector-main] probe error", err);
            }
          },
        });
      } catch (e) {
        console.error("[background] Error injecting MAIN-world probe", e);
      }
      return;
    }
  });
} catch (e) {
  console.error("Context menu setup failed", e);
}

// Listen for messages from content scripts (chat messages) and injected scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message.type === "SEND_CHAT_MESSAGES" &&
    Array.isArray(message.messages)
  ) {
    // Process messages in background (async) with debug logs
    (async () => {
      let sendResponseCalled = false;
      try {
        console.log(
          "[background] received SEND_CHAT_MESSAGES from tabId=",
          sender?.tab?.id ?? "unknown",
          "count=",
          message.messages.length
        );

        const payloads = message.messages.map((m) => ({
          text: m.text?.slice(0, 50000) || "",
          role: m.role === "assistant" ? "assistant" : "user",
          source:
            message.source ||
            (sender?.tab?.url ? new URL(sender.tab.url).hostname : "unknown"),
          profile_id: message.profile_id ?? null,
          conversation_id: message.conversation_id ?? null,
        }));

        // Get auth token (if any) and active profile from storage
        const stored = await new Promise((resolve) =>
          chrome.storage.local.get(["authToken", "activeProfile"], resolve)
        );

        const authToken = stored.authToken?.accessToken || null;
        const activeProfile = stored.activeProfile ?? null;

        // If caller didn't provide profile_id, use activeProfile
        for (const p of payloads) {
          if (!p.profile_id && activeProfile) p.profile_id = activeProfile;
        }

        // Post each message to backend and log responses
        for (const p of payloads) {
          try {
            const headers = { "Content-Type": "application/json" };
            if (authToken) headers.Authorization = `Bearer ${authToken}`;

            console.log(
              "[background] POST to",
              `${API_BASE}/context/messages`,
              "payload=",
              p
            );
            const resp = await fetch(`${API_BASE}/context/messages`, {
              method: "POST",
              headers,
              body: JSON.stringify(p),
            });
            console.log(
              "[background] POST response",
              resp.status,
              resp.ok ? "OK" : "NOT_OK"
            );
          } catch (err) {
            console.error("Failed to POST context message:", err, p);
          }
        }
        // Acknowledge receipt to sender
        try {
          sendResponse({ success: true, sent: payloads.length });
          sendResponseCalled = true;
        } catch (e) {
          // ignore
        }
      } catch (e) {
        console.error("Error processing SEND_CHAT_MESSAGES:", e);
        try {
          if (!sendResponseCalled)
            sendResponse({ success: false, error: String(e) });
        } catch (e2) {
          // ignore
        }
      }
    })();
    // Keep the message channel open to help ensure async work completes
    return true;
  }

  if (message.type === "INJECTED_TEST") {
    console.log(
      "[background] received INJECTED_TEST from page",
      sender?.tab?.id,
      message.data
    );
    // Optionally, reply to the injected script
    try {
      sendResponse({ ok: true });
    } catch (e) {
      // ignore
    }
    return true;
  }
});
