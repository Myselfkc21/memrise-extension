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

Private - All rights reserved
