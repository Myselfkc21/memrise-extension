// collector.js - content script to extract chat messages from supported sites

(function () {
  try {
    const SITE = location.hostname;
    let MATCH_HOST = SITE;
    if (SITE.includes("openai")) MATCH_HOST = "chat.openai.com";
    else if (SITE.includes("claude.ai")) MATCH_HOST = "claude.ai";
    else if (SITE.includes("chatgpt")) MATCH_HOST = "chatgpt.com";
    let lastHashes = [];
    const STORAGE_KEY = "context_collector_hashes_v1";
    const PENDING_KEY = "context_collector_pending_v1";
    let LAST_CHAT_CONTAINER = null;

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

    // Safe wrapper for chrome.runtime.sendMessage which handles cases where the
    // extension background/service-worker has been reloaded or invalidated.
    // Open a persistent port to the background to improve reliability with
    // MV3 service worker lifecycle. If the port is connected, prefer port.postMessage.
    let __collector_port = null;
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        typeof chrome.runtime.connect === "function"
      ) {
        try {
          __collector_port = chrome.runtime.connect({
            name: "contextkeeper-collector",
          });
          __collector_port.onDisconnect.addListener(() => {
            __collector_port = null;
          });
        } catch (e) {
          __collector_port = null;
        }
      }
    } catch (e) {
      // ignore
    }

    function safeSendMessage(message, cb) {
      try {
        if (
          typeof chrome === "undefined" ||
          !chrome.runtime ||
          typeof chrome.runtime.sendMessage !== "function"
        ) {
          console.warn(
            "[collector] chrome.runtime.sendMessage unavailable, skipping send",
          );
          if (typeof cb === "function") cb(null);
          return;
        }

        // Prefer the long-lived port if available
        if (
          __collector_port &&
          typeof __collector_port.postMessage === "function"
        ) {
          try {
            __collector_port.postMessage(message);
            if (typeof cb === "function") cb(null);
            return;
          } catch (e) {
            // fall through to sendMessage fallback
          }
        }

        chrome.runtime.sendMessage(message, (response) => {
          // Check for lastError first; when the extension context is invalidated
          // chrome.runtime.lastError may contain a useful message.
          if (chrome.runtime.lastError) {
            const err = chrome.runtime.lastError;
            // If extension context invalidated, persist the message to pending
            // storage so we can retry later when the background is available.
            if (/Extension context invalidated/i.test(String(err))) {
              // Silently save to pending queue without logging to avoid Extensions Errors UI
              try {
                // Save the message to pending queue
                chrome.storage.local.get([PENDING_KEY], (res) => {
                  const cur =
                    res && Array.isArray(res[PENDING_KEY])
                      ? res[PENDING_KEY]
                      : [];
                  cur.push(message);
                  try {
                    chrome.storage.local.set({ [PENDING_KEY]: cur });
                  } catch (e) {
                    // ignore storage set errors
                  }
                });
              } catch (e) {
                // ignore
              }
            }
            // Silently ignore all sendMessage errors (they will be retried)
            if (typeof cb === "function") cb(null);
            return;
          }
          if (typeof cb === "function") cb(response);
        });
      } catch (e) {
        // Silently handle any send errors; messages will be retried via flushPendingMessages
        // Do NOT log errors here as Chrome will surface them in Extensions Errors UI
        if (/Extension context invalidated/i.test(String(e))) {
          try {
            chrome.storage.local.get([PENDING_KEY], (res) => {
              const cur =
                res && Array.isArray(res[PENDING_KEY]) ? res[PENDING_KEY] : [];
              cur.push(message);
              try {
                chrome.storage.local.set({ [PENDING_KEY]: cur });
              } catch (e2) {
                // ignore storage set errors
              }
            });
          } catch (e3) {
            // ignore
          }
        }
        // Do NOT log unexpected errors - they will appear in Extensions Errors UI
        if (typeof cb === "function") cb(null);
      }
    }

    // Pending queue logic. When the extension background is temporarily
    // unavailable (reloaded), messages are saved and retried periodically.

    function flushPendingMessages() {
      try {
        if (
          typeof chrome === "undefined" ||
          !chrome.storage ||
          !chrome.runtime ||
          typeof chrome.runtime.sendMessage !== "function"
        ) {
          return;
        }
        chrome.storage.local.get([PENDING_KEY], (res) => {
          const pending =
            res && Array.isArray(res[PENDING_KEY]) ? res[PENDING_KEY] : [];
          if (!pending || pending.length === 0) return;

          // Attempt to send pending messages one-by-one. On success, remove them
          // from the queue; leave failures for future retries.
          const remaining = [];
          let idx = 0;

          function sendNext() {
            if (idx >= pending.length) {
              // write back remaining (if any)
              try {
                chrome.storage.local.set({ [PENDING_KEY]: remaining });
              } catch (e) {
                // ignore
              }
              return;
            }
            const msg = pending[idx++];
            try {
              // Prefer port if available
              if (
                __collector_port &&
                typeof __collector_port.postMessage === "function"
              ) {
                try {
                  __collector_port.postMessage(msg);
                  // assume success and continue
                  sendNext();
                  return;
                } catch (e) {
                  // fall back to sendMessage
                }
              }

              chrome.runtime.sendMessage(msg, (response) => {
                if (chrome.runtime.lastError) {
                  // failed to send this one; keep it for retry
                  remaining.push(msg);
                  // continue with next
                  sendNext();
                  return;
                }
                // sent successfully; continue
                sendNext();
              });
            } catch (e) {
              // on unexpected error, keep message
              remaining.push(msg);
              sendNext();
            }
          }

          sendNext();
        });
      } catch (e) {
        // ignore flush errors
      }
    }

    // Try flushing pending messages periodically (every 10s) and once on init
    try {
      setInterval(flushPendingMessages, 10 * 1000);
      // Run one immediate attempt shortly after init
      setTimeout(flushPendingMessages, 2000);
    } catch (e) {
      // ignore timer errors
    }

    // If the background announces readiness via the port, flush pending immediately.
    try {
      if (
        __collector_port &&
        typeof __collector_port.onMessage === "function"
      ) {
        __collector_port.onMessage.addListener((msg) => {
          try {
            if (msg && msg.type === "COLLECTOR_READY") {
              try {
                flushPendingMessages();
              } catch (e) {
                // ignore
              }
            }
          } catch (e) {
            // ignore
          }
        });
      }
    } catch (e) {
      // ignore
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
            if (/assistant|bot|ai|claude|chatgpt/i.test(val))
              return "assistant";
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
              txt,
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

    // Deep query selector that traverses into shadow roots and iframes.
    // Extracted to a top-level function so it can be shared by extractCandidates and extractMessagesFromNode.
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

      // Allow limiting traversal to a specific subtree when an Element is passed
      // (e.g. ChatGPT's main chat column) while preserving the previous behaviour
      // where passing document still searches the whole page.
      const startNode =
        root && (root instanceof Document || root instanceof ShadowRoot)
          ? root
          : root && root.nodeType === Node.ELEMENT_NODE
            ? root
            : document;

      walk(startNode);
      return nodes;
    }

    function extractCandidates() {
      const results = [];

      // Try multiple selectors in order of likelihood
      let allNodes = [];
      // For some sites (like chatgpt.com) we can narrow the root we search
      // under to avoid picking up sidebar/navigation chrome.
      let searchRoot = document;
      try {
        if (MATCH_HOST.includes("chatgpt.com")) {
          const mainEl = document.querySelector("main");
          if (mainEl) searchRoot = mainEl;
        }
      } catch (e) {
        // ignore root detection errors and fall back to full document
        searchRoot = document;
      }

      for (const sel of SELECTORS) {
        const nodes = deepQuerySelectorAll(searchRoot, sel).filter(Boolean);
        if (nodes.length > 0) {
          console.log(
            `[collector] selector "${sel}" found ${nodes.length} elements`,
          );
          allNodes = allNodes.concat(nodes);
        }
      }
      console.log(`[collector] total allNodes: ${allNodes.length}`);

      // If we found candidate nodes, pick the ancestor container that contains
      // the most of them (likely the chat viewport / message list). Then only
      // extract messages that live inside that container. This keeps us scoped to
      // the box you highlighted instead of sweeping the whole page.
      let chosenContainer = null;
      if (allNodes.length > 0) {
        const ancCount = new Map();
        for (const n of allNodes) {
          let cur = n;
          // climb a few levels to collect ancestors
          for (let depth = 0; cur && depth < 8; depth++) {
            cur = cur.parentElement;
            if (!cur) break;
            const key = cur;
            ancCount.set(key, (ancCount.get(key) || 0) + 1);
          }
        }

        // pick the ancestor with highest count (excluding document.body)
        let best = null;
        let bestCount = 0;
        for (const [el, cnt] of ancCount.entries()) {
          if (el === document.body) continue;
          if (cnt > bestCount) {
            best = el;
            bestCount = cnt;
          }
        }

        // Validate the chosen container is reasonably sized (avoid tiny wrappers)
        try {
          if (best) {
            const r = best.getBoundingClientRect();
            if (r && r.width > 200 && r.height > 80) chosenContainer = best;
          }
        } catch (e) {
          chosenContainer = best || null;
        }

        // Save for buildMessages role heuristics
        LAST_CHAT_CONTAINER = chosenContainer;

        for (const n of allNodes) {
          try {
            if (chosenContainer && !chosenContainer.contains(n)) continue;

            // Check if the element is actually visible in the viewport
            try {
              const rect = n.getBoundingClientRect();
              // Skip if element is outside the viewport (above or below visible area)
              if (rect.bottom < 0 || rect.top > window.innerHeight) {
                continue;
              }
            } catch (e) {
              // If we can't get the rect, try to extract anyway
            }

            // For ChatGPT's data-testid="message", extract only the text content
            // ignoring buttons, styles, scripts, and other UI elements
            let text = "";
            if (n.getAttribute("data-testid") === "message") {
              // Clone the element to avoid modifying the original
              const clone = n.cloneNode(true);

              // Remove all elements we don't want: buttons, icons, styles, scripts, etc.
              clone
                .querySelectorAll(
                  'button, svg, style, script, [role="button"], .markdown-alert, [class*="action"]',
                )
                .forEach((el) => el.remove());

              // Get the text content - use textContent instead of innerText to avoid rendering issues
              text = clone.textContent || "";

              // Normalize Unicode to NFD (decomposed form) then remove combining marks
              try {
                text = text.normalize("NFD")
                  .replace(/[\u0300-\u036F]/g, "") // combining diacritical marks
                  .replace(/[\u1AB0-\u1AFF]/g, "") // combining diacritical marks extended
                  .replace(/[\u1DC0-\u1DFF]/g, "") // combining diacritical marks supplement
                  .replace(/[\u20D0-\u20FF]/g, "") // combining diacritical marks for symbols
                  .replace(/[\uFE20-\uFE2F]/g, "") // combining half marks
                  .replace(/[\u0100-\u017F]/g, (ch) => ch.normalize("NFD").replace(/[\u0300-\u036F]/g, "")) // latin extended-A
                  .replace(/[\u0180-\u024F]/g, (ch) => ch.normalize("NFD").replace(/[\u0300-\u036F]/g, "")); // latin extended-B
              } catch (e) {
                // Fallback if normalize not available
                text = text.replace(/[^\x20-\x7E]/g, ""); // keep only ASCII printable characters
              }

              text = text
                .replace(/[\u0080-\u009F]/g, "") // control characters
                .replace(/\s+/g, " ") // collapse multiple spaces
                .trim();

              // Skip if result is too short (likely noise)
              if (text.length < 1) {
                continue;
              }

              // Skip if it looks like CSS, font data, or other embedded code
              if (
                /^[@\.]|{|}|url\(|font-|animation|keyframes|base64|data:/i.test(
                  text,
                )
              ) {
                continue;
              }
            } else {
              // For other selectors, use textContent
              text = n.textContent || "";
            }

            if (text && text.trim().length > 0) {
              results.push({ el: n, text: text.trim() });
            }
          } catch (e) {
            // ignore per-node errors
          }
        }
      }

      // If nothing found via the message selectors, do NOT fall back to sweeping
      // top-level page nodes. That fallback often captures unrelated UI chrome
      // (privacy banners, sidebars, headers) which we don't want to send. Return
      // the (possibly empty) results found by the selectors only.

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
              if (text && text.trim())
                results.push({ el: n, text: text.trim() });
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
      console.log(
        "[collector] buildMessages: found",
        candidates.length,
        "candidates",
      );
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
            let role = p.role || detectRoleFromElement(c.el);
            // If still unknown, try left/right position inside the detected chat container
            if (
              !role &&
              typeof LAST_CHAT_CONTAINER !== "undefined" &&
              LAST_CHAT_CONTAINER
            ) {
              try {
                const elRect =
                  c.el.getBoundingClientRect && c.el.getBoundingClientRect();
                const ctr =
                  LAST_CHAT_CONTAINER.getBoundingClientRect &&
                  LAST_CHAT_CONTAINER.getBoundingClientRect();
                if (elRect && ctr) {
                  const elCenter = elRect.left + elRect.width / 2;
                  const containerCenter = ctr.left + ctr.width / 2;
                  role = elCenter < containerCenter ? "assistant" : "user";
                }
              } catch (e) {
                // ignore
              }
            }
            if (!role) role = parityRole;
            if (!p.role)
              parityRole = parityRole === "user" ? "assistant" : "user";
            messages.push({ role, text: p.text });
          }
        } else {
          let role = detectRoleFromElement(c.el);
          if (
            !role &&
            typeof LAST_CHAT_CONTAINER !== "undefined" &&
            LAST_CHAT_CONTAINER
          ) {
            try {
              const elRect =
                c.el.getBoundingClientRect && c.el.getBoundingClientRect();
              const ctr =
                LAST_CHAT_CONTAINER.getBoundingClientRect &&
                LAST_CHAT_CONTAINER.getBoundingClientRect();
              if (elRect && ctr) {
                const elCenter = elRect.left + elRect.width / 2;
                const containerCenter = ctr.left + ctr.width / 2;
                role = elCenter < containerCenter ? "assistant" : "user";
              }
            } catch (e) {
              // ignore
            }
          }
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
          /(?=You said:|You wrote:|Assistant:|User:|Human:|Claude:)/i,
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
              "",
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
      console.log(
        "[collector] sendNewMessages: built",
        msgs.length,
        "messages, checking for duplicates",
      );
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
            MATCH_HOST,
          );
          safeSendMessage(
            {
              type: "SEND_CHAT_MESSAGES",
              messages: toSend,
              source: MATCH_HOST,
              conversation_id: location.pathname,
            },
            (response) => {
              // response handled/logged inside safeSendMessage; keep this callback
              // available for compatibility.
            },
          );
        } catch (e) {
          // suppress noisy errors about extension context invalidation; keep a warn for debugging
          console.warn(
            "[collector] failed to send messages to extension background (saved to pending if needed)",
          );
        }
      } else {
        console.log(
          "[collector] no new messages to send (all duplicates or no candidates)",
        );
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
                      if (
                        !role &&
                        typeof LAST_CHAT_CONTAINER !== "undefined" &&
                        LAST_CHAT_CONTAINER
                      ) {
                        try {
                          const elRect =
                            c.el.getBoundingClientRect &&
                            c.el.getBoundingClientRect();
                          const ctr =
                            LAST_CHAT_CONTAINER.getBoundingClientRect &&
                            LAST_CHAT_CONTAINER.getBoundingClientRect();
                          if (elRect && ctr) {
                            const elCenter = elRect.left + elRect.width / 2;
                            const containerCenter = ctr.left + ctr.width / 2;
                            role =
                              elCenter < containerCenter ? "assistant" : "user";
                          }
                        } catch (e) {
                          // ignore
                        }
                      }
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
                    if (
                      !role &&
                      typeof LAST_CHAT_CONTAINER !== "undefined" &&
                      LAST_CHAT_CONTAINER
                    ) {
                      try {
                        const elRect =
                          c.el.getBoundingClientRect &&
                          c.el.getBoundingClientRect();
                        const ctr =
                          LAST_CHAT_CONTAINER.getBoundingClientRect &&
                          LAST_CHAT_CONTAINER.getBoundingClientRect();
                        if (elRect && ctr) {
                          const elCenter = elRect.left + elRect.width / 2;
                          const containerCenter = ctr.left + ctr.width / 2;
                          role =
                            elCenter < containerCenter ? "assistant" : "user";
                        }
                      } catch (e) {
                        // ignore
                      }
                    }
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
                    MATCH_HOST,
                  );
                  safeSendMessage(
                    {
                      type: "SEND_CHAT_MESSAGES",
                      messages: toSend,
                      source: MATCH_HOST,
                      conversation_id: location.pathname,
                    },
                    (response) => {
                      // response handled/logged inside safeSendMessage
                    },
                  );
                } catch (e) {
                  console.warn(
                    "[collector] failed to send messages to extension background (observer path)",
                  );
                }
              }
            } catch (e) {
              console.warn(
                "[collector] error processing added nodes in collector observer",
              );
            }
          }, 200);
        }
      });

      observer.observe(target, { childList: true, subtree: true });
    }

    // === Lightweight in-page search helper (triggered by `&#`) ===
    // When the user types the special sequence `&#` while focused in a text
    // input / contenteditable on supported chat sites, we show a small floating
    // search bar. The query is sent to the backend /context/search API and the
    // top results are displayed in a floating box. Clicking one injects the
    // selected text into the chat input.

    let overlayState = {
      root: null,
      input: null,
      results: null,
      lastTriggerChar: null,
    };

    function isTextLikeElement(el) {
      if (!el) return false;
      try {
        // In sites like ChatGPT the activeElement is often a deep child inside
        // the real contenteditable container, so walk up a bit.
        let cur = el;
        for (let depth = 0; cur && depth < 6; depth++) {
          const tag = (cur.tagName || "").toUpperCase();
          if (tag === "TEXTAREA") return true;
          if (tag === "INPUT") {
            const type = (cur.type || "text").toLowerCase();
            if (
              type === "text" ||
              type === "search" ||
              type === "email" ||
              type === "url" ||
              type === "password"
            ) {
              return true;
            }
          }
          if (cur.isContentEditable) return true;
          cur = cur.parentElement;
        }
      } catch (e) {
        // ignore
      }
      return false;
    }

    function createSearchOverlayIfNeeded() {
      if (overlayState.root && document.body.contains(overlayState.root)) {
        return;
      }
      try {
        const root = document.createElement("div");
        root.style.position = "fixed";
        root.style.bottom = "16px";
        root.style.right = "16px";
        root.style.zIndex = "2147483647";
        root.style.background = "rgba(15,23,42,0.95)";
        root.style.color = "#e5e7eb";
        root.style.borderRadius = "8px";
        root.style.boxShadow = "0 10px 40px rgba(0,0,0,0.5)";
        root.style.padding = "8px 10px";
        root.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        root.style.width = "320px";
        root.style.maxWidth = "90vw";
        root.style.backdropFilter = "blur(10px)";

        const title = document.createElement("div");
        title.textContent = "Context search";
        title.style.fontSize = "12px";
        title.style.fontWeight = "600";
        title.style.marginBottom = "4px";
        title.style.display = "flex";
        title.style.justifyContent = "space-between";
        title.style.alignItems = "center";

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "×";
        closeBtn.style.border = "none";
        closeBtn.style.background = "transparent";
        closeBtn.style.color = "#9ca3af";
        closeBtn.style.cursor = "pointer";
        closeBtn.style.fontSize = "14px";
        closeBtn.style.padding = "0 4px";
        closeBtn.addEventListener("click", () => {
          try {
            if (overlayState.root && overlayState.root.parentNode) {
              overlayState.root.parentNode.removeChild(overlayState.root);
            }
            overlayState.root = null;
            overlayState.input = null;
            overlayState.results = null;
          } catch (e) {
            // ignore
          }
        });

        title.appendChild(closeBtn);

        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Search your context…";
        input.style.width = "100%";
        input.style.boxSizing = "border-box";
        input.style.borderRadius = "6px";
        input.style.border = "1px solid rgba(148,163,184,0.6)";
        input.style.padding = "6px 8px";
        input.style.fontSize = "13px";
        input.style.marginBottom = "6px";
        input.style.background = "rgba(15,23,42,0.9)";
        input.style.color = "#e5e7eb";
        input.autocomplete = "off";

        const results = document.createElement("div");
        results.style.maxHeight = "180px";
        results.style.overflowY = "auto";
        results.style.fontSize = "12px";
        results.style.lineHeight = "1.4";
        results.style.display = "none";

        root.appendChild(title);
        root.appendChild(input);
        root.appendChild(results);

        document.body.appendChild(root);

        overlayState.root = root;
        overlayState.input = input;
        overlayState.results = results;

        input.addEventListener("keydown", (ev) => {
          try {
            if (ev.key === "Escape") {
              ev.preventDefault();
              if (overlayState.root && overlayState.root.parentNode) {
                overlayState.root.parentNode.removeChild(overlayState.root);
              }
              overlayState.root = null;
              overlayState.input = null;
              overlayState.results = null;
              return;
            }
            if (ev.key === "Enter") {
              ev.preventDefault();
              const q = (overlayState.input.value || "").trim();
              if (!q) return;
              performContextSearch(q);
            }
          } catch (e) {
            // ignore
          }
        });
      } catch (e) {
        // ignore overlay creation errors
      }
    }

    function renderSearchResults(items) {
      try {
        if (!overlayState.results) return;
        const container = overlayState.results;
        container.innerHTML = "";
        if (!items || !items.length) {
          container.style.display = "block";
          const empty = document.createElement("div");
          empty.textContent = "No matches found.";
          empty.style.color = "#9ca3af";
          container.appendChild(empty);
          return;
        }
        container.style.display = "block";
        items.slice(0, 3).forEach((text) => {
          const item = document.createElement("div");
          item.textContent = text;
          item.style.padding = "6px 8px";
          item.style.borderRadius = "4px";
          item.style.cursor = "pointer";
          item.style.marginBottom = "4px";
          item.style.background = "rgba(15,23,42,0.9)";
          item.style.border = "1px solid rgba(148,163,184,0.3)";
          item.addEventListener("mouseenter", () => {
            item.style.background = "rgba(30,64,175,0.75)";
          });
          item.addEventListener("mouseleave", () => {
            item.style.background = "rgba(15,23,42,0.9)";
          });
          item.addEventListener("click", () => {
            try {
              injectTextIntoChatInput(text);
            } catch (e) {
              // ignore injection errors
            }
          });
          container.appendChild(item);
        });
      } catch (e) {
        // ignore render errors
      }
    }

    function performContextSearch(query) {
      try {
        if (!overlayState.results) return;
        overlayState.results.style.display = "block";
        overlayState.results.innerHTML = "";
        const loading = document.createElement("div");
        loading.textContent = "Searching…";
        loading.style.color = "#9ca3af";
        overlayState.results.appendChild(loading);

        // For search we *must* use chrome.runtime.sendMessage so we can receive
        // the response. The collector's long-lived port is fire-and-forget and
        // does not provide a direct response channel.
        sendMessageForResponse(
          {
            type: "CONTEXT_SEARCH",
            query,
          },
          (response) => {
            try {
              if (
                !response ||
                !response.success ||
                !Array.isArray(response.data)
              ) {
                renderSearchResults([]);
                return;
              }
              renderSearchResults(response.data);
            } catch (e) {
              renderSearchResults([]);
            }
          },
        );
      } catch (e) {
        // ignore send errors
      }
    }

    function sendMessageForResponse(message, cb) {
      try {
        if (
          typeof chrome === "undefined" ||
          !chrome.runtime ||
          typeof chrome.runtime.sendMessage !== "function"
        ) {
          if (typeof cb === "function") cb(null);
          return;
        }

        chrome.runtime.sendMessage(message, (response) => {
          try {
            if (chrome.runtime.lastError) {
              if (typeof cb === "function") cb(null);
              return;
            }
            if (typeof cb === "function") cb(response);
          } catch (e) {
            if (typeof cb === "function") cb(null);
          }
        });
      } catch (e) {
        if (typeof cb === "function") cb(null);
      }
    }

    function findChatInputElement() {
      try {
        const selectors = [
          'textarea[data-testid="chat-input"]',
          'textarea[placeholder*="Ask anything"]',
          'div[contenteditable="true"][data-testid="chat-input"]',
          'div[contenteditable="true"][data-placeholder*="Send a message"]',
          "textarea",
          'div[contenteditable="true"]',
        ];
        for (const sel of selectors) {
          try {
            const el = document.querySelector(sel);
            if (!el) continue;
            const rect =
              el.getBoundingClientRect && el.getBoundingClientRect();
            if (!rect || rect.width < 50 || rect.height < 20) continue;
            return el;
          } catch (e) {
            // ignore per-selector errors
          }
        }
      } catch (e) {
        // ignore
      }
      return null;
    }

    function injectTextIntoChatInput(text) {
      try {
        const el = findChatInputElement();
        if (!el) return;
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
          const target = el;
          const value = target.value || "";
          const start =
            typeof target.selectionStart === "number"
              ? target.selectionStart
              : value.length;
          const end =
            typeof target.selectionEnd === "number"
              ? target.selectionEnd
              : value.length;
          target.value = value.slice(0, start) + text + value.slice(end);
          const newPos = start + text.length;
          try {
            target.selectionStart = target.selectionEnd = newPos;
          } catch (e) {
            // ignore selection errors
          }
          try {
            target.dispatchEvent(
              new Event("input", { bubbles: true, cancelable: false }),
            );
          } catch (e) {
            // ignore
          }
          target.focus();
        } else if (el.isContentEditable) {
          const target = el;
          target.focus();
          try {
            const sel = window.getSelection();
            if (sel) {
              sel.removeAllRanges();
              const range = document.createRange();
              range.selectNodeContents(target);
              range.collapse(false);
              sel.addRange(range);
              const node = document.createTextNode(text);
              range.insertNode(node);
              range.setStartAfter(node);
              range.setEndAfter(node);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          } catch (e) {
            // ignore selection errors
          }
          try {
            const evt = new InputEvent("input", {
              bubbles: true,
              cancelable: false,
              data: text,
              inputType: "insertText",
            });
            target.dispatchEvent(evt);
          } catch (e) {
            // ignore
          }
        }
      } catch (e) {
        // ignore injection errors
      }
    }

    function installSearchTrigger() {
      try {
        window.addEventListener(
          "keydown",
          (ev) => {
            try {
              const active = document.activeElement;
              if (!isTextLikeElement(active)) {
                overlayState.lastTriggerChar = null;
                return;
              }

              if (ev.key === "&") {
                overlayState.lastTriggerChar = "&";
                return;
              }

              if (ev.key === "#" && overlayState.lastTriggerChar === "&") {
                overlayState.lastTriggerChar = null;
                // Optional: prevent the "#" from being inserted
                // and remove the '&' if desired. For now we keep it simple.
                createSearchOverlayIfNeeded();
                if (overlayState.input) {
                  overlayState.input.value = "";
                  overlayState.input.focus();
                }
                ev.preventDefault();
                ev.stopPropagation();
                return;
              }

              // Any other key resets the simple two-char trigger buffer
              overlayState.lastTriggerChar = null;
            } catch (e) {
              // ignore handler errors
            }
          },
          true,
        );
      } catch (e) {
        // ignore listener errors
      }
    }

    // Init
    loadHashes();
    // run once after a brief delay to allow page to render
    setTimeout(() => {
      try {
        sendNewMessages();
        setupObserver();
        installSearchTrigger();
      } catch (e) {
        // Silently ignore errors during collector init to avoid Extensions Errors UI
      }
    }, 1400);
  } catch (e) {
    // Silently catch any top-level errors to prevent Extensions Errors UI entries
  }
})();
