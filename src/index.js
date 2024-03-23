/**
 * Compiles static site files.
 */

import fs from "node:fs/promises";
import path from "node:path";
import open from "open";
import { buildPages } from "./pages.js";
import { buildStyles } from "./styles.js";
import { exists, getOutputDir, getRootDir } from "./utils.js";
import { initDevServer, initWatchAndCompile } from "./dev.js";

/**
 * Make sure root directory is correct.
 */
async function validateRootDir() {
    const rootDir = getRootDir();
    const packageJsonFile = await fs.readFile(
        path.join(rootDir, "package.json"),
    );
    try {
        const packageJson = JSON.parse(packageJsonFile);
        if (packageJson.name !== "sewing-descent") {
            throw new Error(
                `Incorrect root directory detected: package name is ${packageJson.name} but should be "sewing-descent".`,
            );
        }
    } catch (error) {
        console.error("Error validating Root Dir:", error);
        throw new Error("Root Dir invalid. Please run from project root.");
    }
}

/**
 * Creates output directory if it doesn't exist.
 * @returns {Promise<void>}
 */
async function createCleanOutputDir() {
    console.log("Cleaning output directory...");
    const outDir = getOutputDir();
    if (await exists(outDir, "directory")) {
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
    if (!(await exists(staticDir, "directory"))) {
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
 * Compile everything necessary to view the site.
 * @returns {Promise<void>}
 */
async function build() {
    await validateRootDir();
    await createCleanOutputDir();

    const mode = process.argv.includes("--dev") ? "dev" : "prod";

    const compile = async () =>
        Promise.all([
            copyStaticFiles().catch((error) => {
                console.error("Error copying static files", error);
            }),
            buildStyles().catch((error) => {
                console.error("Error building styles", error);
            }),
            buildPages({ hotReload: mode === "dev" }).catch((error) => {
                console.error("Error building pages", error);
            }),
        ]);
    if (mode === "dev") {
        process.env.NODE_ENV = "development";
        await compile();
        await initDevServer();
        open(path.join(getOutputDir(), "index.html"));
        await initWatchAndCompile(compile);
    } else {
        process.env.NODE_ENV = "production";
        await compile();
    }
}

build()
    .catch((error) => {
        console.error("Build Error:", error);
        process.exit(1);
    })
    .then(() => {
        console.log("Build complete!");
    });
