"""
scraper_distribuidoras.py
-------------------------
Extrae contactos (teléfono, email, WhatsApp) de distribuidoras de alimentos
y bebidas argentinas desde Páginas Amarillas, Guia.com.ar y Google Maps.
Detecta automáticamente si el sitio web ya tiene e-commerce para priorizar leads.

Uso básico (directorios + visita webs, todo por defecto):
    python scraper_distribuidoras.py

Más páginas por directorio:
    python scraper_distribuidoras.py --paginas 5

Incluir Google Maps (requiere Playwright):
    python scraper_distribuidoras.py --maps
    python scraper_distribuidoras.py --maps --resultados-maps 100

Rápido: solo recolectar datos del directorio, sin visitar webs:
    python scraper_distribuidoras.py --rapido

Rubro personalizado (reemplaza la lista alimentaria):
    python scraper_distribuidoras.py --rubro "distribuidora lacteos"

Dependencias:
    pip install -r requirements_scraper.txt
    playwright install chromium   # solo si usas --maps

Salida:
    distribuidoras_YYYYMMDD_HHMMSS.csv

Columna "ecommerce": NINGUNO | TiendaNube | MercadoShops | Shopify | WooCommerce |
                      PrestaShop | VTex | Magento | OTRO | ERROR | (sin web)
"""

import argparse
import csv
import re
import sys
import time
from datetime import datetime
from urllib.parse import urljoin, urlparse, quote

import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "es-AR,es;q=0.9",
}

DELAY = 1.5        # segundos entre requests a directorios
DELAY_MAPS = 2.0   # segundos entre acciones en Google Maps
REQUEST_TIMEOUT = 12

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
PHONE_DIGITS_RE = re.compile(r"\d[\d\s\-\(\)\.]{6,}\d")
WA_LINK_RE = re.compile(
    r"https?://(?:api\.whatsapp\.com|wa\.me)/(?:send\?phone=)?(\d+)", re.I
)

# Plataformas de e-commerce: (nombre_legible, [patrones_en_html_o_url])
ECOMMERCE_SIGNATURES = [
    ("TiendaNube",    ["mitiendanube.com", "tiendanube.com", "tiendanube/storefront"]),
    ("MercadoShops",  ["mercadoshops.com.ar", "mercadolibre.com/tienda", "mlstatic.com/frontend-assets/ui-navigation/5"]),
    ("Shopify",       [".myshopify.com", "cdn.shopify.com", "Shopify.theme"]),
    ("WooCommerce",   ["woocommerce", "wc-cart", "wc_add_to_cart_params"]),
    ("PrestaShop",    ["prestashop", "id=\"prestashop\"", "presta-shop"]),
    ("VTex",          ["vtex.com", "vtexcommercestable", "vtex-render"]),
    ("Magento",       ["magento", "Mage.Cookies", "data-role=\"tocart\""]),
    ("Jumpseller",    ["jumpseller.com", "js.jumpseller"]),
]

ECOMMERCE_KEYWORDS = [
    "agregar al carrito", "añadir al carrito", "add to cart",
    "comprar ahora", "buy now", "ver carrito", "checkout",
    "mi carrito", "shopping cart",
]

# Rubros de alimentos y bebidas que se buscan por defecto.
# Se puede sobreescribir con --rubro "término personalizado".
RUBROS_ALIMENTOS = [
    "distribuidora alimentos",
    "distribuidora bebidas",
    "distribuidora almacen",
    "mayorista alimentos",
    "distribuidora golosinas",
    "distribuidora lacteos",
    "distribuidora snacks",
    "distribuidora productos secos",
    "distribuidora fiambres y embutidos",
    "distribuidora aceites y conservas",
]

# ---------------------------------------------------------------------------
# Helpers generales
# ---------------------------------------------------------------------------

def clean_text(s: str) -> str:
    return " ".join(s.split()) if s else ""


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return ""
    if digits.startswith("54") and len(digits) >= 12:
        return "+" + digits
    if digits.startswith("0") and len(digits) >= 10:
        return "+54" + digits[1:]
    if len(digits) >= 10:
        return "+54" + digits
    return digits


def wa_link(phone_norm: str) -> str:
    digits = re.sub(r"\D", "", phone_norm)
    return f"https://wa.me/{digits}" if digits else ""


def is_mobile_ar(phone_norm: str) -> bool:
    digits = re.sub(r"\D", "", phone_norm)
    if digits.startswith("54"):
        digits = digits[2:]
    if digits.startswith("9") or (digits.startswith("11") and len(digits) == 10):
        return True
    return len(digits) == 10


def get_soup(url: str, session: requests.Session) -> "BeautifulSoup | None":
    try:
        r = session.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        return BeautifulSoup(r.text, "html.parser")
    except Exception as e:
        print(f"  [!] {url}: {e}", file=sys.stderr)
        return None


def empty_entry(fuente: str, url_listing: str = "") -> dict:
    return {
        "nombre": "", "telefono": "", "telefono_norm": "",
        "posible_celular": "", "whatsapp_link": "", "email": "",
        "ciudad": "", "sitio_web": "", "fuente": fuente,
        "url_listing": url_listing, "ecommerce": "",
        "calificacion": "", "categoria_maps": "",
    }


def fill_phone_fields(entry: dict, raw: str) -> dict:
    entry["telefono"] = raw
    norm = normalize_phone(raw)
    entry["telefono_norm"] = norm
    if norm:
        mobile = is_mobile_ar(norm)
        entry["posible_celular"] = "SI" if mobile else "NO"
        if mobile and not entry["whatsapp_link"]:
            entry["whatsapp_link"] = wa_link(norm)
    return entry


# ---------------------------------------------------------------------------
# Detector de e-commerce
# ---------------------------------------------------------------------------

def detect_ecommerce(url: str, session: requests.Session) -> str:
    """
    Visita la URL y devuelve el nombre de la plataforma de e-commerce
    detectada, o "NINGUNO" si no parece tener tienda online.
    Devuelve "ERROR" si no se pudo acceder.
    """
    if not url:
        return ""
    try:
        r = session.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        final_url = r.url.lower()
        html = r.text
        html_lower = html.lower()

        # Chequeo por URL final (redireccionó a plataforma conocida)
        for nombre, sigs in ECOMMERCE_SIGNATURES:
            for sig in sigs:
                if sig in final_url:
                    return nombre

        # Chequeo en HTML
        for nombre, sigs in ECOMMERCE_SIGNATURES:
            for sig in sigs:
                if sig.lower() in html_lower:
                    return nombre

        # Keywords de carrito como señal genérica
        cart_hits = sum(1 for kw in ECOMMERCE_KEYWORDS if kw in html_lower)
        if cart_hits >= 2:
            return "OTRO"

        return "NINGUNO"

    except Exception:
        return "ERROR"


# ---------------------------------------------------------------------------
# Fuente 1: Páginas Amarillas  (paginasamarillas.com.ar)
# ---------------------------------------------------------------------------

PA_BASE = "https://www.paginasamarillas.com.ar"


def paginas_amarillas_url(rubro: str, pag: int) -> str:
    r = quote(rubro.replace(" ", "-"))
    return f"{PA_BASE}/search/{r}/todo-el-pais/all/all/all/all/all/{pag}/0"


def parse_pa_card(card, source_url: str) -> dict:
    e = empty_entry("PaginasAmarillas", source_url)

    for sel in ["h2", "h3", ".item-name", ".name", "a.item-link"]:
        el = card.select_one(sel)
        if el:
            e["nombre"] = clean_text(el.get_text())
            break

    for sel in [".phone", ".tel", "[itemprop='telephone']", ".item-phone"]:
        el = card.select_one(sel)
        if el:
            e = fill_phone_fields(e, clean_text(el.get_text()))
            break

    for sel in [".address", ".location", "[itemprop='addressLocality']", ".city"]:
        el = card.select_one(sel)
        if el:
            e["ciudad"] = clean_text(el.get_text())
            break

    for sel in ["a.website", ".web a"]:
        el = card.select_one(sel)
        if el and el.get("href", "").startswith("http") and PA_BASE not in el["href"]:
            e["sitio_web"] = el["href"]
            break

    emails = EMAIL_RE.findall(card.get_text())
    if emails:
        e["email"] = emails[0].lower()

    wa = WA_LINK_RE.findall(str(card))
    if wa:
        e["whatsapp_link"] = f"https://wa.me/{wa[0]}"

    return e


def scrape_paginas_amarillas(rubro: str, max_pag: int, session: requests.Session) -> list[dict]:
    results = []
    print(f"\n[PaginasAmarillas] '{rubro}' — {max_pag} páginas")
    for pag in range(1, max_pag + 1):
        url = paginas_amarillas_url(rubro, pag)
        print(f"  p{pag}: {url}")
        soup = get_soup(url, session)
        if not soup:
            break
        cards = soup.select("article.search-item, div.item-list, li.item") or soup.find_all("article")
        batch = [parse_pa_card(c, url) for c in cards if c]
        batch = [e for e in batch if e["nombre"]]
        if not batch:
            print(f"  Sin resultados, deteniendo.")
            break
        results.extend(batch)
        print(f"  +{len(batch)} (total {len(results)})")
        time.sleep(DELAY)
    return results


# ---------------------------------------------------------------------------
# Fuente 2: Guia.com.ar
# ---------------------------------------------------------------------------

GUIA_BASE = "https://www.guia.com.ar"


def guia_url(rubro: str, pag: int) -> str:
    return f"{GUIA_BASE}/busqueda/{quote(rubro)}/{pag}"


def parse_guia_card(card, source_url: str) -> dict:
    e = empty_entry("Guia.com.ar", source_url)

    for sel in ["h2", "h3", ".nombre", ".empresa-nombre", "a.title"]:
        el = card.select_one(sel)
        if el:
            e["nombre"] = clean_text(el.get_text())
            break

    for sel in [".telefono", ".tel", ".phone", "span.num"]:
        el = card.select_one(sel)
        if el:
            e = fill_phone_fields(e, clean_text(el.get_text()))
            break

    for sel in [".ciudad", ".localidad", ".ubicacion"]:
        el = card.select_one(sel)
        if el:
            e["ciudad"] = clean_text(el.get_text())
            break

    for a in card.find_all("a", href=True):
        href = a["href"]
        if href.startswith("http") and GUIA_BASE not in href:
            e["sitio_web"] = href
            break

    emails = EMAIL_RE.findall(card.get_text())
    if emails:
        e["email"] = emails[0].lower()

    wa = WA_LINK_RE.findall(str(card))
    if wa:
        e["whatsapp_link"] = f"https://wa.me/{wa[0]}"

    return e


def scrape_guia(rubro: str, max_pag: int, session: requests.Session) -> list[dict]:
    results = []
    print(f"\n[Guia.com.ar] '{rubro}' — {max_pag} páginas")
    for pag in range(1, max_pag + 1):
        url = guia_url(rubro, pag)
        print(f"  p{pag}: {url}")
        soup = get_soup(url, session)
        if not soup:
            break
        cards = soup.select(".item-empresa, .resultado, .ficha-empresa, article")
        batch = [parse_guia_card(c, url) for c in cards if c]
        batch = [e for e in batch if e["nombre"]]
        if not batch:
            print(f"  Sin resultados, deteniendo.")
            break
        results.extend(batch)
        print(f"  +{len(batch)} (total {len(results)})")
        time.sleep(DELAY)
    return results


# ---------------------------------------------------------------------------
# Fuente 3: Google Maps  (requiere Playwright)
# ---------------------------------------------------------------------------

def _maps_collect_links(page, max_results: int) -> list[str]:
    """Scrollea el feed de Maps y devuelve hasta max_results URLs de lugares."""
    feed_sel = '[role="feed"]'
    try:
        from playwright.sync_api import TimeoutError as PWTimeout
        page.wait_for_selector(feed_sel, timeout=15_000)
    except Exception:
        print("  [!] No se encontró el panel de resultados.", file=sys.stderr)
        return []

    collected: set[str] = set()
    max_scrolls = max_results * 4

    for _ in range(max_scrolls):
        items = page.locator(f'{feed_sel} a[href*="/maps/place/"]').all()
        for a in items:
            href = a.get_attribute("href")
            if href:
                collected.add(href)
        if len(collected) >= max_results:
            break
        page.evaluate(
            "const f = document.querySelector('[role=\"feed\"]'); if(f) f.scrollBy(0, 900);"
        )
        time.sleep(1.5)
        if page.locator('text="Has llegado al final de la lista"').count() > 0:
            break

    return list(collected)[:max_results]


def _maps_extract_entry(page, link: str) -> dict | None:
    """Abre un lugar de Maps y extrae todos los datos disponibles."""
    try:
        page.goto(link, wait_until="domcontentloaded", timeout=20_000)
        time.sleep(DELAY_MAPS)
    except Exception as ex:
        print(f"  [!] No se pudo abrir {link}: {ex}", file=sys.stderr)
        return None

    e = empty_entry("GoogleMaps", link)

    # Nombre
    try:
        e["nombre"] = clean_text(page.locator("h1").first.text_content(timeout=5000))
    except Exception:
        pass

    # Categoría — aparece debajo del nombre como texto/botón
    try:
        # Selector robusto: primer botón con jsaction que no sea de rating/foto/etc.
        for sel in ['button[jsaction*="category"]', 'span.DkEaL', 'button.DkEaL']:
            el = page.locator(sel).first
            if el.count() and el.is_visible(timeout=1500):
                e["categoria_maps"] = clean_text(el.text_content())
                break
    except Exception:
        pass

    # Calificación
    try:
        for sel in ['span.ceNzKf', 'div.F7nice span[aria-hidden="true"]']:
            el = page.locator(sel).first
            if el.count() and el.is_visible(timeout=1500):
                e["calificacion"] = el.text_content(timeout=1500).strip()
                break
    except Exception:
        pass

    # Dirección
    try:
        for sel in ['[data-item-id="address"]', 'button[data-tooltip*="direcci"]']:
            el = page.locator(sel).first
            if el.count() and el.is_visible(timeout=2000):
                e["ciudad"] = clean_text(el.text_content())
                break
    except Exception:
        pass

    # Teléfono
    try:
        for sel in ['[data-item-id^="phone:tel"]', 'button[data-tooltip*="tel"]',
                    'a[href^="tel:"]']:
            el = page.locator(sel).first
            if el.count() and el.is_visible(timeout=2000):
                raw = clean_text(el.text_content() or el.get_attribute("href", "").replace("tel:", ""))
                if raw:
                    e = fill_phone_fields(e, raw)
                    break
    except Exception:
        pass

    # Sitio web
    try:
        for sel in ['[data-item-id="authority"]', 'a[data-item-id="authority"]']:
            el = page.locator(sel).first
            if el.count() and el.is_visible(timeout=2000):
                href = el.get_attribute("href") or ""
                if href.startswith("http"):
                    e["sitio_web"] = href
                    break
    except Exception:
        pass

    # WhatsApp link en el HTML de la página
    try:
        wa = WA_LINK_RE.findall(page.content())
        if wa and not e["whatsapp_link"]:
            e["whatsapp_link"] = f"https://wa.me/{wa[0]}"
    except Exception:
        pass

    return e if e["nombre"] else None


def scrape_google_maps(rubros: list[str], max_results_per_rubro: int) -> list[dict]:
    """
    Abre una sola sesión de Chromium y busca cada rubro en Google Maps.
    Itera los resultados y extrae datos de contacto de cada lugar.

    Requiere: pip install playwright && playwright install chromium
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(
            "\n[!] Playwright no instalado. Ejecuta:\n"
            "    pip install playwright\n"
            "    playwright install chromium\n",
            file=sys.stderr,
        )
        return []

    all_results: list[dict] = []
    seen_links: set[str] = set()

    print(f"\n[GoogleMaps] {len(rubros)} rubros — hasta {max_results_per_rubro} por rubro")
    print("  Se abrira una ventana del navegador, no la cierres.\n")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False, slow_mo=100)
        ctx = browser.new_context(locale="es-AR", viewport={"width": 1280, "height": 900})
        page = ctx.new_page()

        # Aceptar cookies una sola vez
        try:
            page.goto("https://www.google.com/maps", wait_until="domcontentloaded", timeout=20_000)
            time.sleep(2)
            accept = page.locator(
                'button:has-text("Aceptar todo"), button:has-text("Accept all")'
            ).first
            if accept.is_visible(timeout=3000):
                accept.click()
                time.sleep(1)
        except Exception:
            pass

        for rubro in rubros:
            query = f"{rubro} Argentina"
            print(f"  Buscando: '{query}'")

            try:
                page.goto(
                    f"https://www.google.com/maps/search/{quote(query)}",
                    wait_until="domcontentloaded",
                    timeout=25_000,
                )
                time.sleep(2.5)
            except Exception as ex:
                print(f"  [!] No se pudo cargar la búsqueda: {ex}", file=sys.stderr)
                continue

            links = _maps_collect_links(page, max_results_per_rubro)
            # Filtrar los ya visitados en rubros anteriores
            links = [l for l in links if l not in seen_links]
            seen_links.update(links)
            print(f"  {len(links)} lugares nuevos encontrados")

            rubro_count = 0
            for i, link in enumerate(links):
                print(f"    [{i+1}/{len(links)}] ", end="", flush=True)
                entry = _maps_extract_entry(page, link)
                if entry:
                    all_results.append(entry)
                    rubro_count += 1
                    print(
                        f"{entry['nombre'][:35]} | "
                        f"tel={entry['telefono'] or '-'} | "
                        f"web={'SI' if entry['sitio_web'] else 'NO'}"
                    )
                else:
                    print("sin datos")
                time.sleep(DELAY_MAPS)

            print(f"  Rubro '{rubro}': {rubro_count} resultados\n")

        browser.close()

    print(f"[GoogleMaps] Total acumulado: {len(all_results)}")
    return all_results


# ---------------------------------------------------------------------------
# Enriquecedor: visita el sitio web para extraer email/WA y detectar e-commerce
# ---------------------------------------------------------------------------

def enrich_from_website(entry: dict, session: requests.Session, check_ecommerce: bool = True) -> dict:
    url = entry.get("sitio_web", "")
    if not url:
        return entry

    soup = get_soup(url, session)
    if not soup:
        if check_ecommerce:
            entry["ecommerce"] = "ERROR"
        return entry

    text = soup.get_text(" ", strip=True)
    html = str(soup)

    # Email
    if not entry["email"]:
        ignore = {"ejemplo@", "example@", "noreply@", "user@"}
        for em in EMAIL_RE.findall(text):
            if not any(ig in em for ig in ignore):
                entry["email"] = em.lower()
                break

    # WhatsApp
    if not entry["whatsapp_link"]:
        wa = WA_LINK_RE.findall(html)
        if wa:
            entry["whatsapp_link"] = f"https://wa.me/{wa[0]}"

    # Teléfono
    if not entry["telefono"]:
        for ph in PHONE_DIGITS_RE.findall(text):
            norm = normalize_phone(ph)
            if len(re.sub(r"\D", "", norm)) >= 10:
                entry = fill_phone_fields(entry, ph.strip())
                break

    # Página de contacto
    if not entry["email"] or not entry["whatsapp_link"]:
        for a in soup.find_all("a", href=True):
            if re.search(r"contact|contacto", a["href"], re.I):
                csoup = get_soup(urljoin(url, a["href"]), session)
                if csoup:
                    ct, ch = csoup.get_text(" "), str(csoup)
                    if not entry["email"]:
                        ems = EMAIL_RE.findall(ct)
                        if ems:
                            entry["email"] = ems[0].lower()
                    if not entry["whatsapp_link"]:
                        wa = WA_LINK_RE.findall(ch)
                        if wa:
                            entry["whatsapp_link"] = f"https://wa.me/{wa[0]}"
                break

    # Detectar e-commerce (inline sin segunda petición porque ya tenemos el HTML)
    if check_ecommerce and not entry.get("ecommerce"):
        final_url = url.lower()
        html_lower = html.lower()
        detected = "NINGUNO"
        for nombre, sigs in ECOMMERCE_SIGNATURES:
            for sig in sigs:
                if sig.lower() in final_url or sig.lower() in html_lower:
                    detected = nombre
                    break
            if detected != "NINGUNO":
                break
        if detected == "NINGUNO":
            cart_hits = sum(1 for kw in ECOMMERCE_KEYWORDS if kw in html_lower)
            if cart_hits >= 2:
                detected = "OTRO"
        entry["ecommerce"] = detected

    return entry


# ---------------------------------------------------------------------------
# Deduplicación
# ---------------------------------------------------------------------------

def dedup(entries: list[dict]) -> list[dict]:
    seen, out = set(), []
    for e in entries:
        key = (
            re.sub(r"\D", "", e.get("telefono_norm", "")),
            e.get("email", "").lower(),
            e.get("nombre", "").lower()[:30],
        )
        if key not in seen:
            seen.add(key)
            out.append(e)
    return out


# ---------------------------------------------------------------------------
# CSV
# ---------------------------------------------------------------------------

COLUMNS = [
    "nombre", "categoria_maps", "telefono", "telefono_norm", "posible_celular",
    "whatsapp_link", "email", "ciudad", "calificacion",
    "sitio_web", "ecommerce", "fuente", "url_listing",
]

ECOMMERCE_LABEL = {
    "NINGUNO": "Sin tienda online  ← LEAD PRIORITARIO",
    "ERROR":   "No se pudo verificar",
    "":        "(no verificado)",
}


def export_csv(entries: list[dict], filename: str):
    with open(filename, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(entries)
    print(f"\nExportado: {filename} ({len(entries)} filas)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser(
        description="Scraper de distribuidoras de alimentos y bebidas (Argentina)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Ejemplos:\n"
            "  python scraper_distribuidoras.py\n"
            "  python scraper_distribuidoras.py --paginas 5\n"
            "  python scraper_distribuidoras.py --maps --resultados-maps 80\n"
            "  python scraper_distribuidoras.py --rapido\n"
            "  python scraper_distribuidoras.py --rubro \"distribuidora snacks\"\n"
        ),
    )
    p.add_argument(
        "--rubro", default="",
        help=(
            "Buscar un rubro puntual en lugar de la lista alimentaria completa. "
            "Ej: --rubro \"distribuidora lacteos\""
        ),
    )
    p.add_argument(
        "--paginas", type=int, default=3,
        help="Paginas por directorio online (default: 3, ~30-60 resultados por fuente)",
    )
    p.add_argument(
        "--maps", action="store_true",
        help="Incluir Google Maps. Abre Chromium, no requiere API key.",
    )
    p.add_argument(
        "--resultados-maps", type=int, default=40,
        help="Maximo de resultados de Maps por rubro (default: 40)",
    )
    p.add_argument(
        "--rapido", action="store_true",
        help=(
            "NO visitar los sitios web. Mas rapido pero sin email, "
            "WhatsApp ni deteccion de e-commerce."
        ),
    )
    p.add_argument(
        "--salida", default="",
        help="Nombre del archivo CSV (default: distribuidoras_FECHA_HORA.csv)",
    )
    args = p.parse_args()

    # ---- Rubros a buscar ------------------------------------------------
    if args.rubro:
        rubros = [args.rubro]
    else:
        rubros = RUBROS_ALIMENTOS
        print(f"Buscando {len(rubros)} rubros alimentarios:")
        for r in rubros:
            print(f"  • {r}")

    enriquecer = not args.rapido

    session = requests.Session()
    session.headers.update(HEADERS)
    all_entries: list[dict] = []

    # ---- Directorios online ---------------------------------------------
    for rubro in rubros:
        all_entries.extend(scrape_paginas_amarillas(rubro, args.paginas, session))
        all_entries.extend(scrape_guia(rubro, args.paginas, session))

    # ---- Google Maps ----------------------------------------------------
    if args.maps:
        maps_results = scrape_google_maps(rubros, args.resultados_maps)
        all_entries.extend(maps_results)

    # ---- Dedup temprana (antes de enriquecer para no visitar duplicados) -
    before = len(all_entries)
    all_entries = dedup(all_entries)
    if before != len(all_entries):
        print(f"\nDeduplicados antes de enriquecer: {before} → {len(all_entries)}")

    # ---- Enriquecimiento (activo por defecto) ---------------------------
    if enriquecer and all_entries:
        con_web = sum(1 for e in all_entries if e.get("sitio_web"))
        print(f"\n[Enriqueciendo] {con_web} entradas con sitio web...")
        for i, entry in enumerate(all_entries):
            if entry.get("sitio_web"):
                print(
                    f"  [{i+1}/{len(all_entries)}] {entry['sitio_web'][:65]}",
                    flush=True,
                )
                all_entries[i] = enrich_from_website(entry, session)
                time.sleep(DELAY)
            else:
                all_entries[i]["ecommerce"] = "(sin web)"
    elif not enriquecer:
        print("\n[--rapido] Omitiendo visita a webs.")

    # ---- Dedup final ----------------------------------------------------
    before = len(all_entries)
    all_entries = dedup(all_entries)
    print(f"\nTotal final: {len(all_entries)} empresas unicas ({before - len(all_entries)} duplicados eliminados)")

    if not all_entries:
        print("Sin resultados. Proba con --paginas 5 o un --rubro diferente.")
        return

    # ---- Exportar -------------------------------------------------------
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = args.salida or f"distribuidoras_{ts}.csv"
    export_csv(all_entries, filename)

    # ---- Resumen --------------------------------------------------------
    NO_ECOMM = {"NINGUNO", "(sin web)"}
    SI_ECOMM = {n for n, _ in ECOMMERCE_SIGNATURES} | {"OTRO"}

    con_email  = sum(1 for e in all_entries if e.get("email"))
    con_wa     = sum(1 for e in all_entries if e.get("whatsapp_link"))
    sin_ecomm  = sum(1 for e in all_entries if e.get("ecommerce") in NO_ECOMM)
    con_ecomm  = sum(1 for e in all_entries if e.get("ecommerce") in SI_ECOMM)
    sin_web    = sum(1 for e in all_entries if e.get("ecommerce") == "(sin web)")
    no_verif   = sum(1 for e in all_entries if e.get("ecommerce") in ("", None, "ERROR"))

    print(f"""
========================================
 RESUMEN
========================================
  Total empresas       : {len(all_entries)}
  Con email            : {con_email}
  Con WhatsApp/celular : {con_wa}
  ----------------------------------------
  SIN e-commerce       : {sin_ecomm}  <- LEADS PRIORITARIOS para tu app
    de los cuales sin web: {sin_web}  <- solo tienen telefono
  CON e-commerce       : {con_ecomm}  <- ya tienen tienda online
  No verificado/error  : {no_verif}
========================================
  Archivo: {filename}
""")

    if con_ecomm > 0:
        ecomm_dist: dict[str, int] = {}
        for e in all_entries:
            ec = e.get("ecommerce", "")
            if ec in SI_ECOMM:
                ecomm_dist[ec] = ecomm_dist.get(ec, 0) + 1
        print("  Plataformas detectadas en leads con e-commerce:")
        for plat, cnt in sorted(ecomm_dist.items(), key=lambda x: -x[1]):
            print(f"    {plat}: {cnt}")


if __name__ == "__main__":
    main()
