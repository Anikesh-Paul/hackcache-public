import { useState } from "react";
import { MSMED_EXPLAIN, ODR_EXPLAIN, TDS_EXPLAIN } from "@tagada/domain";
import { proofHref } from "./lib/proof-link.ts";
import { runShownProof } from "./lib/proof-run.ts";

function measure() {
  const start = performance.now();
  const results = runShownProof();
  return { results, ms: performance.now() - start };
}

function formatMs(ms: number): string {
  return `${ms < 10 ? ms.toFixed(2) : ms.toFixed(1)} ms`;
}

/** The brief's money cases, computed in the browser from @tagada/money. */
export function Proof() {
  const [report, setReport] = useState(measure);
  const passed = report.results.filter((result) => result.pass).length;
  const all = report.results.length > 0 && passed === report.results.length;

  return (
    <section className="border-x-4 border-double border-rule-strong bg-paper px-5 py-6 shadow-sm">
      <h1 className="border-b border-ink pb-2 text-xl font-semibold">Every rupee, checked</h1>
      <p className="mt-4 max-w-2xl text-sm text-ink-2">
        The brief's money cases, and the domain cases for the Ladder, matching, the Plan rule, Grade, Ageing, the chase
        order, the letter and the forecast headline. Computed in this browser from the same packages the app uses.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-ink-2">
        Built from <span className="mono">{__TAGADA_COMMIT__}</span>. Each case links to the test that locks it, at that
        commit.
      </p>
      <div className="mt-4 max-w-2xl space-y-2 text-sm">
        <p>{ODR_EXPLAIN}</p>
        <p>{MSMED_EXPLAIN}</p>
        <p>{TDS_EXPLAIN}</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p aria-live="polite" className={all ? "text-bamboo-ink" : "text-[var(--sindoor)]"}>
          {passed} of {report.results.length} passed in {formatMs(report.ms)}
        </p>
        <button
          type="button"
          onClick={() => setReport(measure())}
          className="min-h-11 rounded border border-rule-strong bg-paper px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Run again
        </button>
      </div>
      <ol className="mt-6 divide-y divide-rule">
        {report.results.map((result) => (
          <li key={result.id} className="grid gap-1 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:gap-x-4">
            <p className="text-sm text-ink-2">{result.area}</p>
            <div className="min-w-0">
              <p className="break-words">
                <a href={proofHref(__TAGADA_COMMIT__, result.source)} className="break-all">
                  {result.input}
                </a>
              </p>
              <p className="mt-1 break-words text-sm text-ink-2">Expected {result.expected}</p>
              <p className="break-words text-sm">Got {result.actual}</p>
            </div>
            <p className={result.pass ? "text-bamboo-ink" : "text-[var(--sindoor)]"}>
              {result.pass ? "✓ Pass" : "✗ Fail"}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
