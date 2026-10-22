# -*- coding: utf-8 -*-
"""Cek layout: tidak ada scroll horizontal, elemen kunci terlihat (desktop + mobile)."""
import pathlib
import threading
import functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = str(pathlib.Path(__file__).resolve().parent.parent / "dist")
PORT = 8803
BASE = "http://127.0.0.1:%d" % PORT
PAGES = ["index.html", "materi.html", "rumus.html", "kasus.html", "kalkulator.html"]

failures = []


def check(cond, msg):
    print("[%s] %s" % ("PASS" if cond else "FAIL", msg))
    if not cond:
        failures.append(msg)


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


handler = functools.partial(Quiet, directory=ROOT)
httpd = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

with sync_playwright() as p:
    browser = p.chromium.launch()

    # desktop
    ctx = browser.new_context(viewport={"width": 1440, "height": 950})
    page = ctx.new_page()
    for name in PAGES:
        page.goto("%s/%s" % (BASE, name), wait_until="load")
        page.wait_for_timeout(200)
        sw = page.evaluate("() => document.documentElement.scrollWidth")
        check(sw <= 1441, "%s: tanpa scroll horizontal desktop (scrollWidth=%d)" % (name, sw))
        check(page.locator(".site-header").is_visible(), "%s: header terlihat" % name)

    page.goto(BASE + "/index.html")
    check(page.locator(".hero h1").is_visible(), "beranda: judul hero terlihat")
    first_q = page.locator("a.quick").first
    check(first_q.bounding_box() is not None, "beranda: kartu akses terlihat")

    page.goto(BASE + "/kalkulator.html")
    page.wait_for_timeout(300)
    check(page.locator("#mode-tabs .mode-tab").first.is_visible(), "kalkulator: tab mode terlihat")
    check(page.locator("#calc-form .field").first.is_visible(), "kalkulator: form input terlihat")
    check(page.locator("#calc-results .result").first.is_visible(), "kalkulator: kartu hasil terlihat")
    check(page.locator("#calc-charts svg").first.is_visible(), "kalkulator: grafik terlihat")
    box = page.locator("#calc-charts svg").first.bounding_box()
    check(box and box["width"] > 300, "kalkulator: lebar grafik layak (%s)" % (box and round(box["width"])))

    # mobile
    mob = browser.new_context(viewport={"width": 390, "height": 844})
    mp = mob.new_page()
    for name in PAGES:
        mp.goto("%s/%s" % (BASE, name), wait_until="load")
        mp.wait_for_timeout(200)
        sw = mp.evaluate("() => document.documentElement.scrollWidth")
        check(sw <= 391, "%s: tanpa scroll horizontal mobile (scrollWidth=%d)" % (name, sw))
    mp.goto(BASE + "/kalkulator.html")
    mp.wait_for_timeout(300)
    check(mp.locator("#mode-tabs .mode-tab").first.is_visible(), "mobile: tab mode terlihat")
    check(mp.locator(".site-nav a").first.is_visible(), "mobile: menu terlihat")
    msw = mp.evaluate("() => document.documentElement.scrollWidth")
    check(msw <= 391, "mobile: kalkulator tidak overflow (scrollWidth=%d)" % msw)

    browser.close()

httpd.shutdown()
print("=" * 60)
print("HASIL: %d GAGAL" % len(failures) if failures else "HASIL: SEMUA TES LULUS")
