export const LANGUAGES = [
  { id: "en", name: "English" },
  { id: "hi", name: "हिन्दी" },
  { id: "bn", name: "বাংলা" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

export function languageName(id: string | null | undefined): string {
  return LANGUAGES.find((language) => language.id === id)?.name ?? "Not set";
}
