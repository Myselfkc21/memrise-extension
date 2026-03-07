#!/usr/bin/env node

/**
 * Simple script to generate placeholder icons for the extension
 * In production, replace these with actual designed icons
 */

const fs = require('fs');
const path = require('path');

// Create a simple SVG icon
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="20" fill="url(#grad)"/>
  <text x="64" y="80" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="white" text-anchor="middle">🧠</text>
</svg>`;

const iconsDir = path.join(__dirname, '..', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Note: This creates SVG files. For actual PNG icons, you'll need to:
// 1. Use a tool like ImageMagick or similar to convert SVG to PNG
// 2. Or use an online converter
// 3. Or design proper icons in a graphics editor

console.log('Placeholder icon SVG created at:', path.join(iconsDir, 'icon.svg'));
console.log('For production, create PNG files: icon16.png, icon48.png, icon128.png');
console.log('You can use an online SVG to PNG converter or graphics software.');

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), iconSvg);

