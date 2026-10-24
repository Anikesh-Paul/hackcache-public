import { CUSTOMER_LANGS, type CustomerLang } from "@tagada/domain";

const NAMES: Record<CustomerLang, string> = {
  en: "English",
  hi: "हिन्दी",
  bn: "বাংলা",
};

export const LANGUAGES = CUSTOMER_LANGS.map((id) => ({ id, name: NAMES[id] }));

export type LanguageId = CustomerLang;
