const REPO = "https://github.com/Anikesh-Paul/hackcache-public";

/** A /proof case, at the commit this build was made from. */
export function proofHref(commit: string, source: string): string {
  return `${REPO}/blob/${commit}/${source}`;
}
