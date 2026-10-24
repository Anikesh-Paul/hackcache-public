import { runDomainCases } from "@tagada/domain";
import { runProofCases } from "@tagada/money";
import { runForecastCases } from "@tagada/seed/proof";

/** Money cases, domain cases and the seeded forecast headline, from the real packages. */
export function runShownProof() {
  return [...runProofCases(), ...runDomainCases(), ...runForecastCases()];
}
