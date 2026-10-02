/**
 * Progressive enhancement for the Journal tag filters. Every card is
 * visible in the server-rendered markup; this only toggles visibility
 * when JavaScript is available.
 */
(() => {
	const filterGroup = document.querySelector(".journal-filters");
	const cards = document.querySelectorAll(".journal-card");
	const liveRegion = document.querySelector(".journal-filter-status");
	if (!filterGroup || cards.length === 0) return;

	function setStatus(text) {
		// Written as an early-return helper (not `if (x) { x.y = z }`)
		// because at least one HTML minifier in this build pipeline
		// incorrectly rewrites that shape into an invalid
		// `x?.y = z` assignment, which throws a SyntaxError at runtime.
		if (!liveRegion) return;
		liveRegion.textContent = text;
	}

	function applyFilter(tag) {
		let visibleCount = 0;
		for (const card of cards) {
			const tags = (card.getAttribute("data-tags") || "").split(" ");
			const show = tag === "all" || tags.includes(tag);
			card.hidden = !show;
			if (show) visibleCount += 1;
		}
		for (const button of filterGroup.querySelectorAll("button")) {
			button.setAttribute(
				"aria-pressed",
				String(button.getAttribute("data-tag") === tag),
			);
		}
		setStatus(`Showing ${visibleCount} of ${cards.length} entries.`);
	}

	filterGroup.addEventListener("click", (event) => {
		const button = event.target.closest("button[data-tag]");
		if (!button) return;
		applyFilter(button.getAttribute("data-tag"));
	});
})();
