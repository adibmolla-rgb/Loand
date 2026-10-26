/* ==========================================================
   LoanD – mortgage calculator page (mortgage.html)
   Reads the form and writes the results. All the maths lives
   in js/engine/calc.js (repayments, taxes, scenarios) and the
   lender limits check in js/engine/rules.js, both pure and tested.
   ========================================================== */

const form = document.getElementById("mortgage-form");

if (form) {
    const fields = {
        income: document.getElementById("income"),
        price: document.getElementById("price"),
        deposit: document.getElementById("deposit"),
        termYears: document.getElementById("term"),
        ratePercent: document.getElementById("rate"),
        monthlyDebts: document.getElementById("debts"),
        buyerType: document.getElementById("buyer-type"),
        propertyType: document.getElementById("property-type"),
        applicants: document.getElementById("applicants"),
        nation: document.getElementById("nation"),
        age: document.getElementById("age"),
        income2: document.getElementById("income2"),
        repaymentType: document.getElementById("repayment-type"),
        employment: document.getElementById("employment"),
        trading: document.getElementById("trading"),
        whatIfRate: document.getElementById("whatif-rate")
    };
    const TEXT_FIELDS = ["buyerType", "propertyType", "applicants", "nation", "repaymentType", "employment"];
    const additionalBox = document.getElementById("additional");

    const resultsPanel = document.getElementById("results");
    const scenariosBody = document.getElementById("scenarios-body");
    const limitsContainer = document.getElementById("limits");
    const ratesContainer = document.getElementById("band-rates");
    const ratesSummary = document.getElementById("band-rates-summary");
    const periodSelect = document.getElementById("rate-period");

    /* ----- Market figures and the default rate come from the research ----- */

    function marketMetric(startsWith) {
        return RESEARCH ? RESEARCH.market_rates.find(row => row.metric.startsWith(startsWith)) : null;
    }

    function renderMarketStrip() {
        const strip = document.getElementById("market-strip");
        if (!strip) return;
        const items = [
            { label: '<span class="term" data-term="Bank Rate">Bank Rate</span>', row: marketMetric("Bank of England Bank Rate") },
            { label: "Average 2-year fixed rate", row: marketMetric("Average 2-year fixed") },
            { label: "Average 5-year fixed rate", row: marketMetric("Average 5-year fixed") }
        ].filter(item => item.row);

        strip.innerHTML = items.map(item => `
            <div class="market-item">
                <span class="market-label">${item.label}</span>
                <span class="market-value">${escapeHtml(item.row.value)}</span>
                <span class="market-meta">${escapeHtml(formatDate(item.row.date))} ${statusBadge(item.row.status)} ${sourceLinks(item.row.source_id)}</span>
            </div>`).join("") + `<a class="market-link" href="market.html">See trends</a>`;
    }

    function setDefaultRate() {
        const average = marketMetric("Average 2-year fixed");
        const hint = document.getElementById("rate-hint");
        if (!average) return;
        fields.ratePercent.value = parseFloat(average.value);
        hint.innerHTML = `Starting point: the average 2-year <span class="term" data-term="Fixed rate">fixed rate</span>, `
            + `${escapeHtml(average.value)} on ${escapeHtml(formatDate(average.date))} ${sourceLinks(average.source_id)}. Replace it with a quoted rate, or pick one from the rates table below.`;
    }

    /* ----- Reading and checking the form ----- */

    function readInputs() {
        const values = {};
        for (const [name, input] of Object.entries(fields)) {
            if (TEXT_FIELDS.includes(name)) { values[name] = input.value; continue; }
            values[name] = input.value.trim() === "" ? NaN : Number(input.value);
        }
        if (Number.isNaN(values.monthlyDebts)) values.monthlyDebts = 0;
        if (Number.isNaN(values.age)) values.age = null;
        if (Number.isNaN(values.income2)) values.income2 = 0;
        // Lenders' income rules use the combined income of everyone on the application.
        values.income1 = values.income;
        values.income = values.income + (values.applicants === "joint" ? values.income2 : 0);
        values.selfEmployed = values.employment === "self-employed";
        values.yearsTrading = values.selfEmployed && !Number.isNaN(values.trading) ? values.trading : null;
        values.customRate = Number.isNaN(values.whatIfRate) ? null : values.whatIfRate;
        values.additionalProperty = additionalBox.checked && values.buyerType !== "remortgage";
        return values;
    }

    function findProblem(v) {
        if (!(v.income1 > 0)) return "Enter your yearly income before tax.";
        if (v.income2 < 0) return "The second applicant's income can't be negative.";
        if (v.yearsTrading !== null && !(v.yearsTrading >= 0)) return "Years trading can't be negative.";
        if (v.customRate !== null && !(v.customRate >= 0 && v.customRate <= 20)) return "Enter a 'rates rose to' figure between 0% and 20%, or leave it blank.";
        if (!(v.price > 0)) return "Enter the property price.";
        if (!(v.deposit >= 0)) return "Enter your deposit (0 if none).";
        if (v.deposit >= v.price) return "Your deposit covers the whole price, so you wouldn't need a mortgage.";
        if (!(v.termYears >= 5 && v.termYears <= 40)) return "Choose a term between 5 and 40 years.";
        if (!(v.ratePercent >= 0 && v.ratePercent <= 20)) return "Enter an interest rate between 0% and 20%.";
        if (v.monthlyDebts < 0) return "Monthly credit repayments can't be negative.";
        if (v.age !== null && !(v.age >= 16 && v.age <= 100)) return "Enter an age between 16 and 100, or leave it blank.";
        return null;
    }

    /* ----- Plain-English explanations ----- */

    function explainIncomeMultiple(r) {
        const multiple = r.incomeMultiple.toFixed(2) + "×";
        if (r.incomeMultiple <= STANDARD_LTI) {
            return { tone: "info", text: `Your loan is ${multiple} your income. That's within ${STANDARD_LTI}×, the standard limit used by several lenders in our research.` };
        }
        if (r.incomeMultiple <= HIGHEST_LTI) {
            return { tone: "caution", text: `Your loan is ${multiple} your income, above the standard ${STANDARD_LTI}×. Some lenders go higher, but only for specific incomes, deposits or customer types. <a href="#limits-heading">See each lender's limits for your figures</a>.` };
        }
        return { tone: "caution", text: `Your loan is ${multiple} your income. That's above ${HIGHEST_LTI}×, the highest multiple found in our research.` };
    }

    function explainLtv(r) {
        const ltv = formatPercent(r.ltv);
        if (r.ltv <= 60) return { tone: "info", text: `At ${ltv} <span class="term" data-term="LTV">LTV</span> you're in the lowest band lenders use, where rates are usually lowest.` };
        if (r.ltv <= MAINSTREAM_MAX_LTV) return { tone: "info", text: `At ${ltv} <span class="term" data-term="LTV">LTV</span> you're within the ${MAINSTREAM_MAX_LTV}% maximum most lenders in our research offer. Rates usually fall as LTV drops through 90%, 85%, 75% and 60%.` };
        return { tone: "caution", text: `At ${ltv} <span class="term" data-term="LTV">LTV</span> you're above ${MAINSTREAM_MAX_LTV}%. Only a few products in our research go higher, each with strict conditions: the Lloyds Banking Group £5,000 Deposit mortgage, Santander (up to 98%), and Barclays Family Springboard and Skipton Track Record (up to 100%).` };
    }

    function explainDti(r) {
        if (r.dti < DTI_THRESHOLD) return null;
        return { tone: "caution", text: `Your credit repayments are ${formatPercent(r.dti)} of your monthly income before tax. At ${DTI_THRESHOLD}% or more, Barclays limits borrowing to 4.0× income.` };
    }

    /* ----- Lenders' published limits ----- */

    // One "unit" per set of criteria: most lenders have one; Nationwide also
    // has Virgin Money, which keeps its own criteria and products.
    function buildUnits() {
        const units = [];
        (window.LOAND_LENDERS || []).forEach(lender => {
            const rules = RESEARCH.rules_numeric.filter(rule => rule.lender_group === lender.researchGroup);
            const rates = RESEARCH.mortgage_rates.filter(row =>
                row.lender_group === lender.researchGroup ||
                (lender.rateFilter && row.lender_group === lender.rateFilter.group && row.product.includes(lender.rateFilter.productIncludes)));
            const subBrands = lender.subBrands || [];
            const isSub = (row, sub) => row.brand_scope === sub.brandScope;
            const isSubRate = (row, sub) => row.product.startsWith(sub.productPrefix);

            units.push({
                name: lender.name, lenderId: lender.id,
                rules: rules.filter(rule => !subBrands.some(sub => isSub(rule, sub))),
                rates: rates.filter(row => !subBrands.some(sub => isSubRate(row, sub)))
            });
            subBrands.forEach(sub => units.push({
                name: sub.name, lenderId: lender.id,
                rules: rules.filter(rule => isSub(rule, sub)),
                rates: rates.filter(row => isSubRate(row, sub))
            }));
        });
        return units;
    }

    let units = [];

    function productMaxLtv(unit, user) {
        const ltvs = unit.rates
            .filter(row => row.status === "CONFIRMED" && rateMatchesBuyer(row, user.buyerType) && !SPECIAL_PRODUCT.test(row.product))
            .filter(row => row.max_loan === null || row.max_loan >= user.loan)
            .map(row => row.ltv_max).filter(value => typeof value === "number");
        return ltvs.length ? Math.max(...ltvs) : null;
    }

    function formatLimit(value, unit) {
        if (unit === "£") return formatPounds(value);
        if (unit === "%") return formatPercent(value);
        if (unit === "×") return value.toFixed(2).replace(/\.?0+$/, "") + "×";
        return `${value} ${unit}`;
    }

    const VERDICT_TEXT = {
        within: "Within published limits",
        outside: "Outside a published limit",
        partial: "Some limits not published"
    };

    function renderLimits(inputs, r) {
        const user = { ...inputs, loan: r.loan, ltv: r.ltv, incomeMultiple: r.incomeMultiple, dti: r.dti };
        const results = units.map(unit => {
            const result = checkLender(unit.rules, user, { productMaxLtv: productMaxLtv(unit, user) });
            return { unit, ...result, maxBorrowing: indicativeMaxBorrowing(result, user) };
        });
        const counts = { within: 0, outside: 0, partial: 0 };
        results.forEach(result => counts[result.verdict]++);

        const rows = results.map(({ unit, verdict, checks, failed, specials, unverified, maxBorrowing }) => {
            const headline = verdict === "outside"
                ? failed.map(check => `${check.label.replace(/ \(from current products\)/, "")}: ${formatLimit(check.limit, check.unit)} ${check.isMinimum ? "minimum" : "maximum"}`).join("; ")
                : VERDICT_TEXT[verdict];

            const checkRows = checks.map(check => check.unknown
                ? `<tr><th scope="row">${escapeHtml(check.label)}</th><td colspan="3" class="muted">Not published in our research</td></tr>`
                : `<tr>
                        <th scope="row">${escapeHtml(check.label)}</th>
                        <td class="num">${formatLimit(check.limit, check.unit)}</td>
                        <td class="num">${formatLimit(check.yours, check.unit)}</td>
                        <td><span class="check-mark ${check.pass ? "is-pass" : "is-fail"}">${check.pass ? "Within" : "Outside"}</span>
                            ${check.fromProducts ? '<span class="fact-meta">From the lender\'s current rate sheet.</span>' : sourceLinks([...new Set(check.rules.flatMap(rule => parseSourceIds(rule.source_id)))])}
                            ${check.note ? `<span class="fact-meta">${escapeHtml(check.note)}</span>` : ""}</td>
                   </tr>`).join("");

            const specialList = specials.length ? `
                <p class="group-heading">Possible with conditions</p>
                <ul class="plain-list">${specials.map(rule => `<li>${rule.rule_type === "max_ltv" ? "Up to " + rule.value_numeric + "% LTV" : "Up to " + rule.value_numeric + "× income"}: ${glossarize(rule.other_condition)} ${sourceLinks(rule.source_id)}</li>`).join("")}</ul>` : "";

            const unverifiedList = unverified.length ? `
                <p class="group-heading">Check with the lender</p>
                <ul class="plain-list">${unverified.map(rule => `<li>${glossarize(rule.related_criteria_row || rule.rule_type)} ${statusBadge(rule.status)} ${sourceLinks(rule.source_id)}</li>`).join("")}</ul>` : "";

            const borrowingLine = maxBorrowing ? `
                <p class="borrowing-line"><strong>Indicative maximum borrowing: ${formatPounds(maxBorrowing.amount)}</strong>,
                    limited by its ${maxBorrowing.limitedBy}${maxBorrowing.limitedBy === "income multiple" ? ` (${formatLimit(maxBorrowing.multiple, "×")} your income)` : ""}.
                    ${sourceLinks([...new Set(maxBorrowing.rules.flatMap(rule => parseSourceIds(rule.source_id)))])}
                    <span class="fact-meta">The lowest of this lender's published caps for your figures. Lenders' own affordability models aren't public, so what they would actually lend can be lower.</span></p>`
                : `<p class="borrowing-line muted">Indicative maximum borrowing: not published (no confirmed income multiple).</p>`;

            return `
                <details class="match match-${verdict}">
                    <summary>
                        <span class="match-name">${escapeHtml(unit.name)}</span>
                        <span class="match-verdict">${escapeHtml(headline)}</span>
                    </summary>
                    <div class="accordion-body">
                        <div class="table-scroll">
                            <table class="data-table">
                                <thead><tr><th scope="col">Published limit</th><th scope="col">Limit for you</th><th scope="col">Your figure</th><th scope="col">Result</th></tr></thead>
                                <tbody>${checkRows}</tbody>
                            </table>
                        </div>
                        ${borrowingLine}
                        ${specialList}${unverifiedList}
                        ${user.age ? "" : '<p class="fact-meta">Add your age above to check age limits too.</p>'}
                        ${user.selfEmployed && user.yearsTrading === null ? '<p class="fact-meta">Add your years trading above to check self-employed history rules.</p>' : ""}
                        <p><a href="lender.html?id=${unit.lenderId}">Full ${escapeHtml(unit.name)} criteria</a></p>
                    </div>
                </details>`;
        }).join("");

        limitsContainer.innerHTML = `
            <p class="limits-summary">
                <strong>${counts.within}</strong> within published limits,
                <strong>${counts.outside}</strong> outside at least one,
                <strong>${counts.partial}</strong> where key limits aren't published.
            </p>
            <div class="accordion match-list">${rows}</div>`;

        return counts;
    }

    /* ----- Rates for your LTV ----- */

    function unitNameForRate(row) {
        const unit = units.find(item => item.rates.includes(row));
        if (unit) return unit.name;
        const match = /\(([^)]+)\)/.exec(row.product);
        return match ? match[1] : row.lender_group;
    }

    function sourceLabel(row) {
        const source = findSource(parseSourceIds(row.source_id)[0]);
        const official = source && source.source_type.startsWith("Official");
        const dated = row.effective_date ? ` (from ${formatDate(row.effective_date)})` : "";
        return `${official ? "Official" + dated : "Third-party"} ${sourceLinks(row.source_id)}`;
    }

    function renderBandRates(inputs, r) {
        const months = periodSelect.value;
        const matching = RESEARCH.mortgage_rates.filter(row =>
            isDisplayable(row) && row.status !== "NOT VERIFIED" &&
            rateMatchesBuyer(row, inputs.buyerType) &&
            !SPECIAL_PRODUCT.test(row.product) &&
            ltvInBand(r.ltv, row.ltv_min, row.ltv_max) &&
            (row.max_loan === null || row.max_loan >= r.loan) &&
            (months === "all" || String(row.initial_period_months) === months));

        // Lowest initial rate per lender, deal length and rate type.
        const lowest = new Map();
        matching.forEach(row => {
            const key = `${unitNameForRate(row)}|${row.initial_period_months}|${row.rate_type}`;
            const current = lowest.get(key);
            if (!current || row.initial_rate_number < current.initial_rate_number) lowest.set(key, row);
        });
        const rows = [...lowest.values()].sort((a, b) =>
            (isRateAnomalous(a) ? 1 : 0) - (isRateAnomalous(b) ? 1 : 0) ||
            a.initial_rate_number - b.initial_rate_number);

        ratesSummary.innerHTML = `Rates for your LTV band <span class="count">${rows.length}</span>`;

        if (!rows.length) {
            ratesContainer.innerHTML = `<p>No products in our research match a ${formatPercent(r.ltv)} LTV with these settings.</p>`;
            return;
        }

        const oldest = rows.map(row => row.date_checked).sort()[0];
        const stale = daysSince(oldest) > RATE_STALE_AFTER_DAYS;

        ratesContainer.innerHTML = `
            <p class="${stale ? "note note-caution" : "table-intro"}">
                ${stale ? `Some of these rates were checked over a week ago (${formatDate(oldest)}) and may have changed.` : `Checked ${formatDate(oldest)} or later.`}
                The lowest rate per lender and deal length for ${inputs.buyerType === "first-time buyer" ? "first-time buyers" : "home movers"}, sorted by rate.
                Compare fees too: a lower rate can come with a higher fee.
                ${rows.some(isRateAnomalous) ? 'Rows marked <span class="flag">check</span> are cheaper than the same lender\'s smaller-loan bands, which is unlikely; confirm those with the lender.' : ""}
            </p>
            <div class="table-scroll">
                <table class="data-table">
                    <thead><tr>
                        <th scope="col">Lender</th><th scope="col">Deal</th><th scope="col"><span class="term" data-term="LTV">LTV</span> band</th>
                        <th scope="col">Initial rate</th><th scope="col">Product fee</th><th scope="col">Source</th><th scope="col"><span class="visually-hidden">Action</span></th>
                    </tr></thead>
                    <tbody>${rows.map(row => {
                        const lender = units.find(item => item.rates.includes(row));
                        const name = escapeHtml(unitNameForRate(row));
                        return `<tr>
                            <td>${lender ? `<a href="lender.html?id=${lender.lenderId}">${name}</a>` : name}</td>
                            <td>${row.initial_period_months ? row.initial_period_months / 12 + "-year " : ""}${glossarize(row.rate_type.toLowerCase())}</td>
                            <td>${escapeHtml(row.ltv_band)}</td>
                            <td class="num">${escapeHtml(row.initial_rate)}${isRateAnomalous(row) ? '<span class="flag" title="' + escapeHtml(RATE_ANOMALY_NOTE) + '" tabindex="0">check</span>' : ""}</td>
                            <td class="num">${escapeHtml(row.product_fee)}</td>
                            <td>${sourceLabel(row)} ${statusBadge(row.status)}</td>
                            <td><button type="button" class="text-button" data-use-rate="${row.initial_rate_number}">Use rate</button></td>
                        </tr>`;
                    }).join("")}</tbody>
                </table>
            </div>
            <p class="table-note">Products only for specific groups (such as Premier customers or shared ownership) are left out. Barclays and Lloyds Banking Group rates are a third-party snapshot, mostly for 60% LTV or less. Santander rates weren't available.</p>`;
    }

    /* ----- Results ----- */

    const isRemortgage = inputs => inputs.buyerType === "remortgage";
    let ltvBands = [];

    // Which pricing band the LTV falls in, and what a bigger deposit would change.
    function ltvBandLine(r, inputs) {
        const { band, next } = ltvBandFor(r.ltv, inputs.price, ltvBands);
        if (band === null) return `<p class="result-caption">Your LTV is above the highest band in our rate data (${ltvBands[ltvBands.length - 1]}%).</p>`;
        const move = next ? ` ${isRemortgage(inputs) ? "Keeping" : "Putting down"} ${formatPounds(next.extraDeposit)} more ${isRemortgage(inputs) ? "equity" : "deposit"} would move you into the ${next.ceiling}% band.` : "";
        return `<p class="result-caption">Pricing band: up to ${band}% <span class="term" data-term="LTV">LTV</span>.${move}</p>`;
    }

    function renderResults(inputs, r, tax, counts) {
        const notes = [explainIncomeMultiple(r), explainLtv(r), explainDti(r)].filter(Boolean);
        const checked = counts.within + counts.outside + counts.partial;
        // Keep the old figure so the new one can count to it.
        const previous = resultsPanel.querySelector(".result-figure");
        const previousValue = previous ? previous.dataset.value : null;

        resultsPanel.innerHTML = `
            <div class="results-head">
                <h2 class="results-title">Your estimate</h2>
                <span class="live-note">Updates as you type</span>
            </div>
            <p class="result-label">Estimated monthly repayment</p>
            <p class="result-figure">${formatPounds(r.monthly)}</p>
            <p class="result-caption">${inputs.repaymentType === "interest-only"
                ? `Over ${inputs.termYears} years at ${inputs.ratePercent}%, <strong>interest-only</strong>: you would still owe ${formatPounds(r.loan)} at the end, so lenders also ask how you will repay it.`
                : `Over ${inputs.termYears} years at ${inputs.ratePercent}% on a <span class="term" data-term="Repayment mortgage">repayment mortgage</span>.`}</p>

            <dl class="stat-grid">
                <div><dt>Loan amount</dt><dd>${formatPounds(r.loan)}</dd></div>
                <div><dt><span class="term" data-term="LTV">LTV</span></dt><dd>${formatPercent(r.ltv)}</dd></div>
                <div><dt>${isRemortgage(inputs) ? "Equity" : "Deposit"}</dt><dd>${formatPercent(r.depositPercent)}</dd></div>
                <div><dt>Income multiple</dt><dd>${r.incomeMultiple.toFixed(2)}×</dd></div>
            </dl>
            ${ltvBandLine(r, inputs)}

            ${tax ? `<p class="tax-line"><span>${escapeHtml(tax.name)} (${escapeHtml(inputs.nation)})</span> <strong>${formatPounds(tax.amount)}</strong></p>
            <p class="result-caption">${tax.surcharge ? escapeHtml(tax.surcharge) + " " : ""}${tax.relief ? escapeHtml(tax.relief) + " " : ""}${inputs.additionalProperty ? "" : "Assumes this will be your only home. "}${sourceLinks(tax.sources)}</p>`
                : `<p class="result-caption">No purchase tax applies to a remortgage.</p>`}

            <div class="borrowing">
                <p class="borrowing-label">Estimated borrowing capacity</p>
                <p class="borrowing-figure">${formatPounds(r.borrowingAtStandard)}</p>
                <p class="borrowing-caption">At ${STANDARD_LTI}× your income, a common standard limit. Some lenders allow up to ${formatPounds(r.borrowingAtHighest)} (${HIGHEST_LTI}×) in specific cases.</p>
            </div>

            <a class="limits-link" href="#limits-section">
                <span>Within published limits at <strong>${counts.within} of ${checked}</strong> lenders</span>
            </a>

            <ul class="notes">
                ${notes.map(note => `<li class="note note-${note.tone}">${note.text}</li>`).join("")}
            </ul>

            <p class="result-disclaimer">Indicative estimate only. It isn't an offer or an approval. Each lender runs its own affordability and credit checks.</p>

            <div class="next-steps">
                <p class="next-title">What next</p>
                <ol class="next-list">
                    <li><a href="#limits-section">Check your figures against each lender's limits</a></li>
                    <li><a href="#scenarios-section">See what changes if your deposit, rate or term moves</a></li>
                    <li><a href="compare.html">Compare lenders side by side</a></li>
                </ol>
            </div>
        `;

        const figure = resultsPanel.querySelector(".result-figure");
        figure.dataset.value = previousValue ?? r.monthly;
        countTo(figure, r.monthly, formatPounds);
    }

    function renderProblem(message) {
        resultsPanel.innerHTML = `
            <div class="results-head">
                <h2 class="results-title">Your estimate</h2>
                <span class="live-note">Updates as you type</span>
            </div>
            <p class="result-problem">${escapeHtml(message)}</p>`;
        updateJumpBar(null);
        scenariosBody.innerHTML = "";
        limitsContainer.innerHTML = `<p class="empty">Complete the form to check lenders' limits.</p>`;
        ratesContainer.innerHTML = "";
        ratesSummary.textContent = "Rates for your LTV band";
    }

    function renderScenarios(inputs, base) {
        const scenarios = whatIfScenarios(inputs, { customRate: inputs.customRate });

        scenariosBody.innerHTML = scenarios.map((scenario, index) => {
            if (scenario.inputs.deposit >= scenario.inputs.price) {
                return `<tr><th scope="row">${escapeHtml(scenario.label)}</th><td colspan="4">Deposit would cover the full price</td></tr>`;
            }
            const r = calculateMortgage(scenario.inputs);
            const difference = r.monthly - base.monthly;
            const change = index === 0 ? "" : (difference >= 0 ? "+" : "−") + formatPounds(Math.abs(difference));
            return `
                <tr${index === 0 ? ' class="row-base"' : ""}>
                    <th scope="row">${escapeHtml(scenario.label)}</th>
                    <td class="num">${formatPounds(r.monthly)}</td>
                    <td class="num">${change}</td>
                    <td class="num">${formatPercent(r.ltv)}</td>
                    <td class="num">${formatPounds(r.totalInterest)}</td>
                </tr>`;
        }).join("");
    }

    // Published stress rates: what the payment would be at the rate a lender
    // tests affordability against (only TSB publishes these).
    function renderStressRates(inputs, r) {
        const container = document.getElementById("stress-rates");
        if (!container || !RESEARCH) return;
        const published = RESEARCH.stress_and_benchmarks.filter(row => row.value_numeric !== null && /Stress rate/.test(row.item));
        const regulation = RESEARCH.stress_and_benchmarks.find(row => row.item.startsWith("FCA MCOB"));
        container.innerHTML = `
            ${regulation ? `<p>${glossarize(regulation.detail)}. ${sourceLinks(regulation.source_id)}</p>` : ""}
            <p>Most lenders don't publish the rate they test against. For the one that does in our research, your repayment at that rate would be:</p>
            <ul class="plain-list">${published.map(row => {
                const stress = stressRate(row.value_numeric, inputs.ratePercent);
                const why = stress.basis === "published"
                    ? `The published ${row.value_numeric.toFixed(2)}% is higher than your rate plus 1 point (${(inputs.ratePercent + 1).toFixed(2)}%), so it applies.`
                    : `Your rate plus 1 point (${stress.rate.toFixed(2)}%) is higher than the published ${row.value_numeric.toFixed(2)}%, so that applies.`;
                return `
                <li><strong>${escapeHtml(row.lender_scope)}, ${escapeHtml(row.item.replace("Stress rate - ", "").toLowerCase())}:</strong>
                    ${formatPounds(calculateMonthlyPayment(r.loan, stress.rate, inputs.termYears, inputs.repaymentType))} a month
                    at ${stress.rate.toFixed(2)}%. ${escapeHtml(row.lender_scope)} states: "${escapeHtml(row.detail)}". ${why} ${sourceLinks(row.source_id)}</li>`;
            }).join("")}
            </ul>`;
    }

    // Results stay hidden until the person presses Calculate, so the page
    // has one clear action. After that they update live, which makes the
    // what-if changes (deposit, rate, term) immediate.
    let hasCalculated = false;

    function renderPrompt() {
        resultsPanel.innerHTML = `
            <div class="results-head">
                <h2 class="results-title">Your estimate</h2>
            </div>
            <p class="result-waiting">Fill in your details, then press <strong>Calculate my estimate</strong>.</p>
            <p class="result-caption">You'll get your monthly repayment, how much you could borrow, the purchase tax, and how your figures compare with each lender's published limits.</p>`;
        scenariosBody.innerHTML = "";
        limitsContainer.innerHTML = `<p class="empty">Press Calculate to check your figures against lenders' limits.</p>`;
        ratesContainer.innerHTML = "";
        updateJumpBar(null);
    }

    function update() {
        if (!hasCalculated) return;
        const inputs = readInputs();
        const problem = findProblem(inputs);
        if (problem) { renderProblem(problem); return; }
        const result = calculateMortgage(inputs);
        const tax = isRemortgage(inputs) ? null
            : calculatePropertyTax(inputs.price, inputs.nation, inputs.buyerType === "first-time buyer", RESEARCH.property_taxes, { additionalProperty: inputs.additionalProperty });
        const counts = renderLimits(inputs, result);
        renderResults(inputs, result, tax, counts);
        renderScenarios(inputs, result);
        renderBandRates(inputs, result);
        renderStressRates(inputs, result);
        updateJumpBar(result.monthly);
    }

    /* ----- Level 3: schemes and lender checks, straight from the research ----- */

    function renderSchemes() {
        const container = document.getElementById("schemes");
        if (!container || !RESEARCH) return;
        const schemes = RESEARCH.support_schemes.filter(row =>
            isDisplayable(row) && /Government|MoD/.test(row.type));
        container.innerHTML = `<ul class="fact-list">${schemes.map(row => `
            <li class="scheme">
                <p class="fact-title">${escapeHtml(row.scheme_product)} ${statusBadge(row.data_status)}</p>
                <p class="fact-status">${escapeHtml(row.status_sep_2026)}</p>
                <p>${glossarize(row.description)}</p>
                <p class="fact-meta">${glossarize(row.key_limits)} ${sourceLinks(row.source_id)}</p>
            </li>`).join("")}</ul>`;
    }

    function renderLenderChecks() {
        const container = document.getElementById("lender-checks");
        if (!container || !RESEARCH) return;
        const rows = [
            RESEARCH.affordability.find(row => row.criterion === "Internal scoring models"),
            RESEARCH.credit_requirements.find(row => row.criterion === "Minimum credit score")
        ].filter(Boolean);
        container.innerHTML = rows.map(row =>
            `<p>${glossarize(row.value)}. ${statusBadge(row.status)} ${sourceLinks(row.source_id)}</p>`).join("");
    }

    // On narrow screens the estimate sits below the whole form, so a bar
    // pinned to the bottom of the screen carries the figure and a way to it.
    const jumpBar = document.getElementById("jump-bar");

    function updateJumpBar(monthly) {
        if (!jumpBar) return;
        jumpBar.hidden = monthly === null;
        if (monthly === null) return;
        jumpBar.querySelector(".jump-figure").textContent = formatPounds(monthly);
    }


    /* ----- Wiring ----- */

    // Shows only the fields that apply, and renames price/deposit for a remortgage.
    // (Registered before the update listeners so the form is in shape when results are built.)
    function syncForm() {
        const remortgage = fields.buyerType.value === "remortgage";
        const joint = fields.applicants.value === "joint";
        document.getElementById("income2-field").hidden = !joint;
        document.getElementById("income-label").textContent = joint ? "First applicant's yearly income before tax" : "Yearly income before tax";
        document.getElementById("trading-field").hidden = fields.employment.value !== "self-employed";
        document.getElementById("additional-field").hidden = remortgage;
        document.querySelector('label[for="price"]').textContent = remortgage ? "Current property value" : "Property price";
        document.querySelector('label[for="deposit"]').textContent = remortgage ? "Equity you keep (value minus new loan)" : "Deposit";
    }
    form.addEventListener("change", syncForm);

    // Once calculated, "input" and "change" keep the figures live.
    form.addEventListener("input", update);
    form.addEventListener("change", update);

    form.addEventListener("submit", event => {
        event.preventDefault();
        const problem = findProblem(readInputs());
        const note = document.getElementById("calculate-note");

        if (problem) {
            // Say what's wrong next to the button, where they're looking.
            note.textContent = problem;
            note.classList.add("is-problem");
            return;
        }

        note.textContent = "Your estimate updates as you change anything above.";
        note.classList.remove("is-problem");
        hasCalculated = true;
        update();

        // Bring the answer into view: beside the form on wide screens,
        // below it on narrow ones.
        resultsPanel.scrollIntoView({ behavior: motionQuery.matches ? "auto" : "smooth", block: "start" });
        resultsPanel.setAttribute("tabindex", "-1");
        resultsPanel.focus({ preventScroll: true });
    });
    periodSelect.addEventListener("change", update);

    // One listener for every "Use rate" button, including ones added later.
    ratesContainer.addEventListener("click", event => {
        const button = event.target.closest("[data-use-rate]");
        if (!button) return;
        fields.ratePercent.value = button.dataset.useRate;
        update();
        fields.ratePercent.focus();
    });

    if (RESEARCH) {
        units = buildUnits();
        ltvBands = ltvCeilings(RESEARCH.mortgage_rates.filter(isDisplayable));
        syncForm();
        renderMarketStrip();
        setDefaultRate();
        renderSchemes();
        renderLenderChecks();
        renderPrompt();
    } else {
        resultsPanel.innerHTML = `<p class="result-problem">The research data couldn't be loaded.</p>`;
    }
}
