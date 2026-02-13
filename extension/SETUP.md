# Setup Guide

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the extension:**
   ```bash
   npm run build
   ```

3. **Load in Chrome:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dist` folder

## Icons

The extension requires icon files for Chrome. Create the following PNG files in the `icons/` directory:

- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels  
- `icon128.png` - 128x128 pixels

You can use any image editor or online tool to create these. For now, placeholder icons are included, but you should replace them with proper branded icons for production.

## Development

### Making Changes

1. Edit files in `src/`
2. Run `npm run build` to rebuild
3. Reload the extension in Chrome (`chrome://extensions/` → click reload icon)

### File Structure

- `src/` - React source code
- `background.js` - Service worker (background script)
- `manifest.json` - Chrome extension manifest
- `dist/` - Built extension (load this in Chrome)

## Google Login Feature

The Google login feature is implemented and ready to use:

1. Click "Sign in with Google" in the popup
2. A new tab opens with the Google OAuth flow
3. After successful login, the background script automatically captures the auth token
4. The popup updates to show you're signed in
5. The auth tab closes automatically

### Backend Requirements

The extension expects a backend API running at `http://[::1]:4002` with:

- `GET /` - Health check endpoint
- `GET /auth/google` - Google OAuth initiation
- `GET /auth/google/callback` - OAuth callback (handled by background script)
- `POST /auth/refresh` - Token refresh endpoint

Update the API base URL in:
- `src/utils/api.js`
- `background.js`

## Troubleshooting

### Extension won't load
- Make sure you're loading the `dist` folder, not the root folder
- Check that `manifest.json` exists in `dist/`
- Check browser console for errors

### Google login not working
- Verify backend is running at `http://[::1]:4002`
- Check browser console for errors
- Verify `host_permissions` in `manifest.json` includes your backend URL

### Build errors
- Run `npm install` to ensure dependencies are installed
- Check Node.js version (requires 18+)
- Clear `node_modules` and reinstall if needed

