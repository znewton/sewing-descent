import fs from "node:fs/promises";
import path from "node:path";
import { exists, getOutputDir, getRootDir } from "./utils.js";

/**
 * Copy all static files to output folder.
 */
export async function buildScripts() {
	console.debug("Building scripts...");
	const scriptDir = path.join(getRootDir(), "site/scripts");
	if (!(await exists(scriptDir, "directory"))) {
		console.log("No scripts to copy");
		return;
	}
	await fs
		.cp(scriptDir, path.join(getOutputDir(), "scripts"), {
			recursive: true,
		})
		.catch((error) => {
			console.error("Failed to copy scripts", error);
			throw error;
		});
	console.log("Finished building scripts");
}
