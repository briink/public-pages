import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { crx } from "@crxjs/vite-plugin";
import { copyFileSync, mkdirSync, existsSync } from "fs";
import manifest from "./manifest.json";

// Plugin to copy content.css to dist
const copyContentCss = () => ({
    name: "copy-content-css",
    closeBundle() {
        const destDir = "dist/public";
        if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true });
        }
        copyFileSync("public/content.css", `${destDir}/content.css`);
    },
});

// https://vite.dev/config/
export default defineConfig({
    plugins: [svelte(), crx({ manifest }), copyContentCss()],
    build: {
        rollupOptions: {
            input: {
                popup: "src/popup/popup.html",
                sidebar: "src/sidebar/sidebar.html",
            },
        },
    },
});
