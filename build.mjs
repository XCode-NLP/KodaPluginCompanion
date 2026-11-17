// Сборка плагина: main-часть в один CommonJS-файл для QuickJS, страница в bundle/ui.
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

await build({
  configFile: false,
  logLevel: "warn",
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
  plugins: [react()],
  build: {
    outDir: path.join(root, "bundle/ui"),
    emptyOutDir: true,
    // Без modulepreload: полифил вставляет inline-скрипт, а CSP страницы его не пустит.
    modulePreload: false,
  },
});
