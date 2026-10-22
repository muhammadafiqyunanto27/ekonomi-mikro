# -*- coding: utf-8 -*-
"""E2E test UI baru: mode terang/gelap, tutorial kalkulator, penjelasan
per halaman, padding atas, penomoran tab, legend form, dan tombol Reset."""
import sys
import pathlib
import threading
import functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = str(pathlib.Path(__file__).resolve().parent.parent / "dist")  # situs hasil build Astro
PORT = 8809
BASE = "http://127.0.0.1:%d" % PORT

PAGES = ["index.html", "materi.html", "rumus.html", "kasus.html", "kalkulator.html"]

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
        ctx = browser.new_context(viewport={"width": 1440, "height": 950}, color_scheme="light")
        page = ctx.new_page()

        errors = []
        page.on("pageerror", lambda e: errors.append("pageerror: %s" % e))
        page.on("console", lambda m: errors.append("console: %s" % m.text) if m.type == "error" else None)

        # ---------- 1. tombol tema ada di semua halaman ----------
        for name in PAGES:
            page.goto("%s/%s" % (BASE, name), wait_until="load")
            n = page.locator("[data-theme-toggle]").count()
            check(n == 1, "%s: 1 tombol mode terang/gelap (ada %d)" % (name, n))
            check(page.evaluate("!!window.EK_THEME"), "%s: theme.js aktif" % name)

        # ---------- 2. ganti ke mode gelap (kalkulator) ----------
        errors.clear()
        page.goto(BASE + "/kalkulator.html", wait_until="load")
        page.wait_for_timeout(400)
        first_grid = page.locator("#calc-charts svg line").first
        stroke_light = first_grid.get_attribute("stroke")
        check(page.evaluate("document.documentElement.getAttribute('data-theme')") != "dark",
              "kalkulator: awalnya mode terang")

        page.click("[data-theme-toggle]")
        page.wait_for_timeout(200)
        theme = page.evaluate("document.documentElement.getAttribute('data-theme')")
        check(theme == "dark", "tombol tema -> data-theme=dark (didapat %r)" % theme)
        check(page.evaluate("localStorage.getItem('ek-theme')") == "dark", "tema gelap tersimpan di localStorage")
        pressed = page.locator("[data-theme-toggle]").get_attribute("aria-pressed")
        check(pressed == "true", "tombol tema aria-pressed=true (didapat %r)" % pressed)
        label = page.locator(".theme-btn-txt").inner_text()
        check(label.strip().lower() == "terang", "label tombol berubah jadi 'Terang' (didapat %r)" % label)
        n_svg = page.locator("#calc-charts svg").count()
        check(n_svg >= 1, "grafik tetap ada setelah ganti tema (%d svg)" % n_svg)
        stroke_dark = page.locator("#calc-charts svg line").first.get_attribute("stroke")
        check(stroke_dark == "#2c2618",
              "warna grid grafik ikut tema gelap (%s -> %s)" % (stroke_light, stroke_dark))
        check(not errors, "ganti tema tanpa error JS (%s)" % "; ".join(errors[:2]))

        # body pakai warna gelap
        body_bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
        check(body_bg == "rgb(20, 17, 12)", "background body jadi gelap (%s)" % body_bg)

        # ---------- 3. tema bertahan setelah muat ulang ----------
        errors.clear()
        page.reload(wait_until="load")
        page.wait_for_timeout(400)
        check(page.evaluate("document.documentElement.getAttribute('data-theme')") == "dark",
              "tema gelap bertahan setelah reload")
        n_svg = page.locator("#calc-charts svg").count()
        check(n_svg >= 1, "grafik tetap ter-render setelah reload mode gelap (%d)" % n_svg)

        # kembali ke terang
        page.click("[data-theme-toggle]")
        page.wait_for_timeout(200)
        check(page.evaluate("document.documentElement.getAttribute('data-theme')") is None,
              "toggle lagi -> kembali mode terang")
        check(page.evaluate("localStorage.getItem('ek-theme')") == "light", "tema terang tersimpan")
        check(page.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(244, 239, 228)",
              "background body kembali terang")
        check(not errors, "reload + toggle balik tanpa error JS (%s)" % "; ".join(errors[:2]))

        # ---------- 4. tutorial kalkulator ----------
        errors.clear()
        check(page.locator("#cara-kalkulator").count() == 1, "kalkulator: blok tutorial #cara-kalkulator ada")
        n_how = page.locator("#cara-kalkulator .howto .how").count()
        check(n_how == 4, "kalkulator: 4 langkah cara pakai (ada %d)" % n_how)
        mg = page.locator("#cara-kalkulator .mode-guide")
        check(mg.count() == 1, "kalkulator: panduan per mode (details) ada")
        mg.locator("summary").click()
        check(mg.get_attribute("open") is not None, "kalkulator: panduan per mode bisa dibuka")
        n_mg = mg.locator(".mg").count()
        check(n_mg == 8, "panduan memuat 8 mode (ada %d)" % n_mg)
        check(not errors, "tutorial tanpa error JS (%s)" % "; ".join(errors[:2]))

        # judul bagian keluaran
        titles = page.locator(".calc-out .out-title").all_inner_texts()
        tl = " | ".join(titles).lower()
        check("hasil" in tl and "grafik" in tl, "kalkulator: judul bagian 'Hasil' & 'Grafik' ada (%s)" % tl)

        # legend form
        check(page.locator(".calc-form .form-legend").is_visible(), "kalkulator: petunjuk form (legend) tampil")

        # penomoran tab
        t0 = page.locator(".mode-tab").first.inner_text()
        check(t0.strip().startswith("01"), "tab mode bernomor 01..08 (didapat %r)" % t0.strip()[:12])

        # ---------- 5. tombol Reset mengembalikan contoh ----------
        errors.clear()
        page.goto(BASE + "/kalkulator.html", wait_until="load")
        page.wait_for_timeout(400)
        before = page.locator("#calc-results").inner_text()
        page.fill("#f-keseimbangan-a", "300")
        page.wait_for_timeout(600)
        after = page.locator("#calc-results").inner_text()
        check(after != before, "mengubah angka -> hasil ikut berubah")
        page.click("button:has-text('Reset')")
        page.wait_for_timeout(600)
        reset_txt = page.locator("#calc-results").inner_text()
        check(reset_txt == before, "tombol Reset -> hasil kembali persis ke contoh awal")
        check(page.input_value("#f-keseimbangan-a") == "200", "Reset mengembalikan input (a=200)")
        check(not errors, "Reset tanpa error JS (%s)" % "; ".join(errors[:2]))

        # ---------- 6. penjelasan per halaman ----------
        errors.clear()
        page.goto(BASE + "/index.html", wait_until="load")
        check(page.locator("#cara-pakai").count() == 1, "beranda: bagian 'Cara memakai situs ini' ada")
        n_how = page.locator("#cara-pakai .howto .how").count()
        check(n_how == 4, "beranda: 4 langkah cara pakai (ada %d)" % n_how)
        check(page.locator("#cara-pakai .guide").count() == 1, "beranda: blok 'fitur yang mudah terlewat' ada")

        for name, key in [("materi.html", "membaca"), ("rumus.html", "lembar rumus"),
                          ("kasus.html", "struktur setiap")]:
            page.goto("%s/%s" % (BASE, name), wait_until="load")
            g = page.locator("aside.guide")
            check(g.count() >= 1, "%s: blok penjelasan (.guide) ada" % name)
            txt = " ".join(g.all_inner_texts()).lower()
            check(key in txt, "%s: penjelasan memuat kunci %r" % (name, key))

        # tabel simbol di rumus
        page.goto(BASE + "/rumus.html", wait_until="load")
        rows = page.locator(".table-wrap table.t tbody tr").count()
        check(rows >= 8, "rumus: tabel daftar simbol memuat %d baris" % rows)

        # ---------- 7. padding atas berkurang ----------
        page.goto(BASE + "/index.html", wait_until="load")
        hero_pad = page.evaluate("parseFloat(getComputedStyle(document.querySelector('.hero')).paddingTop)")
        sect_pad = page.evaluate(
            "parseFloat(getComputedStyle(document.querySelectorAll('.section')[1]).paddingTop)")
        check(hero_pad <= 50, "beranda: padding atas hero <= 50px (didapat %.0fpx)" % hero_pad)
        check(sect_pad <= 50, "beranda: padding atas section <= 50px (didapat %.0fpx)" % sect_pad)

        page.goto(BASE + "/kalkulator.html", wait_until="load")
        crumb_pad = page.evaluate(
            "(function(){var e=document.querySelector('.page-crumb');"
            "return e ? parseFloat(getComputedStyle(e).paddingTop) : -1;})()")
        check(0 <= crumb_pad <= 16, "kalkulator: padding atas crumb <= 16px (didapat %.0fpx)" % crumb_pad)

        # ---------- 8. mode gelap: tanpa overflow horizontal (mobile) ----------
        mob = browser.new_context(viewport={"width": 390, "height": 844}, color_scheme="light")
        mp = mob.new_page()
        mp.goto(BASE + "/kalkulator.html", wait_until="load")
        mp.evaluate("localStorage.setItem('ek-theme','dark')")
        mp.reload(wait_until="load")
        mp.wait_for_timeout(500)
        sw = mp.evaluate("document.documentElement.scrollWidth")
        check(sw <= 391, "mobile gelap: tanpa overflow horizontal (scrollWidth=%d)" % sw)
        mp.click("[data-theme-toggle]")  # toggle di mobile ikut berfungsi
        mp.wait_for_timeout(200)
        check(mp.evaluate("document.documentElement.getAttribute('data-theme')") is None,
              "mobile: tombol tema berfungsi")
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
