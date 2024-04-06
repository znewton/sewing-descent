/**
 * Build steps related to styles.
 */

import fs from "node:fs/promises";
import path from "node:path";
import showdown from "showdown";
import { exists, getOutputDir, getRootDir } from "./utils.js";

/**
 * @typedef PagesOptions
 * @property {boolean} hotReload - whether to output with hot reload scripts.
 */

/**
 * Build the base page template file string.
 * @param {PagesOptions} options - page build options
 * @returns {Promise<string>} Template HTML
 */
async function getBaseTemplateHtml(options) {
    const rootDir = getRootDir();
    const templateFilePath = path.join(rootDir, "site/template.html");
    const templateString = (await fs.readFile(templateFilePath)).toString();

    const hotReloadSelector = "{{{DEV}}}";
    if (options.hotReload) {
        const hotReloadHtmlFilePath = path.join(rootDir, "site/hotreload.html");
        const hotReloadHtml = (
            await fs.readFile(hotReloadHtmlFilePath)
        ).toString();
        return templateString.replace(hotReloadSelector, hotReloadHtml);
    }

    return templateString.replace(hotReloadSelector, "");
}

/**
 * Build a page.
 * @param {string} title - page title
 * @param {string} content - content for the page
 * @param {"md" | "html"} contentType - content type of the page
 * @param {string} baseTemplateHtml - base template to build from.
 * @returns {string} Final page HTML content
 */
function buildPageHtml(title, content, contentType, baseTemplateHtml) {
    const parsedContent =
        contentType === "html"
            ? content
            : `<main class="flex-center-column"><section class="flex-column flex-start">${new showdown.Converter().makeHtml(content)}</section></main>`;
    return baseTemplateHtml
        .replace("{{{TITLE}}}", title === "Index" ? "Home" : title)
        .replace("{{{CONTENT}}}", parsedContent);
}

/**
 * Builds all HTML pages wrapped with the template file for a given directory.
 * @param {string} baseTemplateHtml - base template to build from.
 * @param {string} rootDirectoryPath - Path for the root of the directory to build
 * @returns {Promise<void>}
 */
async function buildPagesInDirectory(baseTemplateHtml, rootDirectoryPath) {
    const inputPageFiles = await fs.readdir(rootDirectoryPath, {
        withFileTypes: true,
        encoding: "utf-8",
        recursive: true,
    });
    const outDir = getOutputDir();
    /**
     * @type {Promise<void>[]}
     */
    const outputPageWritePs = [];
    for (const inputPageFile of inputPageFiles) {
        const [fileName, fileType] = inputPageFile.name.split(".");
        if (!fileType) {
            const dirPath = path.join(outDir, fileName);
            if (!(await exists(dirPath))) await fs.mkdir(dirPath);
            continue;
        }
        const inputFilePath = path.join(inputPageFile.path, inputPageFile.name);
        const outputFilePath = path
            .join(
                inputPageFile.path.replace(rootDirectoryPath, ""),
                `${fileName}.html`,
            )
            .trim("/");
        if (!["md", "html"].includes(fileType)) {
            console.error(
                `File ${inputPageFile.name} at ${inputPageFile.path} is not a valid type. Must be "md" or "html".`,
            );
            throw new Error(`Invalid page file: ${inputPageFile.name}.`);
        }
        const title = fileName
            .split(/[-_]/)
            .map(
                (titlePart) =>
                    `${titlePart[0].toUpperCase()}${titlePart.slice(1).toLowerCase()}`,
            )
            .join(" ");
        const content = (await fs.readFile(inputFilePath)).toString();
        const pageHtml = buildPageHtml(
            title,
            content,
            fileType,
            baseTemplateHtml,
        );

        const outputPagePath = path.join(outDir, outputFilePath);
        outputPageWritePs.push(fs.writeFile(outputPagePath, pageHtml));
    }

    await Promise.all(outputPageWritePs);
}

/**
 * Builds all HTML pages wrapped with the template file.
 * @param {PagesOptions} options - page build options
 * @returns {Promise<void>}
 */
export async function buildPages(options) {
    console.log("Building Pages...");
    const baseTemplateHtml = await getBaseTemplateHtml(options);

    const rootDir = getRootDir();
    const inputPageDir = path.join(rootDir, "site/pages");
    await buildPagesInDirectory(baseTemplateHtml, inputPageDir);
    console.log("Finished building Pages");
}
