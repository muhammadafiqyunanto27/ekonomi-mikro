# -*- coding: utf-8 -*-
"""Cek link: anchor internal harus punya target, link halaman harus ada filenya."""
import pathlib
import re
import threading
import functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent / "dist"
PORT = 8806
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


handler = functools.partial(Quiet, directory=str(ROOT))
httpd = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    for name in PAGES:
        page.goto("%s/%s" % (BASE, name), wait_until="load")
        missing = page.evaluate("""() => {
            const bad = [];
            document.querySelectorAll('a[href^="#"]').forEach(a => {
                const id = a.getAttribute('href').slice(1);
                if (id && !document.getElementById(id)) bad.push(a.getAttribute('href'));
            });
            return bad;
        }""")
        check(not missing, "%s: semua anchor internal valid (%s)" % (name, ", ".join(missing[:4]) or "ok"))

        broken = page.evaluate("""() => {
            const bad = [];
            document.querySelectorAll('a[href]').forEach(a => {
                const h = a.getAttribute('href');
                if (/^(https?:|mailto:|#|data:)/.test(h)) return;
                const file = h.split('?')[0].split('#')[0];
                if (file && !['index.html','materi.html','rumus.html','kasus.html','kalkulator.html'].includes(file)) {
                    bad.push(h);
                }
            });
            return bad;
        }""")
        check(not broken, "%s: link halaman dikenal (%s)" % (name, ", ".join(broken[:4]) or "ok"))

    # file yang dirujuk benar-benar ada di disk
    html = "".join((ROOT / n).read_text(encoding="utf-8") for n in PAGES)
    refs = set(re.findall(r'(?:href|src)="([^"#?:]+\.(?:css|js))"', html))
    for ref in sorted(refs):
        check((ROOT / ref.lstrip("/")).exists(), "aset ada: %s" % ref)

    browser.close()

httpd.shutdown()
print("=" * 60)
print("HASIL: %d GAGAL" % len(failures) if failures else "HASIL: SEMUA TES LULUS")
