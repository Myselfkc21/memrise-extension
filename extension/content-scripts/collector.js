// collector.js - content script to extract chat messages from supported sites

(function () {
  const SITE = location.hostname;
  let MATCH_HOST = SITE;
  if (SITE.includes("openai")) MATCH_HOST = "chat.openai.com";
  else if (SITE.includes("claude.ai")) MATCH_HOST = "claude.ai";
  else if (SITE.includes("chatgpt")) MATCH_HOST = "chatgpt.com";
  let lastHashes = [];
  const STORAGE_KEY = "context_collector_hashes_v1";

  // Selectors we consider to represent individual message elements
  const SELECTORS = [
    'div[data-testid="message"]',
    'div[role="listitem"]',
    ".message",
    ".chat-message",
    ".Message",
  ];

  function hashMessage(msg) {
    return `${msg.role}::${msg.text}`.slice(0, 2000);
  }

  function loadHashes() {
    try {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        if (res && Array.isArray(res[STORAGE_KEY]))
          lastHashes = res[STORAGE_KEY];
      });
    } catch (e) {
      lastHashes = [];
    }
  }

  // Debug: indicate the collector has initialized on the page
  try {
    console.log("[collector] initialized on", SITE, "mapped to", MATCH_HOST);
  } catch (e) {
    /* ignore */
  }

  function saveHashes() {
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: lastHashes.slice(-500) });
    } catch (e) {
      // ignore
    }
  }

  function detectRoleFromElement(el) {
    try {
      // Claude has image alt containing "Claude"
      const img = el.querySelector("img[alt]");
      if (img && /claude|assistant|ai|bot|chatgpt/i.test(img.alt))
        return "assistant";

      // Look for labels inside element
      const label = el.querySelector("h3, strong, span");
      if (label && /claude|assistant|chatgpt/i.test(label.textContent))
        return "assistant";

      // If element contains buttons like "Copy" or "Regenerate" it's likely an assistant message
      if (
        el.querySelector("button") &&
        /copy|regenerate|thumbs/i.test(el.textContent)
      )
        return "assistant";

      // If a nearby ancestor has an explicit data-author attribute, prefer that
      try {
        const authorAttr = el.closest && el.closest("[data-author]");
        if (authorAttr) {
          const val = authorAttr.getAttribute("data-author") || "";
          if (/assistant|bot|ai|claude|chatgpt/i.test(val)) return "assistant";
          if (/user|human|you/i.test(val)) return "user";
        }
      } catch (e) {
        // ignore
      }

      // Check for assistant-like UI affordances (copy buttons, regenerate, thumbs, share)
      try {
        const txt = (el.textContent || "").toLowerCase();
        if (
          /regenerate|retry|copy code|copy|share|thumbs up|thumbs down|regenerate response/.test(
            txt
          )
        ) {
          return "assistant";
        }
      } catch (e) {
        // ignore
      }

      // Some sites mark assistant/user messages with data attributes or classes
      try {
        const cls = (el.className || "").toString().toLowerCase();
        if (/assistant|from-assistant|from-bot/.test(cls)) return "assistant";
        if (/user|from-user|owner|you/.test(cls)) return "user";
      } catch (e) {
        // ignore
      }
    } catch (e) {
      // ignore
    }
    return null;
  }
  function extractCandidates() {
    const results = [];

    // Deep query selector that traverses into shadow roots and iframes.
    function deepQuerySelectorAll(root, selector) {
      const nodes = [];

      function walk(node) {
        try {
          if (node.nodeType === Node.ELEMENT_NODE) {
            try {
              const found = node.querySelectorAll(selector);
              for (const f of found) nodes.push(f);
            } catch (e) {
              // querySelectorAll can throw on some elements; ignore
            }
          }

          // Traverse shadow root if present
          if (node.shadowRoot) {
            walk(node.shadowRoot);
          }

          // Recurse into children
          const children = node.children || [];
          for (const c of children) {
            walk(c);
          }

          // If iframe, try to access its document (may throw if cross-origin)
          if (node.tagName === "IFRAME") {
            try {
              const doc = node.contentDocument;
              if (doc) walk(doc);
            } catch (e) {
              // cross-origin iframe; ignore
            }
          }
        } catch (e) {
          // ignore traversal errors
        }
      }

      walk(
        root instanceof Document || root instanceof ShadowRoot ? root : document
      );
      return nodes;
    }

    // Try multiple selectors in order of likelihood
    for (const sel of SELECTORS) {
      const nodes = deepQuerySelectorAll(document, sel).filter(Boolean);
      if (nodes.length > 0) {
        for (const n of nodes) {
          const text = n.innerText || n.textContent;
          if (text && text.trim().length > 0) {
            results.push({ el: n, text: text.trim() });
          }
        }
        if (results.length > 0) break;
      }
    }

    // If nothing found, try to extract by walking top-level children of main or shadow DOM
    if (results.length === 0) {
      const mains = deepQuerySelectorAll(document, "main");
      const main = mains.length > 0 ? mains[0] : document.body;
      // Walk top-level children and pick those that look like message items.
      const children = Array.from(main.children || []);
      for (const ch of children) {
        try {
          const text = ch.innerText || ch.textContent;
          if (!text || !text.trim()) continue;
          const trimmed = text.trim();
          // Ignore extremely large nodes that are likely the whole page; we'll handle splitting later
          results.push({ el: ch, text: trimmed });
        } catch (e) {
          // ignore
        }
      }
    }

    return results;
  }

  // Extract message-like candidates from a specific added node (used by MutationObserver)
  function extractMessagesFromNode(node) {
    const results = [];
    try {
      // First, try to find known message elements inside the node
      for (const sel of SELECTORS) {
        try {
          const found = deepQuerySelectorAll(node, sel).filter(Boolean);
          for (const n of found) {
            const text = n.innerText || n.textContent;
            if (text && text.trim()) results.push({ el: n, text: text.trim() });
          }
          if (results.length > 0) return results;
        } catch (e) {
          // ignore selector errors
        }
      }

      // If none found, but the node itself contains text, treat it as a candidate
      if (node && node.nodeType === Node.ELEMENT_NODE) {
        try {
          const t = node.innerText || node.textContent;
          if (t && t.trim()) results.push({ el: node, text: t.trim() });
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // ignore
    }
    return results;
  }

  function buildMessages() {
    const candidates = extractCandidates();
    const messages = [];
    let parityRole = "user"; // default starting role

    // Try to determine starting parity by site heuristics
    if (MATCH_HOST.includes("chat.openai.com")) {
      // The first messages often come from assistant (system) then user; hard to know — keep default
    }
    if (MATCH_HOST.includes("claude.ai")) {
      // Claude often shows assistant responses with avatar images — we'll detect per element
    }

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      // If the candidate text is very large or appears to contain multiple speaker
      // sections (e.g. starts with "You said:" or contains repeated speaker markers),
      // try to split it into separate messages.
      const MAX_SINGLE_MSG = 3000;
      if (
        c.text.length > MAX_SINGLE_MSG ||
        /You said:|You wrote:|Assistant:|User:|Human:/i.test(c.text)
      ) {
        const parts = splitAggregatedText(c.text);
        for (const p of parts) {
          let role = p.role || detectRoleFromElement(c.el) || parityRole;
          if (!p.role)
            parityRole = parityRole === "user" ? "assistant" : "user";
          messages.push({ role, text: p.text });
        }
      } else {
        let role = detectRoleFromElement(c.el);
        if (!role) {
          // fallback to alternating parity
          role = parityRole;
          parityRole = parityRole === "user" ? "assistant" : "user";
        }
        messages.push({ role, text: c.text });
      }
    }

    return messages;
  }

  // Split aggregated large text blobs into message-like parts using speaker markers
  function splitAggregatedText(text) {
    try {
      const parts = [];

      // Prefer splitting by explicit speaker markers (lookahead split)
      const markerSplit = text.split(
        /(?=You said:|You wrote:|Assistant:|User:|Human:|Claude:)/i
      );
      if (markerSplit.length > 1) {
        for (let seg of markerSplit) {
          seg = seg.trim();
          if (!seg) continue;
          // detect role from segment prefix
          let role = null;
          if (/^\s*(You said:|You wrote:|User:|Human:)/i.test(seg))
            role = "user";
          if (/^\s*(Assistant:|Claude:)/i.test(seg)) role = "assistant";
          // remove leading marker labels
          seg = seg.replace(
            /^\s*(You said:|You wrote:|Assistant:|User:|Human:|Claude:)\s*/i,
            ""
          );
          parts.push({ role, text: seg.trim() });
        }
        return parts;
      }

      // Fallback: split by double-newline or long single newlines into chunks
      const nlSplit = text
        .split(/\n{2,}/g)
        .map((s) => s.trim())
        .filter(Boolean);
      if (nlSplit.length > 1) {
        for (const seg of nlSplit) {
          parts.push({ role: null, text: seg });
        }
        return parts;
      }

      // Last resort: chunk the long text into ~2000-char pieces and alternate roles
      const CHUNK = 2000;
      if (text.length <= CHUNK) return [{ role: null, text: text.trim() }];
      for (let i = 0; i < text.length; i += CHUNK) {
        parts.push({ role: null, text: text.slice(i, i + CHUNK).trim() });
      }
      return parts;
    } catch (e) {
      return [{ role: null, text: text }];
    }
  }

  function sendNewMessages() {
    const msgs = buildMessages();
    const toSend = [];
    for (const m of msgs) {
      const h = hashMessage(m);
      if (!lastHashes.includes(h)) {
        lastHashes.push(h);
        toSend.push(m);
      }
    }

    if (toSend.length > 0) {
      saveHashes();
      try {
        console.log(
          "[collector] sending",
          toSend.length,
          "new messages to background",
          MATCH_HOST
        );
        chrome.runtime.sendMessage(
          {
            type: "SEND_CHAT_MESSAGES",
            messages: toSend,
            source: MATCH_HOST,
            conversation_id: location.pathname,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "[collector] sendMessage error",
                chrome.runtime.lastError
              );
            } else {
              console.log("[collector] sendMessage acknowledged", response);
            }
          }
        );
      } catch (e) {
        console.error("Failed to send messages to extension background", e);
      }
    }
  }

  function setupObserver() {
    const target = document.body;
    if (!target) return;

    const observer = new MutationObserver((mutations) => {
      const addedNodes = [];
      for (const mu of mutations) {
        if (mu.addedNodes && mu.addedNodes.length > 0) {
          for (const n of mu.addedNodes) addedNodes.push(n);
        }
      }
      if (addedNodes.length > 0) {
        // debounce
        if (window.__context_collector_timer)
          clearTimeout(window.__context_collector_timer);
        window.__context_collector_timer = setTimeout(() => {
          try {
            // Process added nodes individually and send only the new message-like pieces
            const toSend = [];
            for (const n of addedNodes) {
              const candidates = extractMessagesFromNode(n);
              for (const c of candidates) {
                // Split aggregated nodes if needed
                const MAX_SINGLE_MSG = 3000;
                if (
                  c.text.length > MAX_SINGLE_MSG ||
                  /You said:|You wrote:|Assistant:|User:|Human:/i.test(c.text)
                ) {
                  const parts = splitAggregatedText(c.text);
                  for (const p of parts) {
                    let role = p.role || detectRoleFromElement(c.el);
                    if (!role) {
                      // Infer by content: long texts or ones containing multiple lines are likely assistant
                      if (
                        /^\s*(chatgpt|assistant|claude)/i.test(p.text) ||
                        p.text.length > 200 ||
                        p.text.split("\n").length > 3
                      ) {
                        role = "assistant";
                      } else {
                        role = "user";
                      }
                    }
                    const msg = { role, text: p.text };
                    const h = hashMessage(msg);
                    if (!lastHashes.includes(h)) {
                      lastHashes.push(h);
                      toSend.push(msg);
                    }
                  }
                } else {
                  let role = detectRoleFromElement(c.el);
                  if (!role) {
                    if (
                      /^\s*(chatgpt|assistant|claude)/i.test(c.text) ||
                      c.text.length > 200 ||
                      c.text.split("\n").length > 3
                    ) {
                      role = "assistant";
                    } else {
                      role = "user";
                    }
                  }
                  const msg = { role, text: c.text };
                  const h = hashMessage(msg);
                  if (!lastHashes.includes(h)) {
                    lastHashes.push(h);
                    toSend.push(msg);
                  }
                }
              }
            }

            if (toSend.length > 0) {
              saveHashes();
              try {
                console.log(
                  "[collector] sending",
                  toSend.length,
                  "new messages to background (per-node)",
                  MATCH_HOST
                );
                chrome.runtime.sendMessage(
                  {
                    type: "SEND_CHAT_MESSAGES",
                    messages: toSend,
                    source: MATCH_HOST,
                    conversation_id: location.pathname,
                  },
                  (response) => {
                    if (chrome.runtime.lastError) {
                      console.error(
                        "[collector] sendMessage error",
                        chrome.runtime.lastError
                      );
                    } else {
                      console.log(
                        "[collector] sendMessage acknowledged",
                        response
                      );
                    }
                  }
                );
              } catch (e) {
                console.error(
                  "Failed to send messages to extension background",
                  e
                );
              }
            }
          } catch (e) {
            console.error(
              "Error processing added nodes in collector observer",
              e
            );
          }
        }, 200);
      }
    });

    observer.observe(target, { childList: true, subtree: true });
  }

  // Init
  loadHashes();
  // run once after a brief delay to allow page to render
  setTimeout(() => {
    try {
      sendNewMessages();
      setupObserver();
    } catch (e) {
      console.error("Collector init error", e);
    }
  }, 1400);
})();
