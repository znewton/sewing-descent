import assert from "node:assert/strict";
import { test } from "node:test";
import {
	escapeHtml,
	formatDate,
	isValidIsoDate,
	renderArticleHtml,
	renderJournalCard,
	validatePostMeta,
} from "../src/content.js";

/** A minimal, always-valid metadata object other tests mutate from. */
function validMeta(overrides = {}) {
	return {
		title: "A title",
		date: "2024-04-06",
		summary: "A summary",
		type: "project",
		tags: ["a-tag"],
		...overrides,
	};
}

test("escapeHtml escapes all five special characters", () => {
	assert.equal(
		escapeHtml(`<script>alert("x")</script> & 'quote'`),
		"&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quote&#39;",
	);
});

test("formatDate renders a human readable date in UTC", () => {
	assert.equal(formatDate("2024-04-06"), "April 6, 2024");
});

test("validatePostMeta rejects missing required fields", async () => {
	const errors = await validatePostMeta("test-slug", {}, process.cwd());
	assert.ok(errors.some((e) => e.includes('missing required field "title"')));
	assert.ok(errors.some((e) => e.includes('missing required field "date"')));
	assert.ok(errors.some((e) => e.includes('missing required field "summary"')));
	assert.ok(errors.some((e) => e.includes('missing required field "type"')));
	assert.ok(errors.some((e) => e.includes('missing required field "tags"')));
});

test("validatePostMeta rejects a bad date format", async () => {
	const errors = await validatePostMeta(
		"test-slug",
		{
			title: "A title",
			date: "04/06/2024",
			summary: "A summary",
			type: "project",
			tags: ["a-tag"],
		},
		process.cwd(),
	);
	assert.ok(errors.some((e) => e.includes("YYYY-MM-DD")));
});

test("validatePostMeta rejects an invalid type", async () => {
	const errors = await validatePostMeta(
		"test-slug",
		{
			title: "A title",
			date: "2024-04-06",
			summary: "A summary",
			type: "recipe",
			tags: ["a-tag"],
		},
		process.cwd(),
	);
	assert.ok(errors.some((e) => e.includes('"type" must be one of')));
});

test("validatePostMeta rejects duplicate and malformed tags", async () => {
	const errors = await validatePostMeta(
		"test-slug",
		{
			title: "A title",
			date: "2024-04-06",
			summary: "A summary",
			type: "project",
			tags: ["Not-Kebab", "dup", "dup"],
		},
		process.cwd(),
	);
	assert.ok(errors.some((e) => e.includes('tag "Not-Kebab"')));
	assert.ok(errors.some((e) => e.includes('duplicate tag "dup"')));
});

test("validatePostMeta rejects an invalid status", async () => {
	const errors = await validatePostMeta(
		"test-slug",
		{
			title: "A title",
			date: "2024-04-06",
			summary: "A summary",
			type: "project",
			tags: ["a-tag"],
			status: "live",
		},
		process.cwd(),
	);
	assert.ok(errors.some((e) => e.includes('"status" must be one of')));
});

test("validatePostMeta requires a meaningful, non-filename cover alt", async () => {
	const base = {
		title: "A title",
		date: "2024-04-06",
		summary: "A summary",
		type: "project",
		tags: ["a-tag"],
		cover: {
			src: "/static/logo.svg",
			alt: "logo.svg",
			width: 100,
			height: 100,
		},
	};
	const errors = await validatePostMeta("test-slug", base, process.cwd());
	assert.ok(
		errors.some((e) =>
			e.includes('"cover.alt" must be a meaningful description'),
		),
	);
});

test("validatePostMeta rejects a cover asset that does not exist", async () => {
	const errors = await validatePostMeta(
		"test-slug",
		{
			title: "A title",
			date: "2024-04-06",
			summary: "A summary",
			type: "project",
			tags: ["a-tag"],
			cover: {
				src: "/static/imgs/does-not-exist.webp",
				alt: "A meaningful description of the missing photo",
				width: 100,
				height: 100,
			},
		},
		process.cwd(),
	);
	assert.ok(errors.some((e) => e.includes("does not exist locally")));
});

test("validatePostMeta accepts a fully valid post", async () => {
	const errors = await validatePostMeta(
		"valid-post",
		{
			title: "A Valid Post",
			date: "2024-04-06",
			summary: "A valid summary of the post.",
			type: "technique",
			tags: ["waxed-canvas"],
			status: "draft",
			cover: {
				src: "/static/logo.svg",
				alt: "A meaningful description of the cover image",
				width: 100,
				height: 100,
			},
		},
		process.cwd(),
	);
	// body.md existence is still required and will fail in this synthetic dir,
	// so only assert the metadata-specific errors are absent.
	assert.ok(!errors.some((e) => e.includes("title")));
	assert.ok(!errors.some((e) => e.includes("cover")));
});

test("renderArticleHtml escapes metadata but preserves markdown body rendering", () => {
	const post = {
		slug: "escape-test",
		route: "/journal/escape-test.html",
		bodyMarkdown: "Body with **bold** text.",
		meta: {
			title: "<b>Bold Title</b>",
			date: "2024-04-06",
			summary: "Summary with <script>alert(1)</script>",
			type: "project",
			tags: ["a-tag"],
			status: "draft",
		},
	};
	const html = renderArticleHtml(post);
	assert.ok(html.includes("&lt;b&gt;Bold Title&lt;/b&gt;"));
	assert.ok(!html.includes("<script>alert(1)</script>"));
	assert.ok(html.includes("<strong>bold</strong>"));
	assert.ok(html.includes('<span class="draft-badge">Draft</span>'));
});

test("renderArticleHtml omits the draft badge for published posts", () => {
	const post = {
		slug: "published-test",
		route: "/journal/published-test.html",
		bodyMarkdown: "Published body.",
		meta: {
			title: "Published Post",
			date: "2024-04-06",
			summary: "A published summary.",
			type: "project",
			tags: ["a-tag"],
			status: "published",
		},
	};
	const html = renderArticleHtml(post);
	assert.ok(!html.includes("draft-badge"));
});

test("renderJournalCard includes tag data attributes for filtering", () => {
	const post = {
		slug: "tagged-test",
		route: "/journal/tagged-test.html",
		bodyMarkdown: "",
		meta: {
			title: "Tagged Post",
			date: "2024-04-06",
			summary: "A tagged summary.",
			type: "technique",
			tags: ["waxed-canvas", "backpack"],
			status: "published",
		},
	};
	const html = renderJournalCard(post);
	assert.ok(html.includes('data-tags="waxed-canvas backpack"'));
});

test("renderArticleHtml and renderJournalCard show a label instead of a real date for layoutExample posts", () => {
	const post = {
		slug: "demo-test",
		route: "/journal/demo-test.html",
		bodyMarkdown: "Demo body.",
		meta: {
			title: "Demo Post",
			date: "2026-01-01",
			summary: "A demo summary.",
			type: "project",
			tags: ["layout-example"],
			status: "draft",
			layoutExample: true,
		},
	};
	const articleHtml = renderArticleHtml(post);
	const cardHtml = renderJournalCard(post);
	for (const html of [articleHtml, cardHtml]) {
		assert.ok(
			html.includes('<span class="layout-example-label">Layout example</span>'),
		);
		assert.ok(
			!html.includes("2026"),
			"a convincing-looking future date must never be rendered for a layout example",
		);
	}
});

test("isValidIsoDate rejects calendar-rollover dates that Date.parse silently accepts", () => {
	// Date.parse("2024-02-30") rolls over to 2024-03-01 instead of failing;
	// this is the exact bug isValidIsoDate exists to catch.
	assert.equal(isValidIsoDate("2024-02-30"), false);
	assert.equal(isValidIsoDate("2023-02-29"), false, "2023 is not a leap year");
	assert.equal(isValidIsoDate("2024-02-29"), true, "2024 is a leap year");
	assert.equal(isValidIsoDate("2024-04-06"), true);
	assert.equal(isValidIsoDate("2024-13-01"), false, "month 13 does not exist");
	assert.equal(isValidIsoDate("not-a-date"), false);
});

test("validatePostMeta rejects a body.md file that exists but is silently empty", async () => {
	const os = await import("node:os");
	const fs = await import("node:fs/promises");
	const path = await import("node:path");
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sd-content-test-"));
	try {
		await fs.writeFile(path.join(tmpDir, "body.md"), "   \n\t  ");
		const errors = await validatePostMeta("test-slug", validMeta(), tmpDir);
		assert.ok(errors.some((e) => e.includes("must not be silently empty")));
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test("validatePostMeta validates Markdown body images: meaningful alt and a local /static/ source", async () => {
	const os = await import("node:os");
	const fs = await import("node:fs/promises");
	const path = await import("node:path");
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sd-content-test-"));
	try {
		await fs.writeFile(
			path.join(tmpDir, "body.md"),
			"Some real body text.\n\n![logo.svg](/static/logo.svg)\n",
		);
		const badAlt = await validatePostMeta("test-slug", validMeta(), tmpDir);
		assert.ok(
			badAlt.some((e) => e.includes("meaningful alt description")),
			"a filename used as alt text is not a meaningful description",
		);

		await fs.writeFile(
			path.join(tmpDir, "body.md"),
			"Some real body text.\n\n![A worn canvas pack sitting by a campfire](https://example.com/photo.jpg)\n",
		);
		const external = await validatePostMeta("test-slug", validMeta(), tmpDir);
		assert.ok(
			external.some((e) => e.includes('must start with "/static/"')),
			"owner-authored body images must still be local, published assets",
		);

		await fs.writeFile(
			path.join(tmpDir, "body.md"),
			"Some real body text.\n\n![A worn canvas pack sitting by a campfire](/static/logo.svg)\n",
		);
		const valid = await validatePostMeta("test-slug", validMeta(), tmpDir);
		assert.ok(
			!valid.some((e) => e.includes("body.md")),
			"a meaningful alt and a real /static/ asset must pass",
		);
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test("validatePostMeta rejects a numeric title and summary instead of silently accepting them", async () => {
	const errors = await validatePostMeta(
		"test-slug",
		validMeta({ title: 12345, summary: 67890 }),
		process.cwd(),
	);
	assert.ok(errors.some((e) => e.includes('"title" must be a string')));
	assert.ok(errors.some((e) => e.includes('"summary" must be a string')));
});

test("validatePostMeta rejects a date that rolls over via Date.parse (e.g. Feb 30)", async () => {
	const errors = await validatePostMeta(
		"test-slug",
		validMeta({ date: "2024-02-30" }),
		process.cwd(),
	);
	assert.ok(
		errors.some((e) => e.includes("not a real calendar date")),
		"must reject the rollover date explicitly rather than accepting it",
	);
});

test("validatePostMeta rejects tags provided as an object instead of an array", async () => {
	const errors = await validatePostMeta(
		"test-slug",
		validMeta({ tags: { a: "waxed-canvas" } }),
		process.cwd(),
	);
	assert.ok(errors.some((e) => e.includes('"tags" must be a non-empty array')));
});

test("validatePostMeta rejects a cover object given as an array", async () => {
	const errors = await validatePostMeta(
		"test-slug",
		validMeta({ cover: [] }),
		process.cwd(),
	);
	assert.ok(errors.some((e) => e.includes('"cover" must be an object')));
});

test("validatePostMeta rejects non-string cover.alt/cover.src", async () => {
	const errors = await validatePostMeta(
		"test-slug",
		validMeta({
			cover: { src: 42, alt: true, width: 100, height: 100 },
		}),
		process.cwd(),
	);
	assert.ok(errors.some((e) => e.includes('"cover.alt" must be a string')));
	assert.ok(
		errors.some((e) => e.includes("must be a non-empty string")),
		"cover.src must go through the same string check as a Markdown body image src",
	);
});

test("validatePostMeta rejects a non-string cover.caption", async () => {
	const errors = await validatePostMeta(
		"test-slug",
		validMeta({
			cover: {
				src: "/static/logo.svg",
				alt: "A meaningful description of the logo",
				width: 100,
				height: 100,
				caption: 123,
			},
		}),
		process.cwd(),
	);
	assert.ok(errors.some((e) => e.includes('"cover.caption" must be a string')));
});

test("validatePostMeta rejects non-integer and non-positive cover dimensions", async () => {
	const errors = await validatePostMeta(
		"test-slug",
		validMeta({
			cover: {
				src: "/static/logo.svg",
				alt: "A meaningful description of the logo",
				width: 100.5,
				height: -10,
			},
		}),
		process.cwd(),
	);
	assert.ok(
		errors.some((e) => e.includes('"cover.width" must be a positive integer')),
	);
	assert.ok(
		errors.some((e) => e.includes('"cover.height" must be a positive integer')),
	);
});

test("validatePostMeta rejects cover.src paths outside /static/ (never published, previously only checked relative to the post dir)", async () => {
	const errors = await validatePostMeta(
		"test-slug",
		validMeta({
			cover: {
				src: "cover.webp",
				alt: "A meaningful description of the photo",
				width: 100,
				height: 100,
			},
		}),
		process.cwd(),
	);
	assert.ok(
		errors.some((e) => e.includes('must start with "/static/"')),
		"a post-local relative path is never copied into dist/ and must be rejected",
	);
});

test("validatePostMeta rejects cover.src path traversal, including percent-encoded traversal", async () => {
	const plain = await validatePostMeta(
		"test-slug",
		validMeta({
			cover: {
				src: "/static/../../package.webp",
				alt: "A meaningful description of the photo",
				width: 100,
				height: 100,
			},
		}),
		process.cwd(),
	);
	assert.ok(plain.some((e) => e.includes("no path traversal")));

	const encoded = await validatePostMeta(
		"test-slug",
		validMeta({
			cover: {
				src: "/static/%2e%2e/%2e%2e/package.webp",
				alt: "A meaningful description of the photo",
				width: 100,
				height: 100,
			},
		}),
		process.cwd(),
	);
	assert.ok(
		encoded.some((e) => e.includes("no path traversal")),
		"percent-decoded traversal segments must be caught too",
	);
});

test("validatePostMeta rejects a disallowed cover.src file extension", async () => {
	const errors = await validatePostMeta(
		"test-slug",
		validMeta({
			cover: {
				src: "/static/logo.txt",
				alt: "A meaningful description of the file",
				width: 100,
				height: 100,
			},
		}),
		process.cwd(),
	);
	assert.ok(errors.some((e) => e.includes("allowed image extension")));
});

test("validatePostMeta rejects a non-boolean layoutExample and a published layoutExample post", async () => {
	const nonBoolean = await validatePostMeta(
		"test-slug",
		validMeta({ layoutExample: "yes" }),
		process.cwd(),
	);
	assert.ok(
		nonBoolean.some((e) => e.includes('"layoutExample" must be a boolean')),
	);

	const publishedDemo = await validatePostMeta(
		"test-slug",
		validMeta({ layoutExample: true, status: "published" }),
		process.cwd(),
	);
	assert.ok(
		publishedDemo.some((e) => e.includes("must never be published")),
		"a layoutExample post must never be allowed to publish, even if status is set to published",
	);

	const draftDemo = await validatePostMeta(
		"test-slug",
		validMeta({ layoutExample: true, status: "draft" }),
		process.cwd(),
	);
	assert.ok(
		!draftDemo.some((e) => e.includes("must never be published")),
		"a draft layoutExample post is fine",
	);
});
