/**
 * Compiles static site files.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { buildPages } from "./pages.js";
import { buildStyles } from "./styles.js";
import { getOutputDir, getRootDir } from "./utils.js";

/**
 * Creates output directory if it doesn't exist.
 * @returns {Promise<void>}
 */
async function createCleanOutputDir() {
    console.log("Cleaning output directory...");
    const outDir = getOutputDir();
    if ((await fs.stat(outDir)).isDirectory()) {
        await fs.rm(outDir, { recursive: true });
    }
    await fs.mkdir(outDir);
    console.log("Done cleaning output directory");
}

/**
 * Copy all static files to output folder.
 */
async function copyStaticFiles() {
    console.log("Copying static files...");
    const staticDir = path.join(getRootDir(), "static");
    if (!(await fs.stat(staticDir)).isDirectory()) {
        console.log("No static files to copy");
        return;
    }
    await fs
        .cp(staticDir, path.join(getOutputDir(), "static"), {
            recursive: true,
        })
        .catch((error) => {
            console.error("Failed to copy Static Files", error);
            throw error;
        });
    console.log("Finished copying Static files");
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
        copyStaticFiles(),
        buildStyles(),
        buildPages({ hotReload: mode === "dev" }),
    ]);
}

build().then((error) => {
    console.error("Build Error:", error);
    process.exit(1);
});
