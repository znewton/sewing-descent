#!/usr/bin/env node
/**
 * One-off CLI to derive the Home hero's responsive <picture> variants
 * (small/desktop/large/original) from a single full-resolution source
 * photo, using the already-installed `sharp` dev dependency. This is
 * not part of the build pipeline (no new runtime dependency is added);
 * it exists so a future content edit that swaps the hero photo can
 * reproduce correctly-sized, correctly-compressed `.webp` variants
 * instead of hand-exporting them.
 *
 * Usage:
 *   node tools/derive-hero-variants.mjs <source-image> [output-prefix]
 *
 * Example:
 *   node tools/derive-hero-variants.mjs ~/Photos/new-hero.jpg \
 *     static/imgs/sewing-descent-cover
 *
 * Produces (next to the given prefix):
 *   <prefix>_small.webp     (640w  - <=640px viewports)
 *   <prefix>_desktop.webp   (1920w - 641-1920px viewports)
 *   <prefix>_large.webp     (3436w - 1921-3436px viewports)
 *   <prefix>_original.webp  (full original resolution, re-encoded as
 *                            webp - >=3437px viewports)
 *
 * After running, update the matching <source>/<img width/height>
 * attributes in site/pages/index.html to the real dimensions printed
 * below (do not guess/copy old numbers forward).
 */
import path from "node:path";
import sharp from "sharp";

const VARIANTS = [
	{ suffix: "small", width: 640 },
	{ suffix: "desktop", width: 1920 },
	{ suffix: "large", width: 3436 },
	{ suffix: "original", width: null },
];

async function main() {
	const [, , sourcePath, outputPrefixArg] = process.argv;
	if (!sourcePath) {
		console.error(
			"Usage: node tools/derive-hero-variants.mjs <source-image> [output-prefix]",
		);
		process.exit(1);
	}
	const outputPrefix =
		outputPrefixArg || path.join("static/imgs", "sewing-descent-cover");

	const sourceMeta = await sharp(sourcePath).metadata();
	console.log(
		`Source: ${sourceMeta.width}x${sourceMeta.height} (${sourceMeta.format})`,
	);

	for (const variant of VARIANTS) {
		const outputPath = `${outputPrefix}_${variant.suffix}.webp`;
		let pipeline = sharp(sourcePath);
		if (variant.width && variant.width < sourceMeta.width) {
			// Re-sharpen slightly on downscale: a straight resize alone can
			// look soft once a smaller display region is the actual target,
			// which is the concrete failure mode this script exists to avoid.
			pipeline = pipeline
				.resize({ width: variant.width })
				.sharpen({ sigma: 0.6 });
		}
		const info = await pipeline.webp({ quality: 82 }).toFile(outputPath);
		console.log(
			`Wrote ${outputPath}: ${info.width}x${info.height}, ${info.size} bytes`,
		);
	}

	console.log(
		"\nDone. Update the <source>/<img> width, height, and media breakpoints " +
			"in site/pages/index.html to match the dimensions printed above, and " +
			"verify there is no breakpoint gap between variants.",
	);
}

main().catch((error) => {
	console.error("Failed to derive hero variants:", error);
	process.exit(1);
});
