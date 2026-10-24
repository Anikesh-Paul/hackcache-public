// Per-browser conveniences: theme and header language. Storage can be blocked
// (private windows), so every read and write is guarded.
import { useCallback, useEffect, useState } from "react";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // the choice still holds for this page
  }
}

export type Theme = "light" | "dark";

const systemTheme = (): Theme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/** Follows the system until the toggle picks a side; the pick is remembered. */
export function useTheme() {
  const [chosen, setChosen] = useState<Theme | null>(() => {
    const saved = read("tagada.theme");
    return saved === "light" || saved === "dark" ? saved : null;
  });
  const [system, setSystem] = useState<Theme>(systemTheme);

  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystem(query.matches ? "dark" : "light");
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (chosen) document.documentElement.dataset.theme = chosen;
    else delete document.documentElement.dataset.theme;
  }, [chosen]);

  const theme = chosen ?? system;
  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    write("tagada.theme", next);
    setChosen(next);
  }, [theme]);
  return { theme, toggle };
}

export type Lang = "en" | "hi" | "bn";

export function useLang() {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = read("tagada.lang");
    return saved === "hi" || saved === "bn" ? saved : "en";
  });
  const choose = useCallback((next: Lang) => {
    write("tagada.lang", next);
    setLang(next);
  }, []);
  return { lang, choose };
}
