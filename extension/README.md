# ContextKeeper Chrome Extension

A production-ready Chrome extension built with React for AI memory management.

## Features

- 🔐 Google OAuth authentication
- 🧠 AI memory management
- 📊 Profile management
- ⚡ Real-time backend connection status

## Development

### Prerequisites

- Node.js 18+ and npm
- Chrome browser

### Setup

1. Install dependencies:

```bash
npm install
```

2. Build the extension:

```bash
npm run build
```

3. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dist` folder from this project

### Development Mode

For development with hot reload:

```bash
npm run dev
```

Note: You'll need to rebuild and reload the extension after making changes.

## Project Structure

```
extension/
├── src/
│   ├── components/      # React components
│   ├── hooks/           # Custom React hooks
│   ├── utils/           # Utility functions
│   ├── App.jsx          # Main app component
│   └── main.jsx         # Entry point
├── background.js         # Service worker (background script)
├── manifest.json        # Chrome extension manifest
├── vite.config.js       # Vite build configuration
└── package.json         # Dependencies and scripts
```

## Building for Production

```bash
npm run build:extension
```

The built extension will be in the `dist` folder, ready to be loaded in Chrome or packaged for distribution.

## Configuration

The extension connects to a backend API. Update the API base URL in:

- `src/utils/api.js` - API client configuration
- `background.js` - Background script API calls

Default API base: `http://[::1]:4002`

## License

## 🎒 ContextKeeper — Chrome extension

ContextKeeper is a small-but-mighty Chrome extension built with React + Vite that helps you attach, manage, and recall contextual memories using an AI-backed backend. Think of it as sticky notes for your browsing context — only smarter. 🧠✨

Whether you're a student saving interesting examples, a developer collecting reproducible bugs, or a curious reader capturing short-term memory for later review, ContextKeeper stores and surfaces relevant snippets when you need them.

### Why it exists

- Browsers forget. People forget. ContextKeeper bridges that gap by pairing lightweight client-side UI with an AI-powered memory service so your important context stays attached to the things you discover online.

## 🚀 Key features

- 🔐 Google OAuth sign-in
- 🧠 AI memory management (store, search, and recall contexts)
- 🎭 Multiple profiles for separation of concerns (work, study, personal)
- ⚡ Background service worker + content-collector for passive capture
- 🔔 Toasts, status bar and a small profile modal for quick interactions

## 🎯 Use cases

- Save code snippets and relevant tabs while researching a bug.
- Collect interesting quotes and auto-summarize them for later review.
- Keep task-related context attached to specific websites.

## 🧩 Quick start (developer)

Prerequisites:

- Node.js 18+ and npm
- Chrome (Chromium-based browser also works)

Install dependencies:

```bash
npm install
```

Run in dev mode (hot reload for the UI):

```bash
npm run dev
```

Build the extension for production (outputs to `dist/`):

```bash
npm run build
```

Load the unpacked extension in Chrome:

1. Open chrome://extensions/
2. Enable Developer mode (top-right)
3. Click "Load unpacked" and select the `dist/` folder

Pro tip: during development you can keep the DevTools open for the extension UI and reload the unpacked extension when the build updates.

## 🛠 Project layout

Top-level files you’ll care about:

```
extension/
├─ background.js           # service worker / background script (handles auth, API calls)
├─ manifest.json           # Chrome extension manifest
├─ src/
│  ├─ App.jsx              # main React UI
│  ├─ main.jsx             # React entry + mounting
│  ├─ components/          # UI building blocks (AuthSection, ProfileModal, etc.)
│  ├─ hooks/               # small reusable hooks (useAuth, useProfiles, useToast)
│  └─ utils/               # api client, storage helpers, profile logic
├─ public/                 # static assets
└─ package.json            # scripts and dependencies
```

## ⚙️ Configuration

- Default API base URL is configured in `src/utils/api.js`. If you run a local backend, point the client there.
- Background script (`background.js`) also contains calls that rely on the same backend.

If your backend runs on a custom host/port, update the base URL (or use environment configs in future PRs).

## 🧪 Tests & validation

This repository includes a tiny client UI and background logic. There are no automated tests bundled by default — adding unit tests for hooks and integration tests for the background script is a highly recommended follow-up.

## 🧭 Troubleshooting

- If the extension fails to authenticate: confirm OAuth credentials and redirect URIs in the backend and Google Cloud Console.
- If API calls fail: open `background.js` console in the Extensions page and check the network endpoints.
- If hot reload seems stale: stop dev server, clear `dist/`, then `npm run dev` again.

## 🤝 Contributing

Contributions are welcome! Small, focused PRs are easiest to review. Good first contributions:

- Add unit tests for a hook in `src/hooks/`
- Improve error handling in `src/utils/api.js`
- Add a basic end-to-end smoke test that runs the build and verifies `dist/` contains the manifest

Please include a short description of the change and a screenshot if the UI is affected.

## 🧾 License & privacy

This repository is currently private. The extension integrates with a backend that may store user content; treat user data carefully and follow your organization's privacy policy.

---

If you'd like, I can also:

- Add a short CONTRIBUTING.md and ISSUE_TEMPLATE.md
- Wire up a simple test runner (Jest + React Testing Library) with a couple of initial tests
- Add a short demo GIF for the README

Want me to add any of those? Pick one and I’ll implement it next.
