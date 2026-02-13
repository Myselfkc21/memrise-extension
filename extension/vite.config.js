import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  renameSync,
} from "fs";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Helper to copy directory recursively
function copyDir(src, dest) {
  if (!existsSync(src)) return;
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = resolve(src, entry.name);
    const destPath = resolve(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// Plugin to copy manifest and other static files after build
const copyManifestPlugin = () => {
  return {
    name: "copy-manifest",
    closeBundle() {
      const distPath = resolve(__dirname, "dist");
      const manifestPath = resolve(__dirname, "manifest.json");
      const backgroundPath = resolve(__dirname, "background.js");
      const iconsDir = resolve(__dirname, "icons");
      const indexHtmlPath = resolve(distPath, "index.html");
      const popupHtmlPath = resolve(distPath, "popup.html");

      // Rename index.html to popup.html
      if (existsSync(indexHtmlPath)) {
        renameSync(indexHtmlPath, popupHtmlPath);
      }

      // Copy manifest.json
      if (existsSync(manifestPath)) {
        copyFileSync(manifestPath, resolve(distPath, "manifest.json"));
      }

      // Copy background.js
      if (existsSync(backgroundPath)) {
        copyFileSync(backgroundPath, resolve(distPath, "background.js"));
      }

      // Copy icons directory if it exists
      if (existsSync(iconsDir)) {
        copyDir(iconsDir, resolve(distPath, "icons"));
      }
    },
  };
};

export default defineConfig({
  plugins: [react(), copyManifestPlugin(), tailwindcss()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "index.html"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "index.html") {
            return "popup.html";
          }
          return "assets/[name].[ext]";
        },
      },
    },
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
