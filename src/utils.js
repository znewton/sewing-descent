/**
 * Various utility functions.
 */

import fs from "node:fs/promises";
import path from "node:path";

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
 * Recursively walk a directory without relying on `Dirent.path`/`Dirent.parentPath`,
 * which changed between Node 20 and Node 24. Returns plain descriptors built from
 * manually tracked absolute directory paths so behavior is identical across
 * supported Node versions.
 * @param {string} rootDir - absolute directory path to walk
 * @returns {Promise<{absPath: string, dirAbsPath: string, name: string, isDirectory: boolean}[]>}
 */
export async function readDirRecursive(rootDir) {
	/** @type {{absPath: string, dirAbsPath: string, name: string, isDirectory: boolean}[]} */
	const results = [];

	/**
	 * @param {string} currentDir - absolute directory path
	 */
	async function walk(currentDir) {
		const entries = await fs.readdir(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const absPath = path.join(currentDir, entry.name);
			const isDirectory = entry.isDirectory();
			results.push({
				absPath,
				dirAbsPath: currentDir,
				name: entry.name,
				isDirectory,
			});
			if (isDirectory) {
				await walk(absPath);
			}
		}
	}

	await walk(rootDir);
	return results;
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
		}
		if (expectedType === "file") {
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
