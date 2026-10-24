// Gupta ji's call, for every judge, microphone or not: a recorded, unedited
// call with English captions when the Owner has put one in
// apps/web/public/calls/, else the call written out. The written sample
// tells the same story the tour, /proof and the pitch tell.
import { useEffect, useRef, useState } from "react";
import { munimFirstLine, planInWords } from "@tagada/domain";
import { formatInr, hindiRupees } from "@tagada/money";
import { GUPTA_PLAN } from "@tagada/seed";
import { ownerCopy } from "./i18n/owner.ts";
import { useLang } from "./lib/prefs.ts";

/**
 * The recorded call: Hindi audio (MP3) and English captions (WebVTT, one cue
 * per line said, "HH:MM:SS.mmm --> HH:MM:SS.mmm" timings). Both are served
 * as they are from apps/web/public/calls/.
 */
export const CALL_RECORDING = { audio: "/calls/gupta-call.mp3", captions: "/calls/gupta-call.en.vtt" } as const;

const OWED = 11_800_000;
const [FIRST] = GUPTA_PLAN;

/** A written sample of the call, for anyone without a microphone or the recording. Not a recording. */
export const SAMPLE: { who: string; hi: string; en: string }[] = [
  {
    who: "Munim",
    hi: munimFirstLine({ customerName: "Gupta Traders", businessName: "Tripura Bamboo Works", amountWords: hindiRupees(OWED) }),
    en: `Namaste Gupta ji, I'm Munim, an AI assistant calling for Tripura Bamboo Works. It's about your bill of ${formatInr(OWED)}. Do you have two minutes?`,
  },
  { who: "Gupta ji", hi: "शुक्रवार को चालीस हज़ार दे सकता हूँ, बाकी अगले महीने।", en: "I can pay ₹40,000 on Friday, the rest next month." },
  { who: "Rule check", hi: "", en: "₹40,000 by Fri 6 Nov: below your 50% rule (₹59,000), so the agent will counter" },
  { who: "Munim", hi: "क्या आप शुक्रवार, छह नवंबर तक उनसठ हज़ार रुपये कर पाएँगे?", en: "Could you manage ₹59,000 by Friday 6 November?" },
  {
    who: "Gupta ji",
    hi: "ठीक है, शुक्रवार को साठ हज़ार दे दूँगा, बाकी दो दिसंबर तक।",
    en: `All right, I'll pay ${formatInr(FIRST.amountPaise)} on Friday, and the rest by 2 December.`,
  },
  { who: "Rule check", hi: "", en: `${planInWords(GUPTA_PLAN)}: inside your rule` },
];

/** The written sample behind a toggle. */
export function SampleCall({ label }: { label?: string }) {
  const copy = ownerCopy(useLang().lang);
  const shown = label ?? copy.sampleCall;
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" className="linkbtn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? copy.hideSample : shown}
      </button>
      {open && (
        <ol className="tour-sample">
          {SAMPLE.map((line) => (
            <li key={line.en}>
              <b>{line.who}</b> {line.hi && <span lang="hi">{line.hi} </span>}
              <span className="text-ink-2">{line.en}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

type Recording = "checking" | "ready" | "missing";

/** Is the recording there? A missing file comes back as the app's own page, so the type says. */
function useRecording(): Recording {
  const [state, setState] = useState<Recording>("checking");
  useEffect(() => {
    let live = true;
    fetch(CALL_RECORDING.audio, { method: "HEAD" })
      .then((res) => res.ok && (res.headers.get("content-type") ?? "").startsWith("audio/"))
      .catch(() => false)
      .then((found) => live && setState(found ? "ready" : "missing"));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** The recorded call with its captions shown under the player; the written sample when there is no recording. */
export function CallPlayer() {
  const recording = useRecording();
  const track = useRef<HTMLTrackElement>(null);
  const [caption, setCaption] = useState("");

  useEffect(() => {
    const captions = track.current?.track;
    if (recording !== "ready" || !captions) return;
    // Hidden: the page shows the cue itself, since an audio player draws no captions.
    captions.mode = "hidden";
    const show = () => {
      const cue = captions.activeCues?.[0] as VTTCue | undefined;
      setCaption(cue?.text ?? "");
    };
    captions.addEventListener("cuechange", show);
    return () => captions.removeEventListener("cuechange", show);
  }, [recording]);

  if (recording === "checking") return null;
  if (recording === "missing") return <SampleCall />;
  return (
    <figure className="call-player mt-2">
      <figcaption className="text-[13px] text-ink-2">A recorded call with Munim, unedited. Hindi, with English captions.</figcaption>
      <audio controls preload="metadata" src={CALL_RECORDING.audio} className="mt-1 w-full">
        <track ref={track} kind="captions" srcLang="en" label="English" src={CALL_RECORDING.captions} default />
      </audio>
      <p className="call-caption" aria-live="off">
        {caption}
      </p>
    </figure>
  );
}
