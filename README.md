## ContextKeeper Chrome Extension

ContextKeeper is a Chrome extension that captures and searches conversational context from sites like ChatGPT and sends it to a backend service for long‑term storage and retrieval.  
It ships as a React + Vite popup UI plus a Manifest V3 background service worker and content script collector.

### Core capabilities

- **Context capture**
  - Content script (`content-scripts/collector.js`) observes supported chat sites and extracts individual messages.
  - Messages are normalized and sent to the background worker as `{ text, role, source, conversation_id }`.
  - The background worker forwards these to the backend API at `http://[::1]:4002/context/messages`.

- **Inline context search**
  - Typing the special sequence `&#` inside a supported chat input opens a floating search bar on the page.
  - User-entered search text is sent to `GET /context/search?text=...&profile_id=...`.
  - The top 3 results are displayed in a floating panel; clicking one injects the selected text back into the chat input.

- **Authentication and profiles**
  - Google OAuth flow handled via the backend; `background.js` extracts and persists tokens from the callback page.
  - The popup UI (`src/App.jsx`) allows sign‑in/out and profile selection/creation.
  - The active profile id is stored in `chrome.storage.local` and attached to outbound context messages and searches.

## Architecture overview

- **Popup UI (React + Vite)**
  - `src/App.jsx` – main popup surface.
  - `src/components/` – `AuthSection`, profile management components, status bar, toast system.
  - `src/hooks/` – `useAuth`, `useProfiles`, `useToast`, etc.
  - Communicates with the background worker via `chrome.runtime.sendMessage` for auth status.

- **Background service worker (`background.js`)**
  - Handles:
    - Google OAuth callback extraction and token normalization.
    - Receiving `SEND_CHAT_MESSAGES` from content scripts and POSTing to `/context/messages`.
    - Handling `CONTEXT_SEARCH` from the content script and proxying to `/context/search`.
    - Managing a long‑lived port for more reliable message delivery from the collector.
    - Debug context menu items for manual test POSTs and collector probes.

- **Content script collector (`content-scripts/collector.js`)**
  - Observes DOM mutations on supported hosts.
  - Extracts visible, in‑box chat messages only using heuristics and selectors.
  - Deduplicates messages via hashed history stored in `chrome.storage.local`.
  - Uses `chrome.runtime.connect` + `postMessage` and a retry queue for reliable delivery.
  - Implements the `&#` trigger search overlay and injection of chosen snippets into the site’s chat input.

- **Manifest**
  - `manifest.json` – MV3 manifest wiring:
    - `background.service_worker: background.js`
    - `content_scripts: [collector.js]` on supported chat domains.
    - Required permissions: `activeTab`, `storage`, `tabs`, `scripting`, `contextMenus`.

## Backend integration

- **API base URL**
  - Currently hard‑coded as:
    - `background.js`: `const API_BASE = "http://[::1]:4002";`
  - Endpoints used:
    - `POST /context/messages` – create context messages.
    - `GET /context/search` – search context messages (`text`, `profile_id` query params).
    - Auth‑related endpoints such as `/auth/google/callback` and `/auth/refresh` (via the popup bundle).

- **Expected search response**

  The search handler expects the backend to respond with:

  ```json
  {
    "success": 1,
    "message": "Data found successfully",
    "data": [
      {
        "role": "assistant",
        "content": "…",
        "refusal": null,
        "annotations": []
      }
    ]
  }
  ```

  The background worker normalizes this to an array of strings (preferring `content` or `text`) and returns it to the content script to display.

## Development workflow

### Prerequisites

- Node.js 18+ and npm
- Chrome (or any Chromium‑based browser)
- Backend service running at `http://[::1]:4002`

### Install dependencies

```bash
npm install
```

### Run popup in development mode

```bash
npm run dev
```

This starts Vite for the popup UI. For the extension itself you still need to load the built artifacts into Chrome.

### Build the extension

```bash
npm run build
```

or, to run the full extension build flow:

```bash
npm run build:extension
```

The output is placed in `dist/`.

### Load the extension in Chrome

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `dist` directory from this project.

After you make changes and rebuild, click **Reload** on the extension in `chrome://extensions/`.

## Project structure

```text
extension/
├─ manifest.json         # MV3 manifest
├─ background.js         # service worker: auth, API integration, messaging
├─ content-scripts/
│  └─ collector.js       # in‑page collector + floating search overlay
├─ src/
│  ├─ App.jsx            # popup root component
│  ├─ main.jsx           # React entry point
│  ├─ components/        # UI components (auth, profiles, status, toast)
│  ├─ hooks/             # custom hooks (auth, profiles, toast, etc.)
│  └─ utils/             # shared client utilities
├─ public/               # static assets
├─ package.json          # scripts and dependencies
└─ vite.config.js        # Vite configuration
```

## Troubleshooting

- **No requests hit the backend**
  - Ensure the backend is running on `http://[::1]:4002`.
  - Check the **background page console** (via `chrome://extensions` → “Service worker” link) for logs:
    - `POST to http://[::1]:4002/context/messages …`
    - `GET http://[::1]:4002/context/search?...`

- **Search overlay shows `[object Object]`**
  - The normalizer in `background.js` expects `data[i].content` or `data[i].text`. Verify the backend response matches this shape.

- **`&#` trigger does nothing**
  - Confirm the content script is loaded on the active tab (check `manifest.json` `matches`).
  - Check the console for `[collector]` logs to verify initialization.

- **Auth appears stuck**
  - Verify the backend auth routes and redirect URLs match `http://[::1]:4002`.
  - Clear `chrome.storage.local` keys `authToken` and `authTokenReceived` and retry sign‑in.

## Security and privacy

- Tokens are stored in `chrome.storage.local` under `authToken`.
- Context messages and search queries are sent to your backend; you are responsible for storage, access control, and retention policies on the server side.
- Do not log sensitive payloads in production builds of the backend.

## License

This codebase is currently private and intended for internal use. If you plan to open‑source or distribute it, add an explicit license here (for example, MIT or Apache‑2.0) and ensure backend data handling complies with your organization’s privacy guidelines.
