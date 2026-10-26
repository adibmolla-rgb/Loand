/* WCAG 2.x contrast of the colour tokens in style.css, in both themes.
   Text needs 4.5:1; borders, focus rings and chart marks need 3:1. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8").replace(/\r\n/g, "\n");

function tokens(blockStart) {
    const start = css.indexOf(blockStart);
    assert.ok(start >= 0, `${blockStart} block exists`);
    const end = css.indexOf("}", start);
    const out = {};
    for (const [, name, value] of css.slice(start, end).matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6})\b/g)) out[name] = value;
    return out;
}

const light = tokens(":root {");
const dark = tokens(':root[data-theme="dark"] {');
const darkAuto = tokens(':root:not([data-theme="light"]) {');

function luminance(hex) {
    const channel = i => {
        const value = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
        return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
function ratio(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum ratio, what it is]
const PAIRS = [
    ["--ink", "--background", 4.5, "body text"],
    ["--ink", "--surface", 4.5, "text on cards"],
    ["--ink-soft", "--surface", 4.5, "secondary text"],
    ["--muted", "--background", 4.5, "muted text"],
    ["--muted", "--surface", 4.5, "muted text on cards"],
    ["--muted", "--soft", 4.5, "badges and table headers"],
    ["--faint", "--background", 4.5, "faint text (used for meta text)"],
    ["--faint", "--surface", 4.5, "faint text on cards"],
    ["--faint", "--soft", 4.5, "faint text on panels"],
    ["--caution", "--caution-bg", 4.5, "stale badges and notes"],
    ["--caution", "--surface", 4.5, "failed-check text"],
    ["--caution", "--background", 4.5, "caution text on page"],
    ["--good", "--surface", 4.5, "within-limits text"],
    ["--good", "--background", 4.5, "within-limits text on page"],
    ["--on-red", "--red", 4.5, "primary button text"],
    ["--red", "--surface", 4.5, "red links and text"],
    ["--red", "--background", 4.5, "red links on page"],
    ["--red", "--red-wash", 4.5, "red text on wash"],
    ["--tip-fg", "--tip-bg", 4.5, "tooltips"],
    ["--ink", "--soft", 4.5, "text on panels"],
    // Non-text: input borders, focus ring, chart marks.
    ["--control-border", "--surface", 3, "input, select and chip borders"],
    ["--control-border", "--background", 3, "input borders on the page"],
    ["--ink", "--surface", 3, "focus ring"],
    ["--chart-1", "--surface", 3, "chart line 1"],
    ["--chart-2", "--surface", 3, "chart line 2"],
    ["--chart-3", "--surface", 3, "chart line 3"],
    ["--chart-4", "--surface", 3, "chart line 4"],
    ["--chart-5", "--surface", 3, "chart line 5"]
];

for (const [themeName, theme] of [["light", light], ["dark", dark]]) {
    for (const [fg, bg, minimum, what] of PAIRS) {
        test(`${themeName}: ${what} (${fg} on ${bg}) is at least ${minimum}:1`, () => {
            assert.ok(theme[fg] && theme[bg], `${fg} and ${bg} are defined`);
            const actual = ratio(theme[fg], theme[bg]);
            assert.ok(actual >= minimum, `${theme[fg]} on ${theme[bg]} is ${actual.toFixed(2)}:1, needs ${minimum}:1`);
        });
    }
}

test("the automatic dark theme (device setting) uses the same colours as the toggled dark theme", () => {
    for (const name of Object.keys(dark).filter(key => !key.startsWith("--shadow"))) {
        assert.equal(darkAuto[name], dark[name], name);
    }
});
