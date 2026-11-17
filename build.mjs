// Сборка плагина: main-часть в один CommonJS-файл для QuickJS, страница в bundle/ui.
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { build } from "vite";
import { writeNotices } from "./scripts/notices.mjs";

// Every module that ends up in either bundle; its packages get their licenses into the UI folder.
const bundled = new Set();
const collect = () => ({
  name: "collect-modules",
  generateBundle() {
    for (const id of this.getModuleIds()) bundled.add(id);
  },
});

const root = path.dirname(fileURLToPath(import.meta.url));

await build({
  configFile: false,
  logLevel: "warn",
  plugins: [collect()],
  build: {
    outDir: path.join(root, "bundle"),
    emptyOutDir: true,
    target: "es2020",
    minify: false,
    lib: {
      entry: path.join(root, "src/main/index.ts"),
      formats: ["cjs"],
      fileName: () => "main.js",
    },
  },
});

await build({
  configFile: false,
  logLevel: "warn",
  root: path.join(root, "src/ui"),
  base: "./",
  plugins: [react(), collect()],
  build: {
    outDir: path.join(root, "bundle/ui"),
    emptyOutDir: true,
    // Без modulepreload: полифил вставляет inline-скрипт, а CSP страницы его не пустит.
    modulePreload: false,
  },
});

writeNotices([...bundled], path.join(root, "bundle/ui/THIRD_PARTY_NOTICES.txt"));
