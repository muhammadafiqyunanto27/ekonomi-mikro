# -*- coding: utf-8 -*-
"""Generate multi-page site from the single-page source scripts/single.html.

ARsip penting: sejak penambahan mode gelap/terang, tombol tema, tutorial
kalkulator, dan blok penjelasan per halaman, kelima halaman di root dirawat
LANGSUNG (bukan lagi hasil generate dari scripts/single.html). Jalankan
skrip ini hanya kalau kamu sengaja ingin membangun ulang dari snapshot lama —
skrip akan menolak berjalan kecuali diberi --force, karena hasil generate
akan menghapus semua tambahan tersebut.

Pages produced (in repo root):
  index.html       — Beranda (hero + kartu akses cepat + cara pakai)
  materi.html      — Bab 1-7
  rumus.html       — Kumpulan rumus (tombol prefill ke kalkulator)
  kasus.html       — 8 studi kasus (tombol prefill ke kalkulator)
  kalkulator.html  — Kalkulator 8 mode + tutorial

Sumber (scripts/single.html) adalah snapshot halaman tunggal lama;
jalankan ulang script ini hanya kalau sumber itu yang diedit.
"""
import pathlib
import re
import sys

if "--force" not in sys.argv:
    raise SystemExit(
        "DIBATALKAN: kelima halaman root kini dirawat langsung (single.html sudah "
        "ketinggalan — tidak ada tombol tema/tutorial/penjelasan di dalamnya).\n"
        "Kalau yakin ingin membangun ulang dari snapshot lama, jalankan:\n"
        "  python scripts/build_pages.py --force")

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "single.html"

src = SRC.read_text(encoding="utf-8")
lines = src.splitlines(keepends=True)


def idx_of(word):
    for i, line in enumerate(lines):
        if word in line:
            return i
    raise SystemExit("marker tidak ditemukan: " + word)


i_hero = idx_of("HERO -->")
i_materi = idx_of("MATERI -->")
i_rumus = idx_of("RUMUS -->")
i_kasus = idx_of("KASUS -->")
i_kal = idx_of("KALKULATOR -->")
i_main = next(i for i, l in enumerate(lines) if '<main id="top">' in l)
i_end = next(i for i, l in enumerate(lines) if "</main>" in l)

assert i_hero < i_materi < i_rumus < i_kasus < i_kal < i_end

shell = "".join(lines[: i_main + 1])
tail = "".join(lines[i_end:])

hero = "".join(lines[i_hero:i_materi])
materi = "".join(lines[i_materi:i_rumus])
rumus = "".join(lines[i_rumus:i_kasus])
kasus = "".join(lines[i_kasus:i_kal])
kalk = "".join(lines[i_kal:i_end])

# --- perbaikan shell (berlaku untuk semua halaman) -----------------------
shell = shell.replace('href="#materi">Lewati ke materi', 'href="#top">Lewati ke isi halaman')
shell = shell.replace('href="#top">EKONOMI', 'href="index.html">EKONOMI')

NAV = [
    ("index.html", "Beranda"),
    ("materi.html", "Materi"),
    ("rumus.html", "Rumus"),
    ("kasus.html", "Kasus Nyata"),
    ("kalkulator.html", "Kalkulator"),
]

nav_re = re.compile(r'<nav class="site-nav".*?</nav>', re.S)
assert nav_re.search(shell), "blok nav tidak ditemukan"


def build_nav(active):
    items = []
    for href, label in NAV:
        cur = ' aria-current="true"' if href == active else ""
        items.append('      <a href="%s"%s>%s</a>' % (href, cur, label))
    return '<nav class="site-nav" aria-label="Navigasi utama">\n' + "\n".join(items) + "\n    </nav>"


# --- hero: tautan bagian lama → halaman baru ---------------------------
for _anchor, _page in [("#materi", "materi.html"), ("#rumus", "rumus.html"),
                       ("#kasus", "kasus.html"), ("#kalkulator", "kalkulator.html")]:
    hero = hero.replace('href="%s"' % _anchor, 'href="%s"' % _page)

# --- footer: path lama ---------------------------------------------------
tail = tail.replace("website/index.html", "index.html")

# --- kalkulator: tambahkan wadah kesimpulan ------------------------------
assert '<div class="calc-out">' in kalk, "blok calc-out tidak ditemukan"
kalk = kalk.replace(
    '<div class="calc-out">',
    '<div class="calc-out">\n            <div class="calc-status" id="calc-status" aria-live="polite"></div>',
    1,
)

# --- blok halaman baru ---------------------------------------------------
CRUMB = (
    '<div class="container"><p class="page-crumb">'
    '<a href="index.html">Beranda</a> / <b>{}</b></p></div>\n'
)

QUICK = """
<section class="section" id="akses">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">Navigasi</p>
      <h2>Isi situs ini</h2>
      <p class="desc">Empat bagian utama — dibaca berurutan dari materi ke kalkulator, atau langsung menuju yang kamu butuhkan.</p>
    </div>
    <div class="quick-grid">
      <a class="quick" href="materi.html">
        <span class="qtag">01 &middot; Bab 1&ndash;7</span>
        <h3>Materi</h3>
        <p>Perkembangan ilmu ekonomi, mekanisme pasar, kebijakan &amp; kegagalan pasar, elastisitas, perilaku konsumen, produksi &amp; biaya, sampai struktur pasar.</p>
      </a>
      <a class="quick" href="rumus.html">
        <span class="qtag">02 &middot; Kelompok A&ndash;H</span>
        <h3>Rumus</h3>
        <p>Seluruh rumus penting dikelompokkan lengkap dengan penjelasan singkat dan tombol langsung menghitungnya di kalkulator.</p>
      </a>
      <a class="quick" href="kasus.html">
        <span class="qtag">03 &middot; 8 studi kasus</span>
        <h3>Kasus Nyata</h3>
        <p>Kasus berangka lengkap dengan data, langkah penyelesaian, dan kesimpulan — dari harga mobil sampai diskriminasi harga bioskop.</p>
      </a>
      <a class="quick" href="kalkulator.html">
        <span class="qtag">04 &middot; 8 mode</span>
        <h3>Kalkulator</h3>
        <p>Keseimbangan &amp; kebijakan, elastisitas, surplus, utilitas, produksi, biaya, laba maksimum, diskriminasi harga — semua dengan langkah &amp; grafik.</p>
      </a>
    </div>
  </div>
</section>
"""


def page(title, desc, active, body):
    sh = shell
    sh = re.sub(r"<title>.*?</title>", "<title>%s</title>" % title, sh, count=1, flags=re.S)
    sh = re.sub(r'<meta name="description" content="[^"]*">',
                '<meta name="description" content="%s">' % desc, sh, count=1)
    sh = nav_re.sub(lambda m: build_nav(active), sh, count=1)
    return sh + body + tail


# indeks untuk tombol prefill: tombol di halaman rumus/kasus tetap pakai
# data-calc + data-values (ditangani app.js → pindah ke kalkulator.html)
def prefill_ready(block):
    return block.replace("data-calc=", "data-calc=")  # no-op, dokumentasi


pages = {
    "index.html": page(
        "Ekonomi Mikro — Materi Lengkap, Rumus, Kasus &amp; Kalkulator",
        "Catatan lengkap Ekonomi Mikro (Pengantar Ilmu Ekonomi I): penjelasan per bab, rumus, kasus nyata, "
        "kalkulator keseimbangan pasar, elastisitas, surplus, utilitas, produksi, biaya, laba dan diskriminasi "
        "harga lengkap dengan grafik.",
        "index.html",
        hero + QUICK,
    ),
    "materi.html": page(
        "Materi Ekonomi Mikro — Bab 1 sampai 7",
        "Materi lengkap Ekonomi Mikro Bab 1 sampai 7: pengantar, mekanisme pasar, kebijakan dan kegagalan pasar, "
        "elastisitas, perilaku konsumen, produksi dan biaya, struktur pasar.",
        "materi.html",
        CRUMB.format("Materi") + materi,
    ),
    "rumus.html": page(
        "Rumus Ekonomi Mikro — Kumpulan Rumus",
        "Kumpulan rumus Ekonomi Mikro: permintaan penawaran, keseimbangan, elastisitas, surplus, utilitas, "
        "produksi, biaya, laba dan diskriminasi harga lengkap dengan rumus pendukung.",
        "rumus.html",
        CRUMB.format("Rumus") + prefill_ready(rumus),
    ),
    "kasus.html": page(
        "Kasus Nyata Ekonomi Mikro — 8 Studi Kasus",
        "Delapan studi kasus Ekonomi Mikro berangka: harga mobil, harga dasar gabah, harga mie instan, "
        "pajak dan subsidi, elastisitas bensin, tiket bioskop, laba monopoli dan UMKM konveksi.",
        "kasus.html",
        CRUMB.format("Kasus Nyata") + prefill_ready(kasus),
    ),
    "kalkulator.html": page(
        "Kalkulator Ekonomi Mikro — 8 Mode",
        "Kalkulator Ekonomi Mikro 8 mode dengan langkah penyelesaian per rumus dan grafik SVG yang mengikuti "
        "angka: keseimbangan, elastisitas, surplus, utilitas, produksi, biaya, laba maksimum dan diskriminasi harga.",
        "kalkulator.html",
        CRUMB.format("Kalkulator") + kalk,
    ),
}

for name, html in pages.items():
    (ROOT / name).write_text(html, encoding="utf-8", newline="\n")
    print("%-18s %6d bytes" % (name, len(html.encode("utf-8"))))
print("selesai.")
