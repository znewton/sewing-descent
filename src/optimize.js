import fs from "node:fs/promises";
import path from "node:path";
import { minify } from "minify";
import tryToCatch from "try-to-catch";
import { getOutputDir } from "./utils.js";

export async function minifyOutputFiles() {
	const outDir = getOutputDir();

	const outputFiles = await fs.readdir(outDir, {
		withFileTypes: true,
		recursive: true,
	});
	const minifyFileTypes = ["html", "js", "css"];
	/**
	 * @type {Promise<void>[]}
	 */
	const fileWritePs = [];
	for (const outputFile of outputFiles) {
		if (!outputFile.isFile()) {
			console.debug(
				`${outputFile.path}/${outputFile.name} not a file. Skipping...`,
			);
			continue;
		}
		const [, fileType] = outputFile.name.split(".");
		if (!minifyFileTypes.includes(fileType)) {
			console.debug(
				`${outputFile.path}/${outputFile.name} not able to minified because type is ${fileType}. Skipping...`,
			);
			continue;
		}
		const outputFilePath = path.join(outputFile.path, outputFile.name);
		console.debug(`Minifying ${outputFilePath}`);
		const [error, minifiedStyle] = await tryToCatch(minify, outputFilePath);
		if (error) {
			console.error(
				`Failed to minify ${fileType} ${outputFile.name} at ${outputFile.path} from ${outputFilePath}`,
				error,
			);
			throw new Error(
				`Failed to minify ${outputFile.name} at ${outputFile.path}.`,
			);
		}
		fileWritePs.push(fs.writeFile(outputFilePath, minifiedStyle));
	}
	await Promise.all(fileWritePs);
	console.log("Finished minifying output files");
}
