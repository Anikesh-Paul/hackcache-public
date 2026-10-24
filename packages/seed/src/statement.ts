// Statement 2 is not in the seed. The Owner imports it on the Bank page.
// It is the week after the Demo date: Gupta Traders' first instalment of
// ₹60,000 on Fri 6 Nov (the UTR printed on the sample screenshot, so a proof
// that was "not found yet" can become "Matched ✓"), the rest Das & Sons
// promised for 6 Nov, and Kalita Traders' Invoice, paid on its usual day.

/**
 * The Plan the sample call agrees with Gupta Traders on Mon 2 Nov, inside the
 * Owner's rule: the story the tour, /proof and the pitch all tell.
 */
export const GUPTA_PLAN = [
  { amountPaise: 6_000_000, date: "2026-11-06" },
  { amountPaise: 5_800_000, date: "2026-12-02" },
] as const;

export const GUPTA_PROOF_UTR = "609812345678";
export const GUPTA_PROOF_AMOUNT_TEXT = "₹60,000.00";
/** The day the first instalment lands. */
export const GUPTA_PROOF_DATE = GUPTA_PLAN[0].date;

export const STATEMENT_2_CSV = `date,narration,utr,amount
${GUPTA_PROOF_DATE},"UPI/CR/${GUPTA_PROOF_UTR}/GUPTA TRADERS",${GUPTA_PROOF_UTR},"${GUPTA_PROOF_AMOUNT_TEXT}"
2026-11-06,"NEFT CR-ICIC0002211-DAS AND SONS",ICICN52631104562,"₹14,340.00"
2026-11-07,"NEFT CR-UBIN0531779-KALITA TRADERS-GUWAHATI",UBINN52631377210,"₹27,500.00"
`;
