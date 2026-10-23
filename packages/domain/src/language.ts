/** Languages a Customer can prefer for reminders and the pay link. */
export const CUSTOMER_LANGS = ["en", "hi", "bn"] as const;

export type CustomerLang = (typeof CUSTOMER_LANGS)[number];

export function isCustomerLang(value: string): value is CustomerLang {
  return (CUSTOMER_LANGS as readonly string[]).includes(value);
}
