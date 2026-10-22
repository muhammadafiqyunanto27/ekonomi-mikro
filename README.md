# Ekonomi Mikro

Situs materi Ekonomi Mikro: ringkasan materi, lembar rumus, kasus nyata, dan kalkulator
8 mode dengan langkah penyelesaian serta grafik SVG. Seluruh halaman berbahasa Indonesia,
tanpa CDN, tanpa web font, dan tanpa pelacakan. Perhitungan kalkulator berjalan lokal di
peramban.

Live: <https://ekonomi-mikro-fawn.vercel.app/>

## Teknologi

- [Astro](https://astro.build/) 7 (output statis)
- CSS dan JavaScript vanilla — grafik dibuat langsung sebagai SVG
- Node.js 24.x (Astro 7 membutuhkan Node >= 22.23.4)

## Struktur

```
src/
  layouts/Base.astro      # head, tema, header, footer, pemuatan script
  pages/                  # index, materi, rumus, kasus, kalkulator
  styles/global.css       # seluruh desain dan gaya grafik
public/
  js/theme.js             # mode gelap/terang + localStorage
  js/charts.js            # mesin grafik SVG
  js/app.js               # kalkulator 8 mode, langkah, dan grafik
astro.config.mjs          # build.format: "file" agar URL .html tetap
vercel.json               # buildCommand + outputDirectory untuk Vercel
```

File materi asli dosen (`*.doc`, `*.docx`, `*.ppt`, `*.pptx`) tidak di-commit.

## Menjalankan lokal

```bash
npm install
npm run dev
```

Buka alamat yang ditampilkan Astro (biasanya <http://localhost:4321>).

Build produksi dan pratinjau:

```bash
npm run build
npm run preview
```

Hasil build ada di `dist/` dan tetap memakai URL `index.html`, `materi.html`,
`rumus.html`, `kasus.html`, dan `kalkulator.html`.

Tes E2E opsional ada di `scripts/` dan membaca hasil build di `dist/`. Jalankan
`npm run build` lebih dulu, lalu misalnya `python scripts/test_site.py`
(membutuhkan Playwright untuk Python).

## Deploy

Push ke branch `main` di GitHub. Vercel membangun proyek dengan `npm run build`
dan menyajikan folder `dist/` sesuai `vercel.json`. Tidak ada variabel lingkungan
atau layanan eksternal yang diperlukan.

## Catatan kalkulator

Mode **Keseimbangan pasar** mendukung pajak/subsidi per unit maupun persentase, harga
lantai, harga batas, kuota, dan pembelian pemerintah. Contoh papan tulis (D: Q = 30 − 6P,
S: Q = −10 + 4P, pajak 30%) tersedia lewat tombol **Coba contoh ini** di halaman
kalkulator. Grafik menampilkan kurva permintaan dan penawaran penuh, penawaran efektif
setelah kebijakan, titik E dan E′, serta garis harga/kuantitas; sumbu dapat turun ke
daerah negatif agar intersep kurva terbaca.
