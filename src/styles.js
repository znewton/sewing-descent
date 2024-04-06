/**
 * Build steps related to styles.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { compile as sassCompile } from "sass";
import { exists, getOutputDir, getRootDir } from "./utils.js";

/**
 * Compiles styles and outputs them.
 * @returns {Promise<void>}
 */
export async function buildStyles() {
	const rootDir = getRootDir();
	const outDir = getOutputDir();
	console.log("Building Styles...");
	const styleDir = path.join(rootDir, "site/styles");
	if (!(await exists(styleDir, "directory"))) {
		throw new Error("Non-existent styles dir. Expected at 'site/styles'.");
	}
	const outStyleDir = path.join(outDir, "styles");
	if (!(await exists(outStyleDir, "directory"))) {
		await fs.mkdir(outStyleDir);
	}
	const inputStyleFiles = await fs.readdir(styleDir, { withFileTypes: true });
	/**
	 * @type {Promise<void>[]}
	 */
	const outputStyleWritePs = [];
	for (const inputStyleFile of inputStyleFiles) {
		const [fileName, fileType] = inputStyleFile.name.split(".");
		if (!["css", "scss"].includes(fileType)) {
			console.error(
				`File ${inputStyleFile.name} at ${inputStyleFile.path} is not a valid type. Must be "css" or "scss".`,
			);
			throw new Error(`Invalid page file: ${inputStyleFile.name}.`);
		}

		const stylePath = path.join(inputStyleFile.path, inputStyleFile.name);
		const rawStyleContent = await fs.readFile(stylePath);
		const style =
			fileType === "scss" ? sassCompile(stylePath).css : rawStyleContent;

		const outputPagePath = path.join(outStyleDir, `${fileName}.css`);
		outputStyleWritePs.push(fs.writeFile(outputPagePath, style));
	}
	await Promise.all(outputStyleWritePs);
	console.log("Finished building Styles");
}
