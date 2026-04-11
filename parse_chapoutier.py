#!/usr/bin/env python3
"""Parse CHAPOUTIER & TRENEL 2026 tariff into structured JSON.

Strategy v3 (page-based):
  - Split the text into pages using the page footer (`29/01/2026 ... N ... Tarifs valables`).
  - Map each page number to its section using the fixed TOC layout.
  - Extract wine rows per page, attributing them to the page's section.
"""
import json
import re
from pathlib import Path
from collections import Counter

SRC = Path("chapoutier.txt")
OUT = Path("chapoutier_wines.json")

# TOC mapping (from the 2026 catalog):
# page_number -> (section_name, producer)
PAGE_SECTIONS = {
    3:  ("FAC&SPERA",             "M. Chapoutier"),
    4:  ("FAC&SPERA",             "M. Chapoutier"),
    5:  ("EXCELLENCE",            "M. Chapoutier"),
    6:  ("PRESTIGE",              "M. Chapoutier"),
    7:  ("TRADITION",             "M. Chapoutier"),
    8:  ("TRADITION",             "M. Chapoutier"),
    9:  ("ALCHIMIE",              "M. Chapoutier"),
    10: ("SPÉCIALITÉS",           "M. Chapoutier"),
    11: ("SPÉCIALITÉS",           "M. Chapoutier"),  # SOTHIS partagée; heuristique sur titre ligne
    12: ("MATHILDE SÉLECTION",    "Mathilde Chapoutier"),
    13: ("BY MICHEL CHAPOUTIER",  "M. Chapoutier"),
    14: ("MARIUS",                "M. Chapoutier"),
    15: ("BILA-HAUT",             "Domaine de Bila-Haut"),
    16: ("SCHIEFERKOPF",          "Schieferkopf"),
    17: ("CHÂTEAU DES FERRAGES",  "Château des Ferrages"),
    18: ("SAINT-ÉTIENNE",         "Domaine Saint-Étienne"),
    19: ("TOURNON",               "Domaine Tournon"),
    20: ("DOS LUSIADAS",          "Dos Lusiadas"),
    21: ("DOMINIO DEL SOTO",      "Dominio del Soto"),
    22: ("GAMME DES CHEFS",       "M. Chapoutier"),
    23: ("GAMME DES CHEFS",       "M. Chapoutier"),
    24: ("GAMME DES CHEFS",       "M. Chapoutier"),  # + LUCIDI + STENOPE (fin de page)
    25: ("STENOPE",               "Devaux & Chapoutier"),  # STENOPE only
    26: ("TERLATO",               "Terlato & Chapoutier"),  # TERLATO → LAUGHTON transition
    27: ("LAUGHTON",              "Laughton & Chapoutier"),  # Jasper Hill + GIACONDA
    28: ("TRENEL",                "Maison Trenel"),
    29: ("TRENEL",                "Maison Trenel"),
    30: ("TRENEL",                "Maison Trenel"),
}

# Special inline headers that override the page section (sub-brands on shared pages)
INLINE_OVERRIDES = [
    (re.compile(r"SOTHIS", re.I),                          "SOTHIS",  "Maxime Chapoutier"),
    (re.compile(r"LUCIDI", re.I),                          "LUCIDI",  "Lucidi & Chapoutier"),
    (re.compile(r"STENOPE|DEVAUX", re.I),                  "STENOPE", "Devaux & Chapoutier"),
    (re.compile(r"TERLATO", re.I),                         "TERLATO", "Terlato & Chapoutier"),
    (re.compile(r"LAUGHTON|JASPER HILL|GIACONDA", re.I),   "LAUGHTON","Laughton & Chapoutier"),
]

COLOR_PATTERNS = [
    (re.compile(r"Vins rouges|Vin rouge", re.I),           "rouge"),
    (re.compile(r"Vins blancs|Vin blanc", re.I),           "blanc"),
    (re.compile(r"Vins rosés|Vin rosé", re.I),             "rosé"),
    (re.compile(r"Vins doux|Vin doux", re.I),              "doux"),
    (re.compile(r"Vins effervescents|Vin effervescent", re.I), "effervescent"),
    (re.compile(r"Crèmes?\b|Liqueurs?", re.I),             "liqueur"),
]

APPELLATION_KEYWORDS = [
    "ERMITAGE", "HERMITAGE", "CROZES-ERMITAGE", "CROZES-HERMITAGE",
    "CÔTE-RÔTIE", "CONDRIEU", "SAINT-JOSEPH", "SAINT-PERAY", "SAINT-PÉRAY",
    "CORNAS", "CHÂTEAUNEUF-DU-PAPE", "GIGONDAS", "VACQUEYRAS",
    "CÔTES-DU-RHÔNE", "CÔTES DU RHÔNE", "TAVEL", "LIRAC",
    "LUBERON", "BEAUMES-DE-VENISE", "MUSCAT DE BEAUMES", "RASTEAU",
    "COSTIÈRES-DE-NIMES", "COSTIERES-DE-NIMES", "COSTIÈRES DE NÎMES",
    "IGP COLLINES RHODANIENNES", "COTEAUX DE DIE", "CLAIRETTE DE DIE",
    "VIN DE FRANCE", "VIN DE PAYS",
    "IGP CÔTES CATALANES", "CÔTES DU ROUSSILLON",
    "CÔTES DU ROUSSILLON VILLAGES", "MAURY",
    "BANYULS", "COLLIOURE",
    "RIESLING", "GEWURZTRAMINER", "PINOT GRIS", "PINOT NOIR", "ALSACE",
    "CÔTES DE PROVENCE", "COTEAUX D'AIX",
    "DOURO", "PORTO", "PORT", "RIBERA DEL DUERO",
    "AUSTRALIE", "VICTORIA", "HEATHCOTE", "PYRENEES",
    "BEAUJOLAIS", "BEAUJOLAIS-VILLAGES", "FLEURIE", "MORGON",
    "JULIÉNAS", "JULIENAS", "BROUILLY", "MOULIN-À-VENT", "MOULIN A VENT",
    "CHIROUBLES", "CHENAS", "CHÉNAS", "CÔTE DE BROUILLY", "COTE DE BROUILLY",
    "SAINT-AMOUR", "RÉGNIÉ", "REGNIE",
    "MÂCON", "MACON", "POUILLY-FUISSÉ", "POUILLY-FUISSE",
    "SAINT-VÉRAN", "SAINT-VERAN",
    "BOURGOGNE", "CHABLIS", "MEURSAULT", "MONTAGNY", "MERCUREY",
    "CÔTE DE BEAUNE", "CÔTE DE NUITS", "RULLY",
    "CHAMPAGNE", "IGP PAYS D'OC",
    "BASKET PRESS",
    "SHIRAZ", "CHARDONNAY",
]

NOISE_PREFIXES = (
    "Epuisé =", "Franco", "DEMETER", "BIOLOGIQUE", "RAISINS BIO",
    "Disponible en", "Supplément", "chapoutier.com", "29/01/2026",
    "Millésimes disponibles", "Des anciens millésimes",
    "Prix HT", "Tarif 36", "Tarif 78", "Tarif 156",
    "L'ABUS", "Tarifs valables", "TARIFS VALABLES",
    "Nous attirons", "La mention", "par point de livraison",
    "* Millésimes", "E ou Epuisé", "TARIFS PROFESSIONNELS",
    "SOMMAIRE", "2026",
)

NON_APPELLATION_WORDS = {
    "TARIFS PROFESSIONNELS HT 2026", "SOMMAIRE", "FAC & SPERA",
    "EXCELLENCE", "PRESTIGE", "TRADITION", "ALCHIMIE",
    "SPÉCIALITÉS", "SPECIALITES", "SOTHIS", "MARIUS",
    "BILA-HAUT", "SCHIEFERKOPF", "DOS LUSIADAS", "DOMINIO DEL SOTO",
    "TOURNON", "EN CARTON", "EN CAISSE BOIS",
    "VIN EFFERVESCENT", "VIN DOUX", "VIN BLANC", "VIN ROUGE", "VIN ROSÉ",
    "SELECTION PARCELLAIRE", "SÉLECTION PARCELLAIRE",
    "VINS D'AUSTRALIE", "VINS DE PROVENCE", "VINS DU PORTUGAL",
    "NOS RENCONTRES", "NOS DOMAINES & MAISONS",
    "MATHILDE SÉLECTION", "MATHILDE CHAPOUTIER SÉLECTION",
    "CHÂTEAU DES FERRAGES", "SAINT-ÉTIENNE",
    "GAMME DES CHEFS", "BY MICHEL CHAPOUTIER",
    "LUCIDI & CHAPOUTIER", "DEVAUX & CHAPOUTIER - STENOPE",
    "TERLATO & CHAPOUTIER", "LAUGHTON & CHAPOUTIER",
    "MAISON TRENEL",
}

FOOTER_ANCHOR = re.compile(r"L'ABUS D'ALCOOL EST DANGEREUX|Tarifs valables dans la limite")
DATE_RE = re.compile(r"\d{1,2}/\d{1,2}/\d{4}")


def extract_page_num(*sources):
    """Return the most plausible page number from the given text sources.
    Strategy: prefer the LAST integer token (1..31) that appears before the
    "Tarifs valables" or "L'ABUS" anchor in the same line. Exclude known
    tariff tier numbers (36/78/156).
    """
    EXCLUDED = {36, 78, 156}
    ANCHORS = ("Tarifs valables", "L'ABUS")
    best = None
    for src in sources:
        if not src:
            continue
        stripped = DATE_RE.sub(" ", src)
        # Split prefix = everything before the nearest anchor
        cut = len(stripped)
        for a in ANCHORS:
            idx = stripped.find(a)
            if 0 <= idx < cut:
                cut = idx
        prefix = stripped[:cut]
        last = None
        for tok in prefix.split():
            if tok.isdigit():
                n = int(tok)
                if 1 <= n <= 31 and n not in EXCLUDED:
                    last = n
        if last is not None:
            return last
        # Fallback: any plausible token anywhere in the line
        for tok in stripped.split():
            if tok.isdigit():
                n = int(tok)
                if 1 <= n <= 31 and n not in EXCLUDED:
                    best = best or n
    return best


def is_noise(s):
    for p in NOISE_PREFIXES:
        if s.startswith(p) or p in s:
            return True
    return False


def is_appellation_line(s):
    if not s or len(s) < 3:
        return False
    if s in NON_APPELLATION_WORDS:
        return False
    # A line containing a vintage year is a data row, not a pure header
    if re.search(r"\b(19\d{2}|20\d{2})\b", s):
        return False
    # Data rows often have "Epuisé" or digits with decimal prices
    if "Epuisé" in s or re.search(r"\d+[,.]\d{2}", s):
        return False
    upper = s.upper()
    for kw in APPELLATION_KEYWORDS:
        if upper == kw or upper.startswith(kw + " ") or upper.startswith(kw + ","):
            return True
    # Regional sub-headers (e.g. "AUSTRALIE, Victoria, PYRENEES")
    if re.match(r"^(AUSTRALIE|PORTUGAL|ESPAGNE|ITALIE)\b", upper):
        return True
    return False


def split_at_year(line):
    m = re.search(r"\b(19\d{2}|20\d{2})\*?\b", line)
    if not m:
        return None
    before = line[:m.start()].strip()
    vintage = int(m.group(1))
    after = line[m.end():]
    prices = re.findall(r"(?:\d+(?:[,.]\d+)?|Epuisé|E\b|-)", after)
    return before, vintage, prices


def split_into_pages(lines):
    """Yield (page_number, lines) tuples.

    A page footer is a *pair* of consecutive lines containing:
      - "Tarifs valables dans la limite..." and/or
      - "L'ABUS D'ALCOOL EST DANGEREUX..."

    The page number is scraped from either of those lines (first small integer
    found). Content accumulated since the previous footer belongs to that page.
    """
    current_page_lines = []
    last_emit_idx = -10
    for i, raw in enumerate(lines):
        current_page_lines.append(raw)
        if not FOOTER_ANCHOR.search(raw):
            continue
        # If an adjacent footer line already triggered an emit, ignore the duplicate
        if i - last_emit_idx == 1:
            last_emit_idx = i
            continue
        # Extract page number from this line or the previous one
        pn = extract_page_num(raw, lines[i - 1] if i > 0 else "")
        if pn is None:
            continue
        yield pn, current_page_lines
        current_page_lines = []
        last_emit_idx = i
    if current_page_lines:
        yield 999, current_page_lines


PAGE_START_MARKER = "TARIFS PROFESSIONNELS HT 2026"


def parse_page(page_num, page_lines):
    section_name, producer = PAGE_SECTIONS.get(page_num, (None, None))
    if section_name is None:
        return []

    # Trim any content preceding the LAST "TARIFS PROFESSIONNELS HT 2026" marker
    # in this block — otherwise TOC/intro text (containing "LAUGHTON", "STENOPE",
    # "1928...") leaks into page 3 and contaminates sections.
    last_marker = -1
    for i, raw in enumerate(page_lines):
        if PAGE_START_MARKER in raw:
            last_marker = i
    if last_marker >= 0:
        page_lines = page_lines[last_marker + 1:]

    wines = {}
    current_color = None
    current_appellation = None
    current_cuvee = None
    pending_label = None
    current_section = section_name
    current_producer = producer
    # Sections sans appellation textuelle (ex: STENOPE = Champagne)
    if section_name == "STENOPE":
        current_appellation = "CHAMPAGNE"

    for raw in page_lines:
        line = raw.rstrip()
        s = line.strip()
        if not s:
            continue
        if is_noise(s):
            continue

        # Inline section override (e.g. SOTHIS on p.11, LUCIDI/STENOPE on p.24, TERLATO on p.25)
        for pat, name, prod in INLINE_OVERRIDES:
            if pat.search(s):
                if current_section != name:
                    current_section = name
                    current_producer = prod
                    # Sections without explicit appellation headers get a default
                    if name == "STENOPE":
                        current_appellation = "CHAMPAGNE"
                        current_cuvee = None
                break

        # Color header
        color_found = False
        for pat, col in COLOR_PATTERNS:
            if pat.search(s):
                current_color = col
                color_found = True
                break
        if color_found:
            continue

        # Appellation header
        if is_appellation_line(s):
            current_appellation = s
            current_cuvee = None
            pending_label = None
            continue

        # Wine row (contains a vintage)
        split = split_at_year(line)
        if split and current_appellation:
            before, vintage, prices = split
            # A real wine row has at least one numeric price (e.g. "12,50")
            # after the vintage. Pure text like "En 1998, Michel..." doesn't.
            has_numeric = any(re.search(r"\d", p or "") for p in prices)
            if not has_numeric and "Epuisé" not in prices and "E" not in prices:
                continue
            cleaned_before = re.sub(r"[\s\-,]+", " ", before).strip()
            if cleaned_before and not re.fullmatch(r"[\d,.\s\-]+", cleaned_before):
                if len(cleaned_before) < 80 and not is_noise(cleaned_before):
                    current_cuvee = cleaned_before
            elif pending_label and not current_cuvee:
                current_cuvee = pending_label
                pending_label = None

            cuvee_name = current_cuvee or current_appellation.title()
            key = (current_section, current_appellation, cuvee_name, current_color or "?")
            if key not in wines:
                wines[key] = {
                    "section": current_section,
                    "producer": current_producer,
                    "appellation": current_appellation,
                    "cuvee": cuvee_name,
                    "color": current_color,
                    "vintages": [],
                    "prices": {},
                    "page": page_num,
                }
            if vintage not in wines[key]["vintages"]:
                wines[key]["vintages"].append(vintage)
                wines[key]["prices"][vintage] = prices
            continue

        # Candidate cuvée label (mixed case, no year), only right after an appellation
        if current_appellation and s and s[0].isupper():
            if len(s) < 80 and not s.endswith(".") and not is_noise(s):
                pending_label = s
                if not current_cuvee:
                    current_cuvee = s

    return list(wines.values())


def main():
    lines = SRC.read_text(encoding="utf-8").split("\n")
    all_wines = []
    pages_seen = []

    for page_num, page_lines in split_into_pages(lines):
        pages_seen.append(page_num)
        all_wines.extend(parse_page(page_num, page_lines))

    # Finalize: sort vintages + extract ref price
    for w in all_wines:
        w["vintages"] = sorted(w["vintages"])
        if w["vintages"]:
            last = w["vintages"][-1]
            raw_prices = w["prices"].get(last, [])
            ref = None
            for p in raw_prices:
                if p and p not in ("Epuisé", "E", "-"):
                    try:
                        ref = float(p.replace(",", "."))
                        break
                    except ValueError:
                        pass
            w["ref_price_eur_ht"] = ref

    # Sort by (page, appellation, cuvée)
    all_wines.sort(key=lambda w: (w.get("page") or 999, w["appellation"] or "", w["cuvee"] or ""))

    OUT.write_text(json.dumps(all_wines, ensure_ascii=False, indent=2))
    print(f"[OK] {len(all_wines)} wines extracted -> {OUT}")
    print(f"[OK] pages parsed: {sorted(set(pages_seen))}")

    by_section = Counter(w["section"] for w in all_wines)
    by_color = Counter(w["color"] for w in all_wines)
    print("\nPar section:")
    for sect, n in sorted(by_section.items(), key=lambda x: -x[1]):
        print(f"  {sect or '?':<25} {n}")
    print("\nPar couleur:")
    for col, n in sorted(by_color.items(), key=lambda x: -x[1]):
        print(f"  {col or '?':<15} {n}")


if __name__ == "__main__":
    main()
