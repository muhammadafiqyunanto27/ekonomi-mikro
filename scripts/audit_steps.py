"""Audit tampilan langkah kalkulator untuk semua 8 mode.

Cek: blok rumus tidak terjepit ke kolom nomor, tiap persamaan pendek
satu baris horizontal, dan tidak ada objek mentah yang tercetak.
"""
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright

try:
    import sys, io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent


class Q(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def log_message(self, *a):
        pass


MEASURE = """() => {
  const lis = [...document.querySelectorAll('#calc-steps li')];
  const bad = [];
  const longLines = [];
  let minLinesWidth = Infinity, maxLineHeight = 0, maxLineWidth = 0;
  lis.forEach((li, i) => {
    const body = li.querySelector('.st-body');
    const lines = li.querySelector('.st-lines');
    const eqs = [...li.querySelectorAll('.st-eq')];
    const liW = li.getBoundingClientRect().width;
    if (body) {
      const bw = body.getBoundingClientRect().width;
      if (bw < liW * 0.6) bad.push(`step ${i+1}: body cuma ${Math.round(bw)}px dari ${Math.round(liW)}px`);
    } else {
      bad.push(`step ${i+1}: tidak ada .st-body`);
    }
    if (lines) {
      const w = lines.getBoundingClientRect().width;
      minLinesWidth = Math.min(minLinesWidth, w);
      if (w < 180) bad.push(`step ${i+1}: .st-lines cuma ${Math.round(w)}px`);
    }
    eqs.forEach((eq, j) => {
      const line = eq.querySelector('.st-line');
      if (!line) return;
      const r = line.getBoundingClientRect();
      maxLineHeight = Math.max(maxLineHeight, r.height);
      maxLineWidth = Math.max(maxLineWidth, r.width);
      const fs = parseFloat(getComputedStyle(line).fontSize) || 16;
      const lh = parseFloat(getComputedStyle(line).lineHeight) || fs * 1.7;
      const text = line.textContent || '';
      // flex item = blok, jadi hitung baris dari tinggi / line-height
      const rows = Math.max(1, Math.round(r.height / lh));
      // persamaan pendek wajib satu baris; yang panjang boleh membungkus wajar
      if (rows > 1 && text.length < 45) {
        bad.push(`step ${i+1} eq ${j+1}: ${rows} baris untuk rumus pendek (${text.length} char): ${text}`);
      }
      // menumpuk parah: banyak baris padahal teks pendek
      if (rows >= 4 && text.length < 30) {
        bad.push(`step ${i+1} eq ${j+1}: menumpuk ${rows} baris: ${text}`);
      }
      // satu baris tidak boleh lebih tinggi dari ~1.9x font-size
      if (rows === 1 && r.height > fs * 1.9) {
        bad.push(`step ${i+1} eq ${j+1}: tinggi ${Math.round(r.height)}px (font ${Math.round(fs)}px)`);
      }
      if (rows > 1) {
        longLines.push({ step: i + 1, eq: j + 1, rows, len: text.length, text });
      }
    });
  });
  const txt = document.querySelector('#calc-steps')?.innerText || '';
  if (txt.includes('[object Object]')) bad.push('ada teks [object Object]');
  return {
    steps: lis.length,
    minLinesWidth: minLinesWidth === Infinity ? null : Math.round(minLinesWidth),
    maxLineWidth: Math.round(maxLineWidth),
    maxLineHeight: Math.round(maxLineHeight),
    bad,
    longLines,
    sample: txt.split('\\n').filter(Boolean).slice(0, 5),
    error: document.querySelector('#calc-error')?.textContent?.trim() || '',
    results: [...document.querySelectorAll('#calc-results .rvalue')].slice(0, 3).map(e => e.textContent.trim()),
  };
}"""


def main():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Q)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    failures = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={"width": 1280, "height": 900})
        page.goto(f"http://127.0.0.1:{port}/kalkulator.html", wait_until="networkidle")
        page.wait_for_timeout(500)
        tabs = page.locator("#mode-tabs .mode-tab")
        n = tabs.count()
        print(f"mode ditemukan: {n}")
        for i in range(n):
            tab = tabs.nth(i)
            label = tab.text_content().strip()
            tab.click()
            page.wait_for_timeout(350)
            info = page.evaluate(MEASURE)
            status = "OK " if not info["bad"] and not info["error"] else "BAD"
            print(f"[{status}] {label}: steps={info['steps']} "
                  f"linesW={info['minLinesWidth']} lineMaxH={info['maxLineHeight']} "
                  f"results={info['results']}")
            if info["error"]:
                print(f"        error: {info['error']}")
            if info["sample"]:
                print(f"        {info['sample'][1] if len(info['sample']) > 1 else info['sample'][0]}")
            for msg in info["bad"]:
                print(f"        - {msg}")
            for ln in info["longLines"]:
                print(f"        panjang: step {ln['step']} eq {ln['eq']} -> {ln['rows']} baris ({ln['len']} char): {ln['text']}")
            if info["bad"] or info["error"] or info["steps"] == 0:
                failures.append(label)
        b.close()
    httpd.shutdown()
    print("\nHASIL:", "SEMUA MODE OK" if not failures else f"GAGAL: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
