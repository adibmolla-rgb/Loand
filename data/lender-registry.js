/* ==========================================================
   LoanD – lender registry
   ----------------------------------------------------------
   research.js holds the raw research tables (one per sheet).
   This file holds what research.js can't: a stable ID per
   lender, which research rows belong to it, and a short
   plain-English summary for the top of each profile.

   Rules for this file:
   - Summary wording must restate the research, never add to it.
   - Every summary carries the source IDs it came from.
   - IDs never change, even when a brand does (e.g. Halifax
     becoming Lloyds), so saved links and future database
     rows keep working.

   Later, each object here becomes a row in a `lender` table.
   ========================================================== */

window.LOAND_LENDERS = [
    {
        id: "hsbc",
        name: "HSBC UK",
        researchGroup: "HSBC UK",          // matches "Lender group" in research.js
        brands: ["HSBC UK"],               // matches "Lender" in the Lender_Overview sheet
        schemeKeywords: ["HSBC"],      // matches scheme names in Support_Schemes
        summary: {
            maxLtv: {
                value: "Up to 95%",
                detail: "Products up to 95% on HSBC's current rate pages. The general criteria maximum wasn't captured. New-build: 90% houses, 85% flats.",
                sources: ["S69", "S70", "S03"]
            },
            loans: {
                value: "£1,000 – £30,000",
                detail: "Premier Personal Loan: up to £50,000.",
                sources: ["S06", "S07"]
            }
        }
    },
    {
        id: "barclays",
        name: "Barclays",
        researchGroup: "Barclays",
        brands: ["Barclays"],
        schemeKeywords: ["Barclays"],      // matches scheme names in Support_Schemes
        summary: {
            maxLtv: {
                value: "Up to 95%",
                detail: "For houses with loans up to £640,000 and flats up to £310,000 (85% above). Up to 100% with Family Springboard.",
                sources: ["S10"]
            },
            loans: {
                value: "£1,000 – £50,000",
                detail: "Amount range from third-party sources. Existing Barclays customers only.",
                sources: ["S08", "S09"]
            }
        }
    },
    {
        id: "lloyds-banking-group",
        name: "Lloyds Banking Group",
        researchGroup: "Lloyds Banking Group",
        brands: ["Lloyds Bank", "Halifax", "Bank of Scotland"],
        schemeKeywords: ["Halifax", "Lloyds"],      // matches scheme names in Support_Schemes
        notice: {
            text: "The Halifax brand is changing to Lloyds. Halifax has stopped opening new accounts, and Halifax Intermediaries becomes Lloyds Intermediaries in Q1 2027.",
            sources: ["S14", "S15"]
        },
        summary: {
            maxLtv: {
                value: "Up to 95%",
                detail: "For loans up to £570,000. First-time buyers can go above 95% with the £5,000 Deposit mortgage.",
                sources: ["S13"]
            },
            loans: {
                value: "£1,000 – £50,000",
                detail: "Lloyds and Halifax personal loans. Bank of Scotland figures not verified.",
                sources: ["S16", "S17", "S18"]
            }
        }
    },
    {
        id: "natwest-group",
        name: "NatWest Group",
        researchGroup: "NatWest Group",
        brands: ["NatWest", "Royal Bank of Scotland"],
        schemeKeywords: ["NatWest"],      // matches scheme names in Support_Schemes
        summary: {
            maxLtv: {
                value: "Up to 95%",
                detail: "For loans up to £570,000.",
                sources: ["S21"]
            },
            loans: {
                value: "£1,000 – £50,000",
                detail: "Up to £35,000 for new NatWest customers.",
                sources: ["S22", "S23"]
            }
        }
    },
    {
        id: "santander",
        name: "Santander UK",
        researchGroup: "Santander UK",
        brands: ["Santander UK"],
        schemeKeywords: ["Santander"],      // matches scheme names in Support_Schemes
        notice: {
            text: "Santander UK completed its acquisition of TSB on 30 April 2026. TSB remains a separate lender until a planned integration in the first half of 2027.",
            sources: ["S27", "S28"]
        },
        summary: {
            maxLtv: {
                value: "Up to 98%",
                detail: "Only on a specific first-time buyer product for houses, with loans of £190,001 – £500,000.",
                sources: ["S26"]
            },
            loans: {
                value: "£1,000 – £25,000",
                detail: "New and existing customers.",
                sources: ["S24"]
            }
        }
    },
    {
        id: "tsb",
        name: "TSB",
        researchGroup: "TSB",
        brands: ["TSB"],
        schemeKeywords: ["TSB"],      // matches scheme names in Support_Schemes
        notice: {
            text: "TSB is now owned by Santander UK (since 30 April 2026) but still has its own products and criteria until a planned integration in the first half of 2027.",
            sources: ["S27", "S28"]
        },
        summary: {
            maxLtv: {
                value: "Up to 95%",
                detail: "For loans up to £570,000 (from TSB's product guide).",
                sources: ["S40"]
            },
            loans: {
                value: "£300 – £50,000",
                detail: "Small loans from £300 to £999 have shorter terms.",
                sources: ["S41"]
            }
        }
    },
    {
        id: "nationwide",
        name: "Nationwide",
        researchGroup: "Nationwide",
        brands: ["Nationwide Building Society", "Virgin Money", "Clydesdale (mortgages)"],
        // Virgin Money keeps separate criteria, so the limits check treats it separately
        subBrands: [{ brandScope: "Virgin Money", name: "Virgin Money", productPrefix: "Virgin Money" }],
        schemeKeywords: ["Nationwide"],      // matches scheme names in Support_Schemes
        notice: {
            text: "Virgin Money's business transferred to Nationwide on 2 April 2026. Virgin Money and Clydesdale continue as separate mortgage brands.",
            sources: ["S38", "S39"]
        },
        summary: {
            maxLtv: {
                value: "Up to 95%",
                detail: "For loans up to £750,000.",
                sources: ["S29"]
            },
            loans: {
                value: "Not verified",
                detail: "Personal loans are for members only. Amounts couldn't be retrieved in this research pass.",
                sources: ["S38"]
            }
        }
    },
    {
        id: "skipton",
        name: "Skipton Building Society",
        researchGroup: "Skipton BS",
        brands: ["Skipton Building Society"],
        schemeKeywords: ["Skipton"],      // matches scheme names in Support_Schemes
        // Skipton's single rate row sits under "Other lenders" in the research
        rateFilter: { group: "Other lenders", productIncludes: "Skipton" },
        summary: {
            maxLtv: {
                value: "Up to 100%",
                detail: "Track Record mortgage for renters, up to £600,000.",
                sources: ["S42"]
            },
            loans: {
                value: "Not verified",
                detail: "Personal loans not verified in this research pass.",
                sources: []
            }
        }
    },
    {
        id: "co-operative-bank",
        name: "Co-operative Bank",
        researchGroup: "Co-operative Bank",
        notice: {
            text: "The Co-operative Bank has been owned by Coventry Building Society since 1 January 2025. Its business is expected to transfer to the Society on 1 January 2027.",
            sources: ["S81", "S82"]
        },
        brands: ["Co-operative Bank (incl. Platform)"],
        schemeKeywords: ["Co-operative"],      // matches scheme names in Support_Schemes
        summary: {
            maxLtv: {
                value: "Not verified",
                detail: "Interest-only lending is capped at 75%. The overall maximum wasn't captured.",
                sources: ["S43"]
            },
            loans: {
                value: "Not verified",
                detail: "Personal loans not verified in this research pass.",
                sources: []
            }
        }
    }
    ,
    {
        id: "coventry",
        name: "Coventry Building Society",
        researchGroup: "Coventry BS",
        brands: ["Coventry Building Society"],
        schemeKeywords: ["Coventry"],
        summary: {
            maxLtv: {
                value: "Up to 95%",
                detail: "For first-time buyers, from Coventry's first-time buyer product page.",
                sources: ["S79"]
            },
            loans: {
                value: "Not verified",
                detail: "Personal loans not verified in this research pass.",
                sources: []
            }
        }
    }
];

/* Lenders in the research list whose criteria weren't captured yet.
   Shown on the directory only; details come from Lender_Overview. */
window.LOAND_LENDERS_PENDING = [
    "Yorkshire Building Society (incl. Accord)",
    "Leeds Building Society",
    "Kensington Mortgages",
    "BM Solutions",
    "Danske Bank (Northern Ireland)"
];
