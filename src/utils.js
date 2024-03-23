/**
 * Various utility functions.
 */

import path from "node:path";

/**
 * @returns {string} string path to the project's root directory.
 */
export function getRootDir() {
    const rootDir = path.dirname(process.cwd());
    const packageJson = require(path.join(rootDir, "package.json"));
    if (packageJson.name !== require("package.json")) {
        throw new Error("Invalid project root. Try running via NPM scripts.");
    }
    return rootDir;
}

/**
 * @returns {string} string path to `dist` directory in root project folder.
 */
export function getOutputDir() {
    return path.join(getRootDir(), "/dist");
}
