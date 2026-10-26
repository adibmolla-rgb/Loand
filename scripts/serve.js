/* Usage: node scripts/serve.js [port]
   A tiny static file server for previewing the site locally (default port 4173).
   Not used in production: the site is plain static files. */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.argv[2]) || 4173;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".pdf": "application/pdf", ".svg": "image/svg+xml" };

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.normalize(path.join(ROOT, urlPath === "/" ? "index.html" : urlPath));
    if (!file.startsWith(ROOT) || file.includes(`${path.sep}.git${path.sep}`)) { res.writeHead(403).end("Forbidden"); return; }
    fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(404).end("Not found"); return; }
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" }).end(data);
    });
}).listen(PORT, () => console.log(`Loand preview at http://localhost:${PORT}`));
