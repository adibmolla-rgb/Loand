/* ==========================================================
   LoanD – market trends (market.html)
   Charts built from the Time_Series sheet (Bank of England
   data). Everything here is historical context, not offers.
   Chart.js is loaded from a CDN in market.html.
   ========================================================== */

const marketRoot = document.getElementById("market-charts");

if (marketRoot && RESEARCH && window.Chart) {
    const series = name => RESEARCH.time_series
        .filter(row => row.series === name && row.status === "CONFIRMED" && typeof row.value_numeric === "number")
        .sort((a, b) => a.date.localeCompare(b.date));

    const monthKey = date => date.slice(0, 7);
    const monthLabel = key => {
        const [year, month] = key.split("-").map(Number);
        return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    };

    // Lines on one chart share the same months, matched by "YYYY-MM".
    function aligned(names) {
        const data = names.map(name => new Map(series(name).map(row => [monthKey(row.date), row.value_numeric])));
        const keys = [...new Set(data.flatMap(map => [...map.keys()]))].sort();
        return { keys, values: data.map(map => keys.map(key => map.has(key) ? map.get(key) : null)) };
    }

    function palette() {
        return ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"].map(cssVar);
    }

    function baseOptions(yTitle, format) {
        const ink = cssVar("--muted"), grid = cssVar("--line");
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { position: "bottom", labels: { color: ink, boxWidth: 12, font: { family: "Manrope" } } },
                tooltip: { callbacks: { label: context => `${context.dataset.label}: ${format(context.parsed.y)}` } }
            },
            scales: {
                x: { ticks: { color: ink, maxTicksLimit: 8, font: { family: "Manrope" } }, grid: { display: false } },
                y: { title: { display: true, text: yTitle, color: ink }, ticks: { color: ink, callback: format, font: { family: "Manrope" } }, grid: { color: grid } }
            }
        };
    }

    const percent = value => value === null ? "n/a" : value.toFixed(2) + "%";
    const count = value => value === null ? "n/a" : Math.round(value).toLocaleString("en-GB");
    const charts = [];

    /* ----- Chart 1: mortgage rates against Bank Rate ----- */
    function ratesChart() {
        const lines = [
            ["Bank Rate - month end", "Bank Rate"],
            ["BoE quoted rate - 2yr fixed 75% LTV", "2-year fixed, 75% LTV"],
            ["BoE quoted rate - 2yr fixed 95% LTV", "2-year fixed, 95% LTV"],
            ["BoE quoted rate - 5yr fixed 75% LTV", "5-year fixed, 75% LTV"],
            ["BoE quoted rate - revert-to rate (SVR proxy)", "Revert-to rate"]
        ];
        const { keys, values } = aligned(lines.map(line => line[0]));
        const colours = palette();
        return {
            type: "line",
            data: {
                labels: keys.map(monthLabel),
                datasets: lines.map((line, index) => ({
                    label: line[1], data: values[index], borderColor: colours[index], backgroundColor: colours[index],
                    borderWidth: index === 0 ? 3 : 2, pointRadius: 0, tension: 0.25, spanGaps: true
                }))
            },
            options: baseOptions("Interest rate", percent),
            takeaway: () => {
                // Latest month where every line has a value, so figures match the month named.
                let index = keys.length - 1;
                while (index > 0 && values.some(line => line[index] === null)) index--;
                const last = values.map(line => line[index]);
                return `In ${monthLabel(keys[index])}, the average quoted 2-year fixed rate at 75% LTV was ${percent(last[1])}, `
                    + `${(last[1] - last[0]).toFixed(2)} points above Bank Rate (${percent(last[0])}). The revert-to rate, what borrowers pay when a deal ends, was ${percent(last[4])}.`;
            }
        };
    }

    /* ----- Chart 2: how LTV changes the rate (latest month) ----- */
    function ltvChart() {
        const bands = [60, 75, 85, 90, 95];
        const latest = bands.map(band => {
            const rows = series(`BoE quoted rate - 2yr fixed ${band}% LTV`);
            return rows[rows.length - 1];
        });
        const month = monthLabel(monthKey(latest[latest.length - 1].date));
        return {
            type: "bar",
            data: {
                labels: bands.map(band => `Up to ${band}%`),
                datasets: [{ label: `2-year fixed, ${month}`, data: latest.map(row => row.value_numeric), backgroundColor: cssVar("--chart-2"), borderRadius: 6 }]
            },
            options: { ...baseOptions("Interest rate", percent), plugins: { ...baseOptions("", percent).plugins, legend: { display: false } } },
            takeaway: () => {
                const gap = latest[4].value_numeric - latest[0].value_numeric;
                return `In ${month}, borrowing 95% of the price cost ${gap.toFixed(2)} points more than borrowing 60% on an average 2-year fix `
                    + `(${percent(latest[4].value_numeric)} against ${percent(latest[0].value_numeric)}). That's why a bigger deposit usually means a lower rate.`;
            }
        };
    }

    /* ----- Chart 3: mortgage approvals (counts, not rates) ----- */
    function approvalsChart() {
        const lines = [
            ["BoE mortgage approvals - house purchase (seasonally adjusted)", "Buying a home"],
            ["BoE mortgage approvals - remortgaging with a different lender (SA)", "Remortgaging with a new lender"]
        ];
        const { keys, values } = aligned(lines.map(line => line[0]));
        const colours = palette();
        return {
            type: "line",
            data: {
                labels: keys.map(monthLabel),
                datasets: lines.map((line, index) => ({
                    label: line[1], data: values[index], borderColor: colours[index === 0 ? 0 : 2], backgroundColor: colours[index === 0 ? 0 : 2],
                    borderWidth: 2, pointRadius: 0, tension: 0.25, spanGaps: true
                }))
            },
            options: baseOptions("Approvals per month", count),
            takeaway: () => {
                const purchase = values[0].filter(value => value !== null);
                const lastKey = keys[values[0].lastIndexOf(purchase[purchase.length - 1])];
                const peak = Math.max(...purchase);
                return `${count(purchase[purchase.length - 1])} mortgages for buying a home were approved in ${monthLabel(lastKey)}, `
                    + `compared with a high of ${count(peak)} in the period shown. These are counts of approvals, not approval rates.`;
            }
        };
    }

    const definitions = { "chart-rates": ratesChart, "chart-ltv": ltvChart, "chart-approvals": approvalsChart };

    function drawAll() {
        charts.forEach(chart => chart.destroy());
        charts.length = 0;
        Object.entries(definitions).forEach(([id, build]) => {
            const canvas = document.getElementById(id);
            if (!canvas) return;
            const config = build();
            const takeaway = canvas.closest(".chart-card").querySelector(".chart-takeaway");
            takeaway.textContent = config.takeaway();
            canvas.setAttribute("aria-label", takeaway.textContent);
            delete config.takeaway;
            charts.push(new Chart(canvas, config));
        });
    }

    function renderReports() {
        const container = document.getElementById("market-reports");
        if (!container) return;
        const rows = [...RESEARCH.market_reports].sort((a, b) => (b.date_iso || "").localeCompare(a.date_iso || ""));
        container.innerHTML = `<ul class="fact-list">${rows.map(row => `
            <li class="fact">
                <p class="fact-title">${escapeHtml(row.organisation)}: ${escapeHtml(row.report)}</p>
                <div class="fact-body">
                    <p class="fact-value">${glossarize(row.key_relevant_findings)}</p>
                    <p class="fact-meta">${escapeHtml(formatDate(row.date_iso || row.date))}. ${sourceLinks(row.source_id)}</p>
                </div>
            </li>`).join("")}</ul>`;
    }

    function renderLatest() {
        const strip = document.getElementById("market-latest");
        if (!strip) return;
        strip.innerHTML = RESEARCH.market_rates.map(row => `
            <div class="market-item">
                <span class="market-label">${escapeHtml(row.metric)}</span>
                <span class="market-value">${escapeHtml(row.value)}</span>
                <span class="market-meta">${escapeHtml(formatDate(row.date_iso || row.date))} ${statusBadge(row.status)} ${sourceLinks(row.source_id)}</span>
            </div>`).join("");
    }

    drawAll();
    renderReports();
    renderLatest();
    // Charts read colours from CSS, so redraw them when the theme changes.
    document.addEventListener("loand:themechange", drawAll);
} else if (marketRoot) {
    marketRoot.innerHTML = `<p class="empty">The charts couldn't load. Check your internet connection: the chart library comes from a CDN.</p>`;
}
