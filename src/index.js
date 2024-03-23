/**
 * Compiles static site files.
 */

import fs from "node:fs/promises";
import { buildPages } from "./pages.js";
import { buildStyles } from "./styles.js";
import { getOutputDir } from "./utils.js";

/**
 * Creates output directory if it doesn't exist.
 * @returns {Promise<void>}
 */
async function createCleanOutputDir() {
    const outDir = getOutputDir();
    if ((await fs.stat(outDir)).isDirectory()) {
        await fs.rm(outDir, { recursive: true });
    }
    await fs.mkdir(outDir);
}

/**
 * Initialize hot reload dev server.
 * @returns {Promise<void>} callback to shutdown the server.
 */
async function initDevServer() {}

/**
 * Compile everything necessary to view the site.
 * @returns {Promise<void>}
 */
async function build() {
    const mode = process.argv.includes("--dev") ? "dev" : "prod";
    await createCleanOutputDir();

    if (mode === "dev") {
        process.env.NODE_ENV = "development";
        await initDevServer();
    } else {
        process.env.NODE_ENV = "production";
    }

    await Promise.all([
        buildStyles(),
        buildPages({ hotReload: mode === "dev" }),
    ]);
}

build().then((error) => {
    console.error("Build Error:", error);
    process.exit(1);
});
