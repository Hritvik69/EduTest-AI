# npm run dev
#https://edu-test-ai-rho.vercel.app/create-test
import os, io, time, re
import requests
from pathlib import Path

try:
    from pypdf import PdfWriter, PdfReader
except ImportError:
    os.system("pip install pypdf -q")
    from pypdf import PdfWriter, PdfReader

# ── Config ───────────────────────────────────────────────────────────────────
OUTPUT_DIR   = Path("NCERT_Books")
OUTPUT_DIR.mkdir(exist_ok=True)
BASE         = "https://ncert.nic.in/textbook/pdf"
DELAY        = 0.4          # seconds between requests
MIN_PAGES    = 5            # PDFs under this are invalid
FAKE_PAGES   = 78           # The v2 fake files are exactly 78 pages — delete them

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer":         "https://ncert.nic.in/ebooks.php",
    "Accept":          "application/pdf,*/*",
    "Accept-Language": "en-IN,en;q=0.9",
})

# ── Book definitions ─────────────────────────────────────────────────────────
# Format per entry: (book_code, part, max_chapters)
# URL tried: {BASE}/{code}{part}{ch:02d}.pdf  AND  {BASE}/{code}{ch:02d}.pdf
#
# Multiple alternatives listed per subject — first one confirmed working is used.

CURRICULUM = {
    # ── CLASS 6 (new NCF 2023-24 books) ──────────────────────────────────────
    6: {
        "Maths": [
            ("femh", 1, 14), ("fgmh", 1, 14), ("fema", 1, 14),
            ("fmms", 1, 14), ("fgp1", 1, 10),
        ],
        "Science": [
            ("fesc", 1, 16), ("fscn", 1, 12), ("fcur", 1, 12),
            ("fescn",1, 12), ("fesi", 1, 12),
        ],
        "English": [
            ("fefl", 1, 10), ("fepv", 1, 10), ("ferl", 1, 10),
            ("feen", 1, 10), ("fehn", 1, 10), ("fern", 1, 10),
            ("ferc", 1, 10), ("fepr", 1, 10),
        ],
        "Hindi": [
            ("fhkv", 1, 17), ("fhdv", 1, 15), ("fhvs", 1, 17),
            ("fhrv", 1, 15), ("fhrd", 1, 12),
        ],
        "Social_Science": [
            ("fehs", 1, 9),  ("fegs", 1, 8),  ("fess", 1, 9),
            ("fhso", 1, 9),  ("feou", 1, 9),
        ],
        "IT": [
            ("feit", 1, 6),  ("fcp",  1, 6),  ("fcs",  1, 6),
            ("fict", 1, 6),  ("fcmp", 1, 6),
        ],
    },

    # ── CLASS 7 ───────────────────────────────────────────────────────────────
    7: {
        "Maths": [
            ("gemh", 1, 15), ("ggp2", 1, 12), ("gema", 1, 15),
            ("gmth", 1, 15), ("ggan", 1, 12),
        ],
        "Science":        [("gesc", 1, 18)],            # ✅ confirmed v1
        "English": [
            ("gefl", 1, 10), ("geen", 1, 10), ("gepv", 1, 10),
            ("gehn", 1, 10), ("gern", 1, 10), ("gerc", 1, 10),
        ],
        "Hindi":          [("ghkv", 1, 20), ("ghdv", 1, 18)],  # ✅ confirmed v1
        "Social_Science": [("gehs", 1, 10), ("gegs", 1,  9), ("gess", 1, 9)],  # ✅
        "IT": [
            ("geit", 1, 6),  ("gcp",  1, 6),  ("gcs",  1, 6),
            ("gict", 1, 6),
        ],
    },

    # ── CLASS 8 ───────────────────────────────────────────────────────────────
    8: {
        "Maths":          [("hemh", 1, 16)],             # ✅ confirmed v1
        "Science":        [("hesc", 1, 18)],             # ✅ confirmed v1
        "English": [
            ("hefl", 1, 10), ("heen", 1, 10), ("hehn", 1, 10),
            ("hehd", 1, 10), ("hern", 1, 10), ("herc", 1, 10),
        ],
        "Hindi":          [("hhkv", 1, 20), ("hhdv", 1, 18)],  # ✅ confirmed v1
        "Social_Science": [
            ("hehs", 1, 12), ("hegs", 1,  6), ("hess", 1, 10),
            ("heho", 1, 12), ("heou", 1, 12), ("heop", 1, 12),
        ],
        "IT": [
            ("heit", 1, 6),  ("hcp",  1, 6),  ("hcs",  1, 6),
            ("hict", 1, 6),
        ],
    },

    # ── CLASS 9 ───────────────────────────────────────────────────────────────
    9: {
        "Maths":          [("iemh", 1, 15)],             # ✅ confirmed v1
        "Science":        [("iesc", 1, 15)],             # ✅ confirmed v1
        "English": [
            ("iefl", 1, 11), ("ieen", 1, 11), ("iehn", 1, 11),
            ("iebv", 1, 11), ("iebe", 1, 11), ("iern", 1, 11),
        ],
        "Hindi": [
            ("ihkv", 1, 17), ("ihkz", 1, 17), ("ihks", 1, 17),
            ("ihksh",1, 17), ("ihkr", 1, 17),
        ],
        "Social_Science": [
            ("iess", 1, 5),  ("iegs", 1, 6),  ("ieds", 1, 6),  ("ieps", 1, 6),
            ("idhs", 1, 5),  ("igeo", 1, 6),  ("ieco", 1, 6),  ("ipol", 1, 6),
            ("iesh", 1, 5),  ("idse", 1, 5),
        ],
        "IT": [
            ("ieit", 1, 5),  ("icp",  1, 5),  ("ics",  1, 5),
            ("iict", 1, 5),  ("iinf", 1, 5),
        ],
    },

    # ── CLASS 10 ──────────────────────────────────────────────────────────────
    10: {
        "Maths":          [("jemh", 1, 15)],             # ✅ confirmed v1
        "Science":        [("jesc", 1, 16)],             # ✅ confirmed v1
        "English": [
            ("jefl", 1, 12), ("jeen", 1, 12), ("jehn", 1, 12),
            ("jeff", 1, 12), ("jerf", 1, 12), ("jern", 1, 12),
        ],
        "Hindi": [
            ("jhkv", 1, 17), ("jhkz", 1, 17), ("jhks", 1, 17),
            ("jhksh",1, 17), ("jhkr", 1, 17),
        ],
        "Social_Science": [
            ("jess", 1, 5),  ("jegs", 1, 7),  ("jeds", 1, 5),  ("jeps", 1, 8),
        ],                                               # ✅ partial v1
        "IT": [
            ("jeit", 1, 5),  ("jcp",  1, 5),  ("jcs",  1, 5),
            ("jict", 1, 5),  ("jinf", 1, 5),
        ],
    },

    # ── CLASS 11 ──────────────────────────────────────────────────────────────
    11: {
        "Maths":          [("kemh", 1, 16)],             # ✅ confirmed v1
        "Physics":        [("keph", 1, 8), ("keph", 2, 7)],  # ✅ confirmed v1
        "Chemistry": [
            ("kech", 1, 7),  ("kech", 2, 7),
            ("kech", 1, 9),  ("kech", 2, 9),
        ],
        "Biology": [
            ("kebo", 1, 22), ("kebo", 1, 16),
        ],
        "English": [
            ("kefl", 1, 8),  ("keen", 1, 8),  ("kehn", 1, 8),
            ("kehb", 1, 8),  ("kern", 1, 8),
        ],
        "Hindi": [
            ("khkv", 1, 18), ("khkz", 1, 18), ("khav", 1, 18),
            ("khar", 1, 18),
        ],
        "IT_CS": [
            ("keit", 1, 8),  ("kcp",  1, 8),  ("kcs",  1, 8),
            ("kcsp", 1, 8),  ("kinf", 1, 8),
        ],
    },

    # ── CLASS 12 ──────────────────────────────────────────────────────────────
    12: {
        "Maths":          [("lemh", 1, 7), ("lemh", 2, 6)],
        "Physics":        [("leph", 1, 8), ("leph", 2, 7)],
        "Chemistry": [
            ("lech", 1, 9),  ("lech", 2, 7),
        ],
        "Biology": [
            ("lebo", 1, 16), ("lebo", 1, 22),
        ],
        "English": [
            ("lefl", 1, 8),  ("leen", 1, 8),  ("lehn", 1, 8),
            ("lefm", 1, 8),  ("lern", 1, 8),
        ],
        "Hindi": [
            ("lhkv", 1, 18), ("lhkz", 1, 18), ("lhav", 1, 18),
            ("lhar", 1, 18),
        ],
        "IT_CS": [
            ("leit", 1, 8),  ("lcp",  1, 8),  ("lcs",  1, 8),
            ("lcsp", 1, 8),  ("linf", 1, 8),
        ],
    },
}

# ── Helpers ──────────────────────────────────────────────────────────────────

def fetch(url):
    try:
        r = SESSION.get(url, timeout=25)
        if r.status_code == 200 and r.content[:4] == b"%PDF":
            return r.content
    except Exception:
        pass
    return None

def try_chapter(code, part, ch):
    """Try both URL patterns for one chapter."""
    for url in [
        f"{BASE}/{code}{part}{ch:02d}.pdf",
        f"{BASE}/{code}{ch:02d}.pdf",
        f"{BASE}/{code}0{ch:02d}.pdf",
    ]:
        raw = fetch(url)
        if raw:
            return raw
    return None

def probe_code(code, part):
    """Return True if chapter 1 of this code/part exists and has >MIN_PAGES pages."""
    raw = try_chapter(code, part, 1)
    if not raw:
        return False
    try:
        r = PdfReader(io.BytesIO(raw))
        return len(r.pages) >= MIN_PAGES
    except Exception:
        return False

def page_count(path):
    """Return page count of a saved PDF, or 0 on error."""
    try:
        r = PdfReader(str(path))
        return len(r.pages)
    except Exception:
        return 0

def bar(done, total, w=32):
    f = int(w * done / max(total, 1))
    return f"[{'█'*f}{'░'*(w-f)}] {done}/{total}"

# ── Subject processor ────────────────────────────────────────────────────────

def process_subject(cls, subject, book_alts):
    """
    book_alts = list of (code, part, max_ch)
    Groups consecutive entries with same code into one logical book (for
    two-part books like Physics Pt1+Pt2).
    """
    safe = re.sub(r"[^\w]", "_", subject).strip("_")
    out  = OUTPUT_DIR / f"Class{cls}_{safe}.pdf"

    # ── Delete known-bad v2 fakes ─────────────────────────────────────────
    if out.exists() and page_count(out) == FAKE_PAGES:
        out.unlink()
        print(f"   🗑   Deleted bad v2 file ({FAKE_PAGES}-page generic)")

    if out.exists():
        pc = page_count(out)
        print(f"   ✅  Already saved ({pc} pages) — skipping")
        return

    # ── Find a working code for each book entry ───────────────────────────
    # Deduplicate by (code, part) pairs
    seen = {}
    for code, part, maxch in book_alts:
        key = (code, part)
        if key not in seen:
            seen[key] = maxch

    # Group into logical books (consecutive same code = multi-part book)
    # Just collect unique (code, part) ordered
    unique = list(seen.items())   # [(code,part), maxch]

    # For subjects with multiple part alternatives, probe first
    working = []
    codes_tried = set()
    for (code, part), maxch in unique:
        if code in codes_tried:
            working.append((code, part, maxch))
            continue
        # Probe chapter 1
        if probe_code(code, part):
            working.append((code, part, maxch))
            codes_tried.add(code)
            time.sleep(DELAY)
        else:
            time.sleep(DELAY / 2)

    # If no probe succeeded, try each alternative's chapter 1
    if not working:
        for code, part, maxch in book_alts:
            if probe_code(code, part):
                working.append((code, part, maxch))
                time.sleep(DELAY)
                break
            time.sleep(DELAY / 2)

    if not working:
        print(f"   ✗   No working code found — skipping (check ncert.nic.in manually)")
        return

    # ── Download all chapters ──────────────────────────────────────────────
    all_bytes = []
    total_ch  = sum(m for _, _, m in working)
    done      = 0

    for code, part, maxch in working:
        misses = 0
        for ch in range(1, maxch + 1):
            done += 1
            print(f"\r   {bar(done, total_ch)}  ch{ch:02d}  ", end="", flush=True)
            raw = try_chapter(code, part, ch)
            if raw:
                all_bytes.append(raw)
                misses = 0
            else:
                misses += 1
                if misses >= 3:
                    total_ch -= (maxch - ch)   # adjust total
                    break
            time.sleep(DELAY)

    print()

    if not all_bytes:
        print(f"   ✗   0 chapters downloaded")
        return

    # ── Merge ─────────────────────────────────────────────────────────────
    writer = PdfWriter()
    for raw in all_bytes:
        try:
            rdr = PdfReader(io.BytesIO(raw))
            for page in rdr.pages:
                writer.add_page(page)
        except Exception:
            pass

    buf = io.BytesIO()
    writer.write(buf)
    merged = buf.getvalue()

    out.write_bytes(merged)
    rdr    = PdfReader(io.BytesIO(merged))
    mb     = len(merged) / 1_048_576
    print(f"   💾  {out.name}  ({len(rdr.pages)} pages, {mb:.1f} MB)")

# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("\n╔══════════════════════════════════════════════════════╗")
    print("║   NCERT Downloader v3  (Smart Code Prober)           ║")
    print("╚══════════════════════════════════════════════════════╝\n")
    print(f"Output → {OUTPUT_DIR.resolve()}\n")

    TARGET = list(range(6, 13))

    not_found = []

    for cls in TARGET:
        subjects = CURRICULUM.get(cls, {})
        print(f"\n{'─'*56}")
        print(f"  CLASS {cls}")
        print(f"{'─'*56}")

        for subj, alts in subjects.items():
            print(f"\n  📚  {subj}")
            process_subject(cls, subj, alts)

            # Track what's still missing after processing
            safe = re.sub(r"[^\w]", "_", subj).strip("_")
            out  = OUTPUT_DIR / f"Class{cls}_{safe}.pdf"
            if not out.exists() or page_count(out) < MIN_PAGES:
                not_found.append(f"Class {cls} {subj}")

    print(f"\n{'═'*56}")
    if not_found:
        print(f"  ⚠   Still missing ({len(not_found)}):")
        for x in not_found:
            print(f"        • {x}")
        print(f"\n  → Visit ncert.nic.in/ebooks.php, right-click a chapter")
        print(f"    PDF link, copy the URL, and note the code (e.g. fefl).")
        print(f"    Then update CURRICULUM in this script and re-run.")
    else:
        print(f"  ✅  All subjects downloaded!")
    print(f"{'═'*56}\n")


if __name__ == "__main__":
    main()
