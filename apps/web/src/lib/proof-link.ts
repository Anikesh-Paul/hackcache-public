const REPO = "https://github.com/Anikesh-Paul/hackcache-public";

/** A /proof case, at the commit this build was made from, or at main when the build does not know it. */
export function proofHref(commit: string, source: string): string {
  return `${REPO}/blob/${commit === "unknown" ? "main" : commit}/${source}`;
}
