"""Lists English UI text still written inline in the Owner's screens.

Looks for JSX text between tags, user-facing string props (title, aria-label,
placeholder, alt, label) and quoted English sentences in .tsx files. Prints
file:line and the text. Allowed names and codes are skipped.

    python scripts/i18n-coverage.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / "apps" / "web" / "src"
FILES = sorted(
    [*ROOT.glob("screens/*.tsx"), ROOT / "tour.tsx", ROOT / "AppShell.tsx", ROOT / "books.tsx", ROOT / "ui.tsx",
     ROOT / "sample-call.tsx", ROOT / "Proof.tsx", ROOT / "Shell.tsx", ROOT / "pay-qr.tsx", ROOT / "Landing.tsx"]
)
# The Customer's pay link has its own table; the Tax Invoice is a GST document printed in English.
SKIP = {"PayLink.tsx", "TaxInvoice.tsx"}
ALLOWED = {
    "Tagada", "UPI", "UTR", "GST", "GSTIN", "CGST", "SGST", "IGST", "ODR", "MSMED", "WhatsApp", "PDF",
    "bank-statement.csv", "ji", "EN",
    # The seeded business name, the brand line, and the captions track's own language name.
    "Tripura", "Bamboo", "Works", "bina", "jhagda", "English",
    # The closed khata's name plate on the landing page: a place and a year's book.
    "Agartala", "khata",
}
TEXT = re.compile(r">\s*([A-Za-z][^<>{}]*[A-Za-z.?!])\s*<")
PROP = re.compile(r"\b(?:title|aria-label|placeholder|alt|label)=\"([^\"]*[A-Za-z]{3,}[^\"]*)\"")
SENTENCE = re.compile(r"\"([A-Z][a-z]+(?: [A-Za-z',]+){2,}[.…?]?)\"")


def wanted(text: str) -> bool:
    # Code between angle brackets: generics like Promise<…>, member access, calls.
    if text == "Promise" or "(" in text or "$" in text or re.fullmatch(r"\w+\.\w+", text):
        return False
    words = re.findall(r"[A-Za-z][A-Za-z'-]+", text)
    return any(word not in ALLOWED for word in words)


found = []
for path in FILES:
    if path.name in SKIP or not path.exists():
        continue
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith(("//", "/*", "*", "import ")) or "console." in line or "Error(" in line:
            continue
        for pattern in (TEXT, PROP, SENTENCE):
            for match in pattern.finditer(line):
                if wanted(match.group(1)):
                    found.append(f"{path.relative_to(ROOT)}:{n}: {match.group(1)}")

print("\n".join(found) if found else "No inline English UI text found.")
sys.exit(1 if found else 0)
