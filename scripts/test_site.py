# -*- coding: utf-8 -*-
"""E2E test site ekonomi-mikro: semua halaman, 8 mode kalkulator, grafik, prefill."""
import sys
import pathlib
import threading
import functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = str(pathlib.Path(__file__).resolve().parent.parent)  # repo root
PORT = 8791
BASE = "http://127.0.0.1:%d" % PORT

PAGES = ["index.html", "materi.html", "rumus.html", "kasus.html", "kalkulator.html"]
MODES = ["keseimbangan", "elastisitas", "surplus", "utilitas", "produksi", "biaya", "laba", "diskriminasi"]

failures = []


def check(cond, msg):
    tag = "PASS" if cond else "FAIL"
    print("[%s] %s" % (tag, msg))
    if not cond:
        failures.append(msg)


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def main():
    handler = functools.partial(Quiet, directory=ROOT)
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 950})
        page = ctx.new_page()

        errors = []
        page.on("pageerror", lambda e: errors.append("pageerror: %s" % e))
        page.on("console", lambda m: errors.append("console: %s" % m.text) if m.type == "error" else None)

        # ---------- 1. semua halaman terbuka + menu ada ----------
        for name in PAGES:
            errors.clear()
            page.goto("%s/%s" % (BASE, name), wait_until="load")
            check(page.title() != "", "%s: judul terbaca (%s)" % (name, page.title()[:50]))
            nav = page.locator(".site-nav a")
            check(nav.count() == 5, "%s: menu ada 5 item (ada %d)" % (name, nav.count()))
            active = page.locator('.site-nav a[aria-current="true"]')
            check(active.count() == 1, "%s: menu aktif ditandai (ada %d)" % (name, active.count()))
            check(not errors, "%s: tanpa error JS (%s)" % (name, "; ".join(errors[:2])))

        # ---------- 2. beranda punya kartu akses ----------
        page.goto(BASE + "/index.html")
        check(page.locator("a.quick").count() == 4, "beranda: 4 kartu akses cepat")

        # ---------- 3. semua tab mode menghitung + grafik ----------
        page.goto(BASE + "/kalkulator.html")
        tabs = page.locator(".mode-tab")
        check(tabs.count() == 8, "kalkulator: 8 tab mode (ada %d)" % tabs.count())

        for i, key in enumerate(MODES):
            errors.clear()
            tabs.nth(i).click()
            title = page.locator("#calc-title").inner_text()
            n_res = page.locator("#calc-results .result").count()
            n_steps = page.locator("#calc-steps li").count()
            n_charts = page.locator("#calc-charts .chart-card").count()
            n_svg = page.locator("#calc-charts svg").count()
            status = page.locator("#calc-status").inner_text()
            check(n_res >= 4, "mode %s: hasil muncul (%d kartu)" % (key, n_res))
            check(n_steps >= 3, "mode %s: langkah penyelesaian muncul (%d)" % (key, n_steps))
            check(n_charts >= 1 and n_svg >= 1, "mode %s: grafik SVG muncul (%d)" % (key, n_charts))
            check(len(status) > 10, "mode %s: kesimpulan tampil" % key)
            check(not errors, "mode %s: tanpa error JS (%s)" % (key, "; ".join(errors[:2])))

        # ---------- 4. field muncul-hilang sesuai pilihan ----------
        errors.clear()
        tabs.nth(0).click()
        page.select_option("#f-keseimbangan-policy", "pajak")
        check(page.locator("#w-keseimbangan-t").is_visible(), "keseimbangan: field pajak muncul saat pilih 'pajak'")
        page.fill("#f-keseimbangan-t", "1.25")
        page.wait_for_timeout(500)
        res_txt = page.locator("#calc-results").inner_text()
        check("16,4" in res_txt, "keseimbangan: pajak 1.25 -> Pb naik ke 16,42")
        page.select_option("#f-keseimbangan-policy", "floor")
        check(page.locator("#w-keseimbangan-Pmin").is_visible(), "keseimbangan: field floor muncul")
        page.wait_for_timeout(500)
        floor_txt = page.locator("#calc-results").inner_text().lower()
        check("kelebihan penawaran" in floor_txt, "keseimbangan: floor -> kartu kelebihan penawaran tampil")
        check("biaya pembelian pemerintah" in floor_txt, "keseimbangan: floor -> biaya pembelian tampil")
        check(not errors, "interaksi kebijakan tanpa error JS")

        # ---------- 5. sub-mode elastisitas ----------
        errors.clear()
        tabs.nth(1).click()
        page.select_option("#f-elastisitas-sub", "busur")
        check(page.locator("#w-elastisitas-bp1").is_visible(), "elastisitas: field busur muncul")
        n_steps = page.locator("#calc-steps li").count()
        check(n_steps >= 2, "elastisitas busur: langkah muncul (%d)" % n_steps)
        check(not errors, "sub-mode busur tanpa error JS")

        # ---------- 6. tombol prefill dari rumus.html ----------
        errors.clear()
        page.goto(BASE + "/rumus.html")
        btn = page.locator("[data-calc]").first
        btn.click()
        page.wait_for_url("**/kalkulator.html?*", timeout=5000)
        check("mode=" in page.url, "rumus: tombol prefill pindah ke kalkulator (%s)" % page.url[-70:])
        page.wait_for_timeout(300)
        check(page.locator("#calc-results .result").count() >= 4, "rumus: hasil terisi dari prefill")
        check(not errors, "prefill rumus tanpa error JS")

        # ---------- 7. tombol prefill kasus (floor 600 / mobil) ----------
        errors.clear()
        page.goto(BASE + "/kasus.html")
        page.locator("[data-calc]").nth(1).click()  # kasus floor gabah
        page.wait_for_url("**/kalkulator.html?*", timeout=5000)
        page.wait_for_timeout(300)
        vals = page.locator("#calc-results").inner_text()
        check("500" in vals, "kasus: prefill floor → surplus 500 tampil")
        check("300" in page.locator("#calc-results").inner_text(), "kasus: prefill floor → biaya 300 miliar tampil")
        check(not errors, "prefill kasus tanpa error JS")

        # ---------- 8. screenshot ----------
        page.goto(BASE + "/index.html")
        page.screenshot(path=ROOT + "/scripts/shot-beranda.png", full_page=False)
        page.goto(BASE + "/kalkulator.html")
        page.wait_for_timeout(400)
        page.screenshot(path=ROOT + "/scripts/shot-kalkulator.png", full_page=True)
        page.goto(BASE + "/materi.html")
        page.screenshot(path=ROOT + "/scripts/shot-materi.png", full_page=False)

        mob = browser.new_context(viewport={"width": 390, "height": 844})
        mp = mob.new_page()
        mp.goto(BASE + "/kalkulator.html")
        mp.wait_for_timeout(400)
        mp.screenshot(path=ROOT + "/scripts/shot-mobile.png", full_page=False)
        mob.close()

        browser.close()
    httpd.shutdown()

    print("\n" + "=" * 60)
    if failures:
        print("HASIL: %d GAGAL" % len(failures))
        for f in failures:
            print("  - " + f)
        sys.exit(1)
    print("HASIL: SEMUA TES LULUS")


if __name__ == "__main__":
    main()
