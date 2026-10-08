/* ==========================================================
   LoanD – shared JavaScript (loaded on every page)
   1. General UI
   2. Formatting helpers
   3. Research helpers (sources, statuses, dates)
   4. Glossary tooltips
   5. Theme (light / dark)
   6. Navigation (drawer, in-page sidebar)
   7. Page setup
   ========================================================== */


/* ---------- 1. General UI ---------- */

function loanComingSoon() {
    alert("Loan calculator is not available yet.");
}


/* ---------- 2. Formatting helpers ---------- */

// Research text must never be inserted into the page as raw HTML.
// Escaping turns characters like < into &lt; so they display as text.
function escapeHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

const poundFormatter = new Intl.NumberFormat("en-GB", {
    style: "currency", currency: "GBP", maximumFractionDigits: 0
});

function formatPounds(amount) {
    return poundFormatter.format(Math.round(amount));
}

function formatPercent(value, decimals = 1) {
    return value.toFixed(decimals) + "%";
}

// "2026-09-26" -> "26 Sep 2026". Other formats are returned unchanged.
function formatDate(isoDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || "");
    if (!match) return isoDate || "";
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function daysSince(isoDate) {
    const then = new Date(isoDate + "T00:00:00");
    return Math.floor((Date.now() - then.getTime()) / 86400000);
}


// Counts an element's number up or down to a new value, so a changed
// figure is visibly a change rather than a silent swap. Falls back to
// setting the text at once if the device asks for reduced motion.
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const countTimers = new WeakMap();

function countTo(element, to, format) {
    const from = Number(element.dataset.value);
    element.dataset.value = to;
    clearInterval(countTimers.get(element));

    if (motionQuery.matches || !Number.isFinite(from) || from === to) {
        element.textContent = format(to);
        return;
    }

    const start = performance.now();
    const duration = 420;
    const timer = setInterval(() => {
        const progress = Math.min((performance.now() - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);   // fast, then settles
        element.textContent = format(from + (to - from) * eased);
        if (progress === 1) clearInterval(timer);
    }, 16);
    countTimers.set(element, timer);
}


/* ---------- 3. Research helpers ---------- */

const RESEARCH = window.LOAND_RESEARCH || null;

// Rates older than this are flagged, as the research README recommends.
const RATE_STALE_AFTER_DAYS = 7;

function findSource(sourceId) {
    if (!RESEARCH) return null;
    return RESEARCH.sources.find(source => source.source_id === sourceId) || null;
}

// "S13;S55" -> ["S13", "S55"]. Ignores anything that isn't a source ID.
function parseSourceIds(text) {
    return String(text || "").split(/[;,]/).map(id => id.trim()).filter(id => /^S\d+$/.test(id));
}

function isSafeUrl(url) {
    return /^https?:\/\//i.test(url || "");
}

// Small "S13" links that open the original source in a new tab.
function sourceLinks(ids) {
    const list = Array.isArray(ids) ? ids : parseSourceIds(ids);
    return list.map(id => {
        const source = findSource(id);
        if (!source || !isSafeUrl(source.source_url)) return `<span class="source-ref">${escapeHtml(id)}</span>`;
        return `<a class="source-ref" href="${escapeHtml(source.source_url)}" target="_blank" rel="noopener" `
             + `title="${escapeHtml(source.source_title)}">${escapeHtml(id)}</a>`;
    }).join(" ");
}

// Confirmed facts get no badge, which keeps the page quiet.
// Everything else gets a badge whose tooltip explains the status.
function statusBadge(status) {
    if (!status || status === "CONFIRMED") return "";
    const label = status === "NOT VERIFIED" ? "Not yet verified"
                : status.charAt(0) + status.slice(1).toLowerCase();
    return `<span class="badge term" data-term="${escapeHtml(status)}" tabindex="0">${escapeHtml(label)}</span>`;
}

// Mortgage products only open to specific groups (Premier customers, shared
// ownership, existing borrowers...). Left out of general rate comparisons.
const SPECIAL_PRODUCT = /shared equity|shared ownership|premier|help to buy|right to buy|springboard|joint borrower|retention|existing|further advance|buy to let|btl|offset/i;

// Does a rate row suit this kind of buyer? ("first-time buyer" or "home mover")
function rateMatchesBuyer(row, buyerType) {
    const buyers = buyerType === "first-time buyer"
        ? ["First-time buyer", "Purchase", "Purchase (segment not disambiguated)"]
        : ["Home mover / purchase", "Purchase", "Purchase (segment not disambiguated)"];
    return row.purpose === "Purchase" && buyers.includes(row.buyer_type);
}

// LTV bands: "60-75%" covers above 60% up to 75%. A band starting at 0 includes 0.
function ltvInBand(ltv, min, max) {
    if (max === null || max === undefined) return false;
    return (!min ? ltv >= 0 : ltv > min) && ltv <= max + 1e-9;
}

// Rates normally rise as LTV rises: borrowing more of the price costs more.
// A row that undercuts the same lender's own cheaper-LTV bands is almost
// always a segment the research couldn't separate (one lender's guide mixes
// first-time buyer and other purchase products under one heading), not a
// genuine bargain. We flag those rather than hide them, so nobody is pointed
// at a deal that may not exist, and the data stays visible.
const RATE_ANOMALY_TOLERANCE = 0.10;   // percentage points
let anomalousRates = null;

function findAnomalousRates() {
    if (anomalousRates || !RESEARCH) return anomalousRates || new Set();
    anomalousRates = new Set();

    // Compare only like with like: same lender, product family, deal length,
    // rate type, purpose, buyer and PRODUCT FEE. The fee matters: a lender
    // genuinely does sell a cheaper rate at a higher LTV when the fee is
    // much larger (NatWest's £3,999-fee products do exactly that), and
    // without it those honest trade-offs get flagged as errors.
    const groups = new Map();
    RESEARCH.mortgage_rates.forEach(row => {
        if (!isDisplayable(row) || typeof row.initial_rate_number !== "number" || typeof row.ltv_max !== "number") return;
        const family = row.product.split(" - ")[0];
        const key = [row.lender_group, family, row.initial_period_months, row.rate_type,
                     row.purpose, row.buyer_type, row.product_fee_number].join("|");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    });

    groups.forEach(rows => {
        // Cheapest rate available in each LTV band.
        const best = new Map();
        rows.forEach(row => {
            const current = best.get(row.ltv_max);
            if (current === undefined || row.initial_rate_number < current) best.set(row.ltv_max, row.initial_rate_number);
        });
        const bands = [...best.keys()].sort((a, b) => a - b);
        rows.forEach(row => {
            // Compare with the band immediately below, not every lower band:
            // the step from one band to the next is where pricing should not
            // go backwards. The tolerance leaves ordinary pricing quirks of a
            // few hundredths of a point alone; only a clear reversal is flagged.
            const below = bands.filter(band => band < row.ltv_max).pop();
            if (below === undefined) return;
            if (row.initial_rate_number < best.get(below) - RATE_ANOMALY_TOLERANCE) anomalousRates.add(row);
        });
    });
    return anomalousRates;
}

function isRateAnomalous(row) {
    return findAnomalousRates().has(row);
}

const RATE_ANOMALY_NOTE = "Lower than this lender's rates at smaller loan-to-values, which is unlikely. The research couldn't tell this lender's product segments apart, so check it with the lender.";

// OUTDATED rows are kept in the research for audit only, never shown as facts.
function isDisplayable(row) {
    return (row.status || row.data_status) !== "OUTDATED";
}


/* ---------- 4. Glossary tooltips ---------- */

// Builds one regex that matches every glossary term (and alias) as a whole word.
let glossaryPattern = null;
const glossaryLookup = {};
const STATUS_TERMS = ["SUPPORTED", "UNCONFIRMED", "NOT DISCLOSED", "NOT VERIFIED"];

function buildGlossaryPattern() {
    const glossary = window.LOAND_GLOSSARY || {};
    Object.entries(glossary).forEach(([key, entry]) => {
        if (STATUS_TERMS.includes(key)) return; // status labels are used by badges only
        glossaryLookup[key] = key;
        (entry.aliases || []).forEach(alias => { glossaryLookup[alias] = key; });
    });
    const words = Object.keys(glossaryLookup)
        .filter(word => word === word.toUpperCase())   // auto-link acronyms only
        .sort((a, b) => b.length - a.length)            // "APRC" before "APR"
        .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    glossaryPattern = words.length ? new RegExp(`\\b(${words.join("|")})\\b`, "g") : null;
}

// Escapes research text, then wraps the first use of each acronym in a tooltip.
function glossarize(text) {
    const safe = escapeHtml(text);
    if (!glossaryPattern) return safe;
    const seen = new Set();
    return safe.replace(glossaryPattern, match => {
        const key = glossaryLookup[match];
        if (seen.has(key)) return match;
        seen.add(key);
        return `<span class="term" data-term="${key}" tabindex="0">${match}</span>`;
    });
}

// One shared tooltip element, positioned next to whichever term is active.
// It lives on <body> so scrolling tables and accordions can't clip it.
function setUpGlossaryTooltips() {
    const glossary = window.LOAND_GLOSSARY;
    if (!glossary) return;

    const tip = document.createElement("div");
    tip.id = "glossary-tip";
    tip.className = "glossary-tip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    document.body.appendChild(tip);

    let activeTerm = null;

    function show(term) {
        const entry = glossary[term.dataset.term];
        if (!entry) return;
        activeTerm = term;
        tip.innerHTML = `<strong>${escapeHtml(entry.name)}</strong>${escapeHtml(entry.text)}`;
        tip.hidden = false;
        term.setAttribute("aria-describedby", "glossary-tip");

        const rect = term.getBoundingClientRect();
        const width = Math.min(300, window.innerWidth - 24);
        tip.style.width = width + "px";
        let left = rect.left + rect.width / 2 - width / 2;
        left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
        tip.style.left = left + "px";
        const below = rect.bottom + 8;
        const fitsBelow = below + tip.offsetHeight < window.innerHeight;
        tip.style.top = (fitsBelow ? below : rect.top - tip.offsetHeight - 8) + "px";
    }

    function hide() {
        if (activeTerm) activeTerm.removeAttribute("aria-describedby");
        activeTerm = null;
        tip.hidden = true;
    }

    // Event delegation: one listener covers terms added to the page later.
    document.addEventListener("mouseover", event => {
        const term = event.target.closest(".term");
        if (term && term !== activeTerm) show(term);
        if (!term && activeTerm) hide();
    });
    document.addEventListener("focusin", event => {
        const term = event.target.closest(".term");
        term ? show(term) : hide();
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape") hide(); });
    window.addEventListener("scroll", hide, { passive: true });

    // Terms written by hand in the HTML need to be focusable too.
    document.querySelectorAll(".term").forEach(term => term.setAttribute("tabindex", "0"));
}


/* ---------- 5. Theme (light / dark) ---------- */
// A small inline script in each page's <head> applies the saved choice
// before the page is drawn, so there's no flash of the wrong theme.
// This part handles the toggle button and tells charts when to redraw.

const THEME_KEY = "loand-theme";
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function currentTheme() {
    return document.documentElement.dataset.theme || (darkQuery.matches ? "dark" : "light");
}

// Reads a colour token such as "--ink" from the stylesheet, so JavaScript
// (e.g. Chart.js) uses the same palette as the CSS in either theme.
function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const THEME_ICONS = {
    // Shows what you'll switch TO: a moon in light mode, a sun in dark mode.
    dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
};

function updateThemeButtons() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.querySelectorAll('[data-action="toggle-theme"]').forEach(button => {
        button.innerHTML = THEME_ICONS[next];
        button.setAttribute("aria-label", `Switch to ${next} theme`);
        button.title = `Switch to ${next} theme`;
    });
}

function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch (error) { /* storage blocked: theme still applies for this visit */ }
    updateThemeButtons();
    document.dispatchEvent(new CustomEvent("loand:themechange"));
}

function setUpThemeToggle() {
    document.querySelectorAll('[data-action="toggle-theme"]').forEach(button => {
        button.addEventListener("click", () => setTheme(currentTheme() === "dark" ? "light" : "dark"));
    });
    // If the user hasn't chosen, follow their device when it switches.
    darkQuery.addEventListener("change", () => {
        if (!document.documentElement.dataset.theme) {
            updateThemeButtons();
            document.dispatchEvent(new CustomEvent("loand:themechange"));
        }
    });
    updateThemeButtons();
}


/* ---------- 6. Navigation ---------- */

// Mobile menu. The panel is in the page already; this opens and closes it,
// keeps focus inside while open, and closes on Escape or a scrim click.
function setUpDrawer() {
    const drawer = document.getElementById("menu-drawer");
    const opener = document.querySelector('[data-action="open-menu"]');
    if (!drawer || !opener) return;

    function setOpen(open) {
        drawer.dataset.open = String(open);
        opener.setAttribute("aria-expanded", String(open));
        document.body.style.overflow = open ? "hidden" : "";
        if (open) drawer.querySelector(".drawer-nav a, .drawer-nav button").focus();
        else opener.focus();
    }

    opener.addEventListener("click", () => setOpen(true));
    drawer.addEventListener("click", event => {
        // Closes on the scrim, the close button, or any link inside.
        if (event.target.closest('[data-action="close-menu"]') ||
            event.target.classList.contains("drawer-scrim") ||
            event.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && drawer.dataset.open === "true") setOpen(false);
    });
}

// In-page contents rail: highlights the section you're reading.
// IntersectionObserver reports when a heading crosses the viewport,
// which is far cheaper than measuring positions on every scroll event.
function setUpSectionNav() {
    const nav = document.querySelector(".sidebar-nav");
    if (!nav) return;
    const links = [...nav.querySelectorAll("a")];
    const sections = links
        .map(link => document.querySelector(link.getAttribute("href")))
        .filter(Boolean);
    if (!sections.length) return;

    const seen = new Set();
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => entry.isIntersecting ? seen.add(entry.target) : seen.delete(entry.target));
        const first = sections.find(section => seen.has(section));
        links.forEach(link => link.classList.toggle("is-active",
            Boolean(first) && link.getAttribute("href") === "#" + first.id));
        // The band is a thin strip a quarter of the way down the viewport,
        // clear of the sticky header, so the section you're reading wins.
    }, { rootMargin: "-25% 0px -65% 0px" });

    sections.forEach(section => observer.observe(section));
}


/* ---------- 7. Page setup ---------- */

function setUpLoanButtons() {
    // Finds every element marked data-action="loan-coming-soon".
    // If a page has none, the list is empty and nothing happens.
    const loanButtons = document.querySelectorAll('[data-action="loan-coming-soon"]');
    loanButtons.forEach(function (button) {
        button.addEventListener("click", loanComingSoon);
    });
}

// Fills any element marked data-source="S83" with a link to that source.
function fillSourceLinks() {
    document.querySelectorAll("[data-source]").forEach(element => {
        element.innerHTML = sourceLinks(element.dataset.source);
    });
}

// Fills any element marked data-fill="data-date" with the research date.
function fillResearchDates() {
    if (!RESEARCH) return;
    document.querySelectorAll('[data-fill="data-date"]').forEach(element => {
        element.textContent = formatDate(RESEARCH.meta.data_as_at);
    });
}

buildGlossaryPattern();
setUpThemeToggle();
setUpDrawer();
setUpSectionNav();
setUpLoanButtons();
setUpGlossaryTooltips();
fillResearchDates();
fillSourceLinks();
