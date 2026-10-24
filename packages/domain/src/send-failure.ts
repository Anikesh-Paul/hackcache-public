// What the Owner reads about a Reminder email that did not go. The provider's
// own error stays on the Reminder row, and Automation keeps it behind a
// collapsed detail; the Owner's screens say one plain sentence.

/** Put before a stored error when the email service refused a key it had already taken: that Reminder is not tried again. */
export const REPEAT_REFUSED = "Refused as a repeat: ";

export const SEND_FAILED_WORDS = "The email could not be sent; the next run tries again.";
export const REPEAT_REFUSED_WORDS = "The email service had already taken this email once, so it is not sent again.";

export function isRepeatRefused(error: string | null | undefined): boolean {
  return typeof error === "string" && error.startsWith(REPEAT_REFUSED);
}

/** One plain sentence for a failed send, whatever the provider said. */
export function sendFailureWords(error: string | null | undefined): string {
  return isRepeatRefused(error) ? REPEAT_REFUSED_WORDS : SEND_FAILED_WORDS;
}
