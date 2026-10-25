// Whether calls and read-aloud can work on this server, asked once per page
// load, so no screen offers a call or a Listen button that cannot work.
import { useEffect, useState } from "react";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

export type VoiceStatus = { calls: "ready" | "not_configured" | "daily_cap"; readAloud: "ready" | "not_configured" };

let asked: Promise<VoiceStatus | null> | null = null;

/** Null while asking, or when the server could not say: the screens then behave as if voice is on. */
function voiceStatus(): Promise<VoiceStatus | null> {
  asked ??= fetch(`${SERVER_URL}/api/voice/status`)
    .then((res) => (res.ok ? (res.json() as Promise<VoiceStatus>) : null))
    .catch(() => null)
    .then((status) => {
      // A failed ask is asked again next time.
      if (!status) asked = null;
      return status;
    });
  return asked;
}

export function useVoiceStatus(): VoiceStatus | null {
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  useEffect(() => {
    let live = true;
    void voiceStatus().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);
  return status;
}
