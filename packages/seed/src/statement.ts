// Statement 2 is not in the seed. The Owner imports it on the Bank page.
// It holds Gupta Traders' ₹60,000 and the UTR printed on the sample screenshot,
// so a proof that was "not found yet" can become "Matched ✓".

export const GUPTA_PROOF_UTR = "609812345678";
export const GUPTA_PROOF_AMOUNT_TEXT = "₹60,000.00";
export const GUPTA_PROOF_DATE = "2026-11-01";

export const STATEMENT_2_CSV = `date,narration,utr,amount
${GUPTA_PROOF_DATE},"UPI/CR/${GUPTA_PROOF_UTR}/GUPTA TRADERS",${GUPTA_PROOF_UTR},"${GUPTA_PROOF_AMOUNT_TEXT}"
`;
