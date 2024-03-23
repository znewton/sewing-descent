/**
 * Various utility functions.
 */

import path from "node:path";
import fs from "node:fs/promises";

/**
 * @returns {string} string path to the project's root directory.
 */
export function getRootDir() {
    const rootDir = process.cwd();
    return rootDir;
}

/**
 * @returns {string} string path to `dist` directory in root project folder.
 */
export function getOutputDir() {
    return path.join(getRootDir(), "/dist");
}

/**
 * Check if a filesystem entry exists
 * @param {string} path - path of filesystem entry to check
 * @param {"file" | "directory" | undefined} expectedType - type of the filesystem entry being checked. If not specified, anything goes.
 * @returns {Promise<boolean>} whether the filesystem entry exists
 */
export async function exists(path, expectedType) {
    try {
        const stat = await fs.stat(path);
        if (expectedType === "directory") {
            return stat.isDirectory();
        } else if (expectedType === "file") {
            return stat.isFile();
        }
        return true;
    } catch (error) {
        if (error.code === "ENOENT") {
            return false;
        }
        throw error;
    }
}
