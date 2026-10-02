import fs from "node:fs/promises";
import { minify } from "minify";
import tryToCatch from "try-to-catch";
import { getOutputDir, readDirRecursive } from "./utils.js";

export async function minifyOutputFiles() {
	const outDir = getOutputDir();

	const outputFiles = await readDirRecursive(outDir);
	const minifyFileTypes = ["html", "js", "css"];
	/**
	 * @type {Promise<void>[]}
	 */
	const fileWritePs = [];
	for (const outputFile of outputFiles) {
		if (outputFile.isDirectory) {
			console.debug(`${outputFile.absPath} not a file. Skipping...`);
			continue;
		}
		const [, fileType] = outputFile.name.split(".");
		if (!minifyFileTypes.includes(fileType)) {
			console.debug(
				`${outputFile.absPath} not able to minified because type is ${fileType}. Skipping...`,
			);
			continue;
		}
		console.debug(`Minifying ${outputFile.absPath}`);
		const [error, minifiedStyle] = await tryToCatch(minify, outputFile.absPath);
		if (error) {
			console.error(`Failed to minify ${outputFile.absPath}`, error);
			throw new Error(`Failed to minify ${outputFile.absPath}.`);
		}
		fileWritePs.push(fs.writeFile(outputFile.absPath, minifiedStyle));
	}
	await Promise.all(fileWritePs);
	console.log("Finished minifying output files");
}
