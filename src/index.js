/**
 * Compiles static site files.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { initDev } from "./dev.js";
import { minifyOutputFiles } from "./optimize.js";
import { buildPages } from "./pages.js";
import { buildScripts } from "./scripts.js";
import { buildStyles } from "./styles.js";
import { exists, getOutputDir, getRootDir } from "./utils.js";
import { ensureWordmarkFont } from "./wordmark.js";

/**
 * Make sure root directory is correct.
 */
async function validateRootDir() {
	const rootDir = getRootDir();
	const packageJsonFile = await fs.readFile(path.join(rootDir, "package.json"));
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
	await ensureWordmarkFont();
	await createCleanOutputDir();

	if (!process.argv.includes("--verbose")) {
		console.debug = () => {};
	}

	const mode = process.argv.includes("--dev") ? "dev" : "prod";
	const preview = process.argv.includes("--preview");

	/**
	 * Run every build step and collect failures instead of letting an
	 * individual step's error be swallowed: any rejection must fail the
	 * overall build with a nonzero exit code.
	 */
	const compile = async () => {
		const steps = [
			{ name: "static files", run: copyStaticFiles() },
			{ name: "scripts", run: buildScripts() },
			{ name: "styles", run: buildStyles() },
			{
				name: "pages",
				run: buildPages({ hotReload: mode === "dev", preview }),
			},
		];
		const results = await Promise.allSettled(steps.map((step) => step.run));
		const failures = results
			.map((result, index) => ({ result, name: steps[index].name }))
			.filter(({ result }) => result.status === "rejected");
		for (const failure of failures) {
			console.error(`Error building ${failure.name}:`, failure.result.reason);
		}
		if (failures.length > 0) {
			throw new Error(
				`Build failed: ${failures.map((failure) => failure.name).join(", ")}.`,
			);
		}
	};
	if (mode === "dev") {
		process.env.NODE_ENV = "development";
		await compile();
		await initDev(compile);
	} else {
		process.env.NODE_ENV = "production";
		await compile();
		await minifyOutputFiles();
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
