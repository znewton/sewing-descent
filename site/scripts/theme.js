/**
 * Preview-only design direction toolbar.
 * This file is only referenced by the page template when the build runs
 * with --preview; production builds never link to it.
 */
(() => {
	const STORAGE_KEY = "sd-theme";
	const THEMES = [
		"field-notes",
		"workshop",
		"nightfall",
		"field-notes-nightfall",
	];

	function safeGet(key) {
		try {
			return window.localStorage.getItem(key);
		} catch (_error) {
			return null;
		}
	}
	function safeSet(key, value) {
		try {
			window.localStorage.setItem(key, value);
		} catch (_error) {
			/* ignore storage failures (private browsing, disabled storage) */
		}
	}

	function applyTheme(theme, { updateUrl = true } = {}) {
		if (!THEMES.includes(theme)) return;
		document.documentElement.setAttribute("data-theme", theme);
		safeSet(STORAGE_KEY, theme);
		if (updateUrl) {
			const url = new URL(window.location.href);
			url.searchParams.set("theme", theme);
			window.history.replaceState(null, "", url);
		}
		for (const button of document.querySelectorAll(
			".preview-toolbar [data-theme-option]",
		)) {
			button.setAttribute(
				"aria-pressed",
				String(button.getAttribute("data-theme-option") === theme),
			);
		}
	}

	document.addEventListener("DOMContentLoaded", () => {
		const current =
			document.documentElement.getAttribute("data-theme") ||
			safeGet(STORAGE_KEY) ||
			"field-notes-nightfall";
		applyTheme(current, { updateUrl: false });

		for (const button of document.querySelectorAll(
			".preview-toolbar [data-theme-option]",
		)) {
			button.addEventListener("click", () => {
				applyTheme(button.getAttribute("data-theme-option"));
			});
		}

		// The toolbar wraps onto multiple rows on narrow viewports, so its
		// rendered height isn't a fixed constant. Track the real height into
		// a CSS variable instead of assuming one, so main content padding
		// always reserves exactly enough space and nothing gets occluded.
		const toolbar = document.querySelector(".preview-toolbar");
		if (toolbar && "ResizeObserver" in window) {
			const setHeightVar = () => {
				document.documentElement.style.setProperty(
					"--preview-toolbar-height",
					`${toolbar.offsetHeight}px`,
				);
			};
			new ResizeObserver(setHeightVar).observe(toolbar);
			setHeightVar();
		}
	});
})();
