/* ==========================================================
   LoanD – glossary
   Keys are the exact text that gets a tooltip. `aliases` lets
   plurals or variants (e.g. "CCJs") reuse one definition.
   ========================================================== */

window.LOAND_GLOSSARY = {
    "LTV": {
        name: "Loan-to-value (LTV)",
        text: "The percentage of the property's value that you're borrowing. A £225,000 loan on a £250,000 home is 90% LTV. A bigger deposit means a lower LTV, which usually unlocks lower rates."
    },
    "LTI": {
        name: "Loan-to-income (LTI)",
        text: "How many times your yearly income you're borrowing. Lenders cap this; 4.49× is a common standard limit."
    },
    "DTI": {
        name: "Debt-to-income (DTI)",
        text: "Your monthly debt repayments (loans, cards, finance) as a percentage of your monthly income before tax."
    },
    "APR": {
        name: "Annual percentage rate (APR)",
        text: "The yearly cost of a loan including interest and standard fees, so you can compare loans fairly."
    },
    "Representative APR": {
        name: "Representative APR",
        text: "The rate at least 51% of accepted applicants get. You could be offered a higher rate. It is not an approval rate."
    },
    "APRC": {
        name: "Annual percentage rate of charge (APRC)",
        text: "The mortgage version of APR. It assumes you stay on the lender's standard rate after any deal ends, so it's usually higher than the initial rate."
    },
    "SVR": {
        name: "Standard variable rate (SVR)",
        text: "The lender's default rate, which you usually move onto when a fixed or tracker deal ends. It's often much higher, and the lender can change it."
    },
    "ERC": {
        name: "Early repayment charge (ERC)",
        text: "A fee for paying off or leaving a mortgage deal early, usually a percentage of what you owe."
    },
    "Tracker": {
        name: "Tracker mortgage",
        text: "A variable rate that follows the Bank of England Bank Rate plus a set margin, so your payments rise and fall with it."
    },
    "Fixed rate": {
        name: "Fixed rate",
        text: "Your interest rate, and so your monthly payment, stays the same for a set period, such as 2 or 5 years."
    },
    "Variable rate": {
        name: "Variable rate",
        text: "An interest rate that can go up or down during the deal, so your monthly payment can change."
    },
    "BBR": {
        name: "Bank Rate (BBR)",
        text: "The Bank of England's base interest rate. Tracker mortgages move with it, and it influences other rates."
    },
    "Bank Rate": {
        name: "Bank Rate",
        text: "The Bank of England's base interest rate. Tracker mortgages move with it, and it influences other rates."
    },
    "CCJ": {
        name: "County Court Judgment (CCJ)",
        text: "A court order to repay a debt. It stays on your credit file for 6 years and makes borrowing harder.",
        aliases: ["CCJs"]
    },
    "IVA": {
        name: "Individual Voluntary Arrangement (IVA)",
        text: "A formal, legally binding agreement to repay creditors over time. It's a form of insolvency."
    },
    "DRO": {
        name: "Debt Relief Order (DRO)",
        text: "A form of insolvency for people with low income and debts that writes debts off after 12 months."
    },
    "DMP": {
        name: "Debt management plan (DMP)",
        text: "An informal agreement to pay creditors reduced amounts. It shows on your credit file."
    },
    "FTB": {
        name: "First-time buyer (FTB)",
        text: "Someone buying their first home. Lenders define it differently, e.g. Nationwide requires no mortgage in the last 3 years.",
        aliases: ["FTBs"]
    },
    "BTL": {
        name: "Buy-to-let (BTL)",
        text: "A mortgage for a property you plan to rent out rather than live in."
    },
    "JBSP": {
        name: "Joint borrower sole proprietor (JBSP)",
        text: "A family member helps pay the mortgage and is named on it, but only you own the home."
    },
    "Interest-only": {
        name: "Interest-only",
        text: "You pay just the interest each month, so the original loan is still owed at the end and needs a plan to repay it."
    },
    "Repayment mortgage": {
        name: "Repayment (capital and interest)",
        text: "Each payment covers interest plus part of the loan, so the mortgage is fully paid off by the end of the term."
    },
    "Remortgage": {
        name: "Remortgage",
        text: "Moving your existing mortgage to a new deal, usually with a different lender."
    },
    "Product transfer": {
        name: "Product transfer",
        text: "Switching to a new deal with the lender you already have, usually with fewer checks than a remortgage."
    },
    "Porting": {
        name: "Porting",
        text: "Moving your current mortgage deal to a new home when you move, so you avoid early repayment charges."
    },
    "Stress test": {
        name: "Stress test",
        text: "A lender check of whether you could still afford payments if interest rates rose."
    },

    /* Research status labels (shown as badges) */
    "SUPPORTED": {
        name: "Supported",
        text: "Backed by several credible sources, or indirectly by an official one, but not stated in one official place for this exact case."
    },
    "UNCONFIRMED": {
        name: "Unconfirmed",
        text: "Some evidence exists, usually one third-party source, but it isn't confirmed. Check with the lender."
    },
    "NOT DISCLOSED": {
        name: "Not disclosed",
        text: "The lender doesn't publish this. We checked their official pages."
    },
    "NOT VERIFIED": {
        name: "Not yet verified",
        text: "This probably exists but we couldn't retrieve it in this research pass. It doesn't mean the lender keeps it private."
    }
};
