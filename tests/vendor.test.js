/* The vendored Chart.js must be exactly the release we reviewed. If this fails
   after an intentional upgrade, check the new file against the hash cdnjs
   publishes for that version, then update the constant and the README. */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const CHARTJS_4_4_1_SHA512 = "sha512-CQBWl4fJHWbryGE+Pc7UAxWMUMNMWzWxF4SQo9CgkJIN1kx6djDQZjh3Y8SZ1d+6I+1zze6Z7kHXO7q3UyZAWw==";

test("vendored Chart.js 4.4.1 matches the hash cdnjs publishes for that release", () => {
    const file = fs.readFileSync(path.join(root, "js", "vendor", "chart.umd.min.js"));
    assert.equal("sha512-" + crypto.createHash("sha512").update(file).digest("base64"), CHARTJS_4_4_1_SHA512);
});

test("its licence ships with it", () => {
    assert.match(fs.readFileSync(path.join(root, "js", "vendor", "chartjs-LICENSE.md"), "utf8"), /MIT License/);
});

test("no page loads scripts from a third-party host", () => {
    for (const name of fs.readdirSync(root).filter(file => file.endsWith(".html"))) {
        const html = fs.readFileSync(path.join(root, name), "utf8");
        const external = [...html.matchAll(/<script[^>]+src="(https?:[^"]+)"/g)].map(match => match[1]);
        assert.deepEqual(external, [], `${name} loads ${external.join(", ")}`);
    }
});
