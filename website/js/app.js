/* =========================================================================
   app.js — logika kalkulator Ekonomi Mikro.
   Setiap mode: kumpulan field + fungsi hitung yang mengembalikan
   { steps, results, notes, charts }. Semua hitungan dilakukan lokal.
   ========================================================================= */
(function () {
  "use strict";

  var fmt = window.Charts.fmt;

  /* ------------------------------------------------------------ util */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }
  function parseVal(v) {
    if (typeof v === "number") return isFinite(v) ? v : NaN;
    var n = parseFloat(String(v === undefined || v === null ? "" : v).replace(/\s/g, "").replace(",", "."));
    return isFinite(n) ? n : NaN;
  }
  function ok() {
    for (var i = 0; i < arguments.length; i++) {
      if (!isFinite(arguments[i])) return false;
    }
    return true;
  }
  /* akar real persamaan Ax² + Bx + C = 0 */
  function roots2(A, B, C) {
    if (Math.abs(A) < 1e-12) {
      if (Math.abs(B) < 1e-12) return [];
      return [-C / B];
    }
    var disc = B * B - 4 * A * C;
    if (disc < 0) return [];
    var s = Math.sqrt(disc);
    return [(-B - s) / (2 * A), (-B + s) / (2 * A)];
  }
  /* akar f(x)=0 pada (lo, hi] dengan perluasan rentang */
  function findRoot(f, lo, hi) {
    lo = lo === undefined ? 1e-6 : lo;
    hi = hi === undefined ? 1 : hi;
    var a = lo, fa = f(a), b = hi, fb = f(b), i;
    for (i = 0; i < 60 && isFinite(fa) && isFinite(fb) && fa * fb > 0; i++) {
      b *= 1.9;
      fb = f(b);
    }
    if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return NaN;
    for (i = 0; i < 120; i++) {
      var m = (a + b) / 2, fm = f(m);
      if (fm === 0 || (b - a) < 1e-9) return m;
      if (fa * fm < 0) { b = m; fb = fm; } else { a = m; fa = fm; }
    }
    return (a + b) / 2;
  }
  function nice(v) { return fmt(v); }

  /* ============================================================ MODES */
  var MODES = {};

  /* -------------------------------------------------- 1. KESEIMBANGAN */
  MODES.keseimbangan = {
    label: "Keseimbangan Pasar",
    title: "Keseimbangan Pasar — permintaan, penawaran, dan kebijakan",
    desc: "Qd = a − bP dan Qs = c + dP. Cari harga & kuantitas keseimbangan, lalu tambahkan kebijakan: pajak per unit, pajak persen, subsidi, harga minimum, harga maksimum, atau kuota.",
    fields: [
      { id: "a", label: "Intersep permintaan (a)", def: 200, hint: "Qd = a − bP · konstanta saat P = 0" },
      { id: "b", label: "Kemiringan permintaan (b)", def: 10, hint: "harus &gt; 0" },
      { id: "c", label: "Intersep penawaran (c)", def: -40, hint: "Qs = c + dP · biasa negatif" },
      { id: "d", label: "Kemiringan penawaran (d)", def: 5, hint: "harus &gt; 0" },
      {
        id: "policy", label: "Kebijakan pemerintah", def: "none", type: "select",
        options: [
          ["none", "tanpa kebijakan (keseimbangan murni)"],
          ["pajak", "pajak per unit (t)"],
          ["pajakprosen", "pajak persentase (k %)"],
          ["subsidi", "subsidi per unit (s)"],
          ["floor", "harga minimum / floor price"],
          ["ceiling", "harga maksimum / ceiling price"],
          ["kuota", "kuota produksi (Q̄)"]
        ]
      },
      { id: "t", label: "Pajak per unit (t)", def: 1.25, when: function (v) { return v.policy === "pajak"; } },
      { id: "k", label: "Pajak persen (%)", def: 20, when: function (v) { return v.policy === "pajakprosen"; } },
      { id: "s", label: "Subsidi per unit (s)", def: 1.25, when: function (v) { return v.policy === "subsidi"; } },
      { id: "Pmin", label: "Harga minimum (floor)", def: 600, when: function (v) { return v.policy === "floor"; } },
      { id: "govBuy", label: "Pemerintah membeli kelebihan (surplus) itu", def: true, type: "check", when: function (v) { return v.policy === "floor"; } },
      { id: "Pmax", label: "Harga maksimum (ceiling)", def: 750, when: function (v) { return v.policy === "ceiling"; } },
      { id: "Qbar", label: "Kuota produksi (Q̄)", def: 10000, when: function (v) { return v.policy === "kuota"; } },
      { id: "surplus", label: "Tampilkan daerah surplus konsumen &amp; produsen", def: true, type: "check" }
    ],
    compute: function (v) {
      var a = v.a, b = v.b, c = v.c, d = v.d;
      if (!ok(a, b, c, d)) throw "Isi keempat koefisien permintaan dan penawaran dengan angka.";
      if (!(b > 0) || !(d > 0)) throw "Koefisien b (permintaan) dan d (penawaran) harus lebih besar dari 0.";

      var policy = v.policy || "none";
      var den = b + d;
      var Pe = (a - c) / den, Qe = a - b * Pe;
      var choke = a / b, Ps0 = -c / d;
      var Pb = Pe, Ps = Pe, Qt = Qe, QtProd = Qe;
      var excess = 0, excessType = "", govCost = 0, rev = 0, wedge = 0;
      var status = "";
      var steps = [], notes = [];

      steps.push({
        label: "Permintaan dan penawaran",
        lines: [
          "Qd = " + nice(a) + " − " + nice(b) + "P        Qs = " + nice(c) + " + " + nice(d) + "P"
        ]
      });
      steps.push({
        label: "Keseimbangan murni: Qd = Qs",
        lines: [
          nice(a) + " − " + nice(b) + "P = " + nice(c) + " + " + nice(d) + "P",
          nice(a) + " − (" + nice(c) + ") = " + nice(b) + "P + " + nice(d) + "P",
          nice(a - c) + " = " + nice(den) + "P",
          "P* = " + nice(a - c) + " : " + nice(den) + " = " + nice(Pe),
          "Q* = " + nice(a) + " − " + nice(b) + "(" + nice(Pe) + ") = " + nice(Qe)
        ],
        result: true
      });

      if (policy === "pajak") {
        var t = v.t;
        if (!(t > 0)) throw "Pajak per unit harus lebih besar dari 0.";
        Ps = (a - c - b * t) / den;
        Pb = Ps + t;
        Qt = a - b * Pb;
        rev = t * Qt;
        wedge = t;
        steps.push({
          label: "Pajak per unit: pembeli bayar lebih tinggi daripada yang diterima penjual",
          lines: [
            "Pb = Ps + t        (t = " + nice(t) + ")",
            nice(a) + " − " + nice(b) + "(Ps + " + nice(t) + ") = " + nice(c) + " + " + nice(d) + "Ps",
            nice(a - c - b * t) + " = " + nice(den) + "Ps",
            "Ps = " + nice(a - c - b * t) + " : " + nice(den) + " = " + nice(Ps),
            "Pb = " + nice(Ps) + " + " + nice(t) + " = " + nice(Pb),
            "Q = " + nice(a) + " − " + nice(b) + "(" + nice(Pb) + ") = " + nice(Qt)
          ],
          result: true
        });
        steps.push({
          label: "Penerimaan pajak dan beban pihak-pihak",
          lines: [
            "Penerimaan pemerintah = t × Q = " + nice(t) + " × " + nice(Qt) + " = " + nice(rev),
            "Beban konsumen per unit = Pb − P* = " + nice(Pb) + " − " + nice(Pe) + " = " + nice(Pb - Pe),
            "Beban produsen per unit = P* − Ps = " + nice(Pe) + " − " + nice(Ps) + " = " + nice(Pe - Ps)
          ]
        });
        status = "Pajak " + nice(t) + " per unit membuat harga pembeli naik ke " + nice(Pb) +
          " dan harga penjual turun ke " + nice(Ps) + "; kuantitas pasar menyusut dari " + nice(Qe) + " ke " + nice(Qt) + ".";
      } else if (policy === "pajakprosen") {
        var k = v.k;
        if (!(k > 0)) throw "Persentase pajak harus lebih besar dari 0.";
        var m = 1 + k / 100;
        Ps = (a - c) / (b * m + d);
        Pb = Ps * m;
        Qt = a - b * Pb;
        rev = (Pb - Ps) * Qt;
        wedge = Pb - Ps;
        steps.push({
          label: "Pajak persentase: Pb = Ps (1 + k)",
          lines: [
            "Pb = Ps (1 + " + nice(k / 100) + ") = " + nice(m) + " Ps",
            nice(a) + " − " + nice(b) + "(" + nice(m) + " Ps) = " + nice(c) + " + " + nice(d) + " Ps",
            nice(a - c) + " = (" + nice(b * m) + " + " + nice(d) + ") Ps = " + nice(b * m + d) + " Ps",
            "Ps = " + nice(a - c) + " : " + nice(b * m + d) + " = " + nice(Ps),
            "Pb = " + nice(m) + " × " + nice(Ps) + " = " + nice(Pb),
            "Q = " + nice(a) + " − " + nice(b) + "(" + nice(Pb) + ") = " + nice(Qt)
          ],
          result: true
        });
        steps.push({
          label: "Penerimaan pajak",
          lines: [
            "Pajak per unit = Pb − Ps = " + nice(Pb) + " − " + nice(Ps) + " = " + nice(Pb - Ps),
            "Penerimaan = (Pb − Ps) × Q = " + nice(Pb - Ps) + " × " + nice(Qt) + " = " + nice(rev)
          ]
        });
        status = "Pajak " + nice(k) + "% membebani harga jual: pembeli membayar " + nice(Pb) +
          ", penjual menerima " + nice(Ps) + ".";
      } else if (policy === "subsidi") {
        var s = v.s;
        if (!(s > 0)) throw "Subsidi per unit harus lebih besar dari 0.";
        Pb = (a - c - d * s) / den;
        Ps = Pb + s;
        Qt = a - b * Pb;
        rev = s * Qt;
        wedge = s;
        steps.push({
          label: "Subsidi per unit: penjual menerima lebih tinggi daripada yang dibayar pembeli",
          lines: [
            "Ps = Pb + s        (s = " + nice(s) + ")",
            nice(a) + " − " + nice(b) + "Pb = " + nice(c) + " + " + nice(d) + "(Pb + " + nice(s) + ")",
            nice(a - c - d * s) + " = " + nice(den) + "Pb",
            "Pb = " + nice(a - c - d * s) + " : " + nice(den) + " = " + nice(Pb),
            "Ps = " + nice(Pb) + " + " + nice(s) + " = " + nice(Ps),
            "Q = " + nice(a) + " − " + nice(b) + "(" + nice(Pb) + ") = " + nice(Qt)
          ],
          result: true
        });
        steps.push({
          label: "Biaya subsidi",
          lines: [
            "Biaya pemerintah = s × Q = " + nice(s) + " × " + nice(Qt) + " = " + nice(rev),
            "Konsumen hemat per unit = P* − Pb = " + nice(Pe - Pb),
            "Produsen terima lebih per unit = Ps − P* = " + nice(Ps - Pe)
          ]
        });
        status = "Subsidi " + nice(s) + " per unit menurunkan harga yang dibayar konsumen ke " + nice(Pb) +
          " dan menaikkan kuantitas ke " + nice(Qt) + " — tetapi negara mengeluarkan " + nice(rev) + ".";
      } else if (policy === "floor") {
        var pf = v.Pmin;
        if (!ok(pf)) throw "Isi besaran harga minimum.";
        var Qd = a - b * pf, Qs = c + d * pf;
        Pb = pf; Ps = pf;
        if (pf <= Pe) {
          status = "Harga minimum " + nice(pf) + " berada di bawah harga keseimbangan " + nice(Pe) +
            " → kebijakan TIDAK mengikat; pasar tetap berjalan di keseimbangan.";
          notes.push("Harga minimum hanya efektif bila ditetapkan di atas harga keseimbangan.");
          Qt = Qe;
        } else {
          excess = Qs - Qd; excessType = "supply";
          Qt = v.govBuy ? Qs : Qd;
          QtProd = v.govBuy ? Qs : Qd;
          govCost = v.govBuy ? pf * excess : 0;
          status = "Harga minimum efektif: pada " + nice(pf) + ", Qd = " + nice(Qd) + " dan Qs = " + nice(Qs) +
            " → kelebihan penawaran " + nice(excess) + " unit.";
          if (v.govBuy) {
            status += " Pemerintah menyerap kelebihan itu dengan biaya " + nice(govCost) + ".";
          } else {
            notes.push("Tanpa pembelian pemerintah, hanya sebanyak permintaan (" + nice(Qd) +
              ") yang benar-benar terjual; sisa produksi menumpuk.");
          }
          steps.push({
            label: "Hitung Qd dan Qs pada harga minimum",
            lines: [
              "Qd(" + nice(pf) + ") = " + nice(a) + " − " + nice(b) + "(" + nice(pf) + ") = " + nice(Qd),
              "Qs(" + nice(pf) + ") = " + nice(c) + " + " + nice(d) + "(" + nice(pf) + ") = " + nice(Qs),
              "Kelebihan penawaran = Qs − Qd = " + nice(excess) + " unit",
              v.govBuy
                ? "Biaya pembelian pemerintah = " + nice(pf) + " × " + nice(excess) + " = " + nice(govCost)
                : "Terjual hanya sebanyak Qd = " + nice(Qd) + " unit"
            ],
            result: true
          });
        }
      } else if (policy === "ceiling") {
        var pc = v.Pmax;
        if (!ok(pc)) throw "Isi besaran harga maksimum.";
        var Qd2 = a - b * pc, Qs2 = c + d * pc;
        Pb = pc; Ps = pc;
        if (pc >= Pe) {
          status = "Harga maksimum " + nice(pc) + " berada di atas harga keseimbangan " + nice(Pe) +
            " → kebijakan TIDAK mengikat; pasar tetap di keseimbangan.";
          notes.push("Harga maksimum hanya efektif bila ditetapkan di bawah harga keseimbangan.");
          Qt = Qe;
        } else {
          excess = Qd2 - Qs2; excessType = "demand";
          Qt = Qs2;
          status = "Harga maksimum efektif: pada " + nice(pc) + ", Qd = " + nice(Qd2) + " dan Qs = " + nice(Qs2) +
            " → kelangkaan " + nice(excess) + " unit yang tidak terlayani.";
          notes.push("Terjadi antrean / pembatasan pembelian. Pemerintah perlu memasok barang atau memberi subsidi agar pasokan cukup.");
          steps.push({
            label: "Hitung Qd dan Qs pada harga maksimum",
            lines: [
              "Qd(" + nice(pc) + ") = " + nice(a) + " − " + nice(b) + "(" + nice(pc) + ") = " + nice(Qd2),
              "Qs(" + nice(pc) + ") = " + nice(c) + " + " + nice(d) + "(" + nice(pc) + ") = " + nice(Qs2),
              "Kelangkaan (excess demand) = Qd − Qs = " + nice(excess) + " unit",
              "Yang benar-benar terbeli = Qs = " + nice(Qs2) + " unit",
              "Harga yang konsumen siap bayar pada Q = " + nice(Qs2) + " → " +
                nice((a - Qs2) / b) + " (tekanan pasar gelap)"
            ],
            result: true
          });
        }
      } else if (policy === "kuota") {
        var qb = v.Qbar;
        if (!(qb > 0)) throw "Kuota produksi harus lebih besar dari 0.";
        if (qb >= Qe) {
          status = "Kuota " + nice(qb) + " berada di atas kuantitas keseimbangan " + nice(Qe) +
            " → TIDAK mengikat, produsen tidak perlu dipaksa mengurangi.";
          Qt = Qe;
        } else {
          Pb = (a - qb) / b;
          Ps = (qb - c) / d;
          Qt = qb; QtProd = qb;
          wedge = Pb - Ps;
          status = "Kuota " + nice(qb) + " menaikkan harga ke " + nice(Pb) + " (dibaca dari kurva permintaan) " +
            "sementara biaya marjinal penawaran hanya " + nice(Ps) + " → selisih " + nice(wedge) + " menjadi rent.";
          notes.push("Karena produsen mengorbankan penjualan, biasanya perlu insentif finansial agar kuota dipatuhi.");
          steps.push({
            label: "Kunci harga dari dua sisi pada kuantitas kuota",
            lines: [
              "Harga yang dibayar konsumen (dari kurva permintaan):",
              "  Pb = (a − Q̄)/b = (" + nice(a) + " − " + nice(qb) + ") / " + nice(b) + " = " + nice(Pb),
              "Harga minimum penjual (dari kurva penawaran):",
              "  Ps = (Q̄ − c)/d = (" + nice(qb) + " − " + nice(c) + ") / " + nice(d) + " = " + nice(Ps),
              "Selisih harga (rent) = " + nice(Pb) + " − " + nice(Ps) + " = " + nice(wedge)
            ],
            result: true
          });
        }
      } else {
        status = "Pasar berada di keseimbangan: tidak ada kekuatan yang menekan harga naik atau turun.";
      }

      /* surplus & dwl pada kuantitas yang benar-benar terjadi */
      var Qcs = policy === "ceiling" ? Qt : Qt;             /* konsumsi = kuantitas terjual */
      var Qps = (policy === "floor" && !v.govBuy) ? Qt : QtProd;
      function csv(Q) { return Q <= 0 ? 0 : (a * Q - (Q * Q) / 2) / b - Pb * Q; }
      function psv(Q) { return Q <= 0 ? 0 : Ps * Q - ((Q * Q) / 2 - c * Q) / d; }
      var CS = csv(Qcs), PS = psv(Qps);
      var DWL = 0;
      if (Qt < Qe && Pb >= Ps) {
        var pdQ = (a - Qt) / b, psQ = (Qt - c) / d;
        DWL = 0.5 * (pdQ - psQ) * (Qe - Qt);
        if (DWL < 0) DWL = 0;
      }

      steps.push({
        label: "Surplus ekonomi pada kuantitas yang terjadi",
        lines: [
          "CS = ½ × (harga puncak permintaan − Pb) × Q = ∫₀^Q [Pd(q) − Pb] dq = " + nice(CS),
          "PS = ∫₀^Q [Ps − Ps(q)] dq = " + nice(PS),
          "Total surplus = " + nice(CS + PS) + (DWL > 0 ? "   →   berkurang " + nice(DWL) + " (deadweight loss)" : "")
        ]
      });

      var results = [
        { label: "Harga keseimbangan P*", value: nice(Pe), hero: true },
        { label: "Kuantitas keseimbangan Q*", value: nice(Qe), hero: true },
        { label: "Harga dibayar pembeli (Pb)", value: nice(Pb), sub: policy === "none" ? "sama dengan P*" : "" },
        { label: "Harga diterima penjual (Ps)", value: nice(Ps), sub: policy === "none" ? "sama dengan P*" : "" },
        { label: "Kuantitas setelah kebijakan", value: nice(Qt) },
        { label: "Selisih harga (Pb − Ps)", value: nice(wedge), sub: policy === "pajak" ? "= pajak per unit" : policy === "subsidi" ? "= subsidi per unit" : "" },
        { label: "Surplus konsumen", value: nice(CS) },
        { label: "Surplus produsen", value: nice(PS) },
        { label: "Total surplus", value: nice(CS + PS) },
        { label: "Deadweight loss", value: nice(DWL), sub: DWL > 0 ? "kesejahteraan yang hilang" : "—" }
      ];
      if (excessType === "supply") results.push({ label: "Kelebihan penawaran", value: nice(excess), sub: "excess supply" });
      if (excessType === "demand") results.push({ label: "Kelangkaan", value: nice(excess), sub: "excess demand" });
      if (rev > 0) results.push({ label: policy === "subsidi" ? "Biaya subsidi" : "Penerimaan pajak", value: nice(rev) });

      /* ---------- grafik ---------- */
      var yTop = Math.max(choke, Pe, Pb, Ps, policy === "floor" ? v.Pmin || 0 : 0, policy === "ceiling" ? v.Pmax || 0 : 0, 1) * 1.12;
      var xTop = Math.max(a, c + d * yTop, Qe * 1.05, Qt * 1.15, 1) * 1.05;
      var series = [
        { label: "Permintaan (Qd)", color: "demand", pts: [[0, choke], [a, 0]] },
        { label: "Penawaran (Qs)", color: "supply", pts: [[c, 0], [c + d * yTop, yTop]] }
      ];
      var regions = [];
      if (v.surplus) {
        regions.push({ pts: [[0, choke], [Qcs, Pb], [0, Pb]], color: "demand", opacity: 0.16, label: "CS" });
        var psPts = Ps0 >= 0
          ? [[0, Ps], [Qps, Ps], [Qps, (Qps - c) / d], [0, Ps0]]
          : [[0, Ps], [Qps, Ps], [Qps, (Qps - c) / d], [c, 0], [0, 0]];
        regions.push({ pts: psPts, color: "supply", opacity: 0.16, label: "PS" });
      }
      if (DWL > 0) {
        regions.push({
          pts: [[Qt, (a - Qt) / b], [Qe, Pe], [Qt, (Qt - c) / d]],
          color: "amber", opacity: 0.34, label: "DWL"
        });
      }
      var hlines = [], vlines = [], points = [];
      if (policy === "pajak" || policy === "pajakprosen" || policy === "subsidi") {
        hlines.push({ y: Pb, label: "Pb = " + nice(Pb), color: "blue" });
        hlines.push({ y: Ps, label: "Ps = " + nice(Ps), color: "blue", dash: true });
        vlines.push({ x: Qt, label: "Q = " + nice(Qt) });
      } else if (policy === "floor" || policy === "ceiling") {
        var pf = policy === "floor" ? v.Pmin : v.Pmax;
        hlines.push({ y: pf, label: (policy === "floor" ? "floor = " : "ceiling = ") + nice(pf), color: "blue" });
        if (excess > 0) {
          var Qd3 = a - b * pf, Qs3 = c + d * pf;
          vlines.push({ x: Qd3, label: "Qd = " + nice(Qd3) });
          vlines.push({ x: Qs3, label: "Qs = " + nice(Qs3) });
        }
      } else if (policy === "kuota" && wedge > 0) {
        vlines.push({ x: Qt, label: "kuota = " + nice(Qt) });
        hlines.push({ y: Pb, label: "Pb = " + nice(Pb), color: "blue" });
        hlines.push({ y: Ps, label: "Ps = " + nice(Ps), color: "blue", dash: true });
      }
      points.push({ x: Qe, y: Pe, color: "ink", label: "E (" + nice(Qe) + "; " + nice(Pe) + ")" });
      if (Math.abs(Qt - Qe) > 1e-9 && isFinite(Qt)) {
        points.push({ x: Qt, y: Pb, color: "blue", label: "Q′ (" + nice(Qt) + "; " + nice(Pb) + ")" });
      }

      var charts = [{
        title: "Keseimbangan pasar" + (policy === "none" ? "" : " dengan kebijakan"),
        sub: "titik E = keseimbangan · angka mengikuti input",
        xLabel: "Kuantitas (Q)", yLabel: "Harga (P)",
        xDomain: [0, xTop], yDomain: [0, yTop],
        series: series, regions: regions, hlines: hlines, vlines: vlines, points: points
      }];

      return { steps: steps, results: results, notes: notes, status: status, charts: charts };
    }
  };

  /* ---------------------------------------------------- 2. ELASTISITAS */
  MODES.elastisitas = {
    label: "Elastisitas",
    title: "Elastisitas — harga, busur, silang, pendapatan, penawaran",
    desc: "Pilih jenis elastisitas. Rumus titik memakai turunan fungsi linear (Qd = a − bP); busur memakai dua pengamatan harga–kuantitas (midpoint).",
    fields: [
      {
        id: "sub", label: "Jenis elastisitas", def: "titik", type: "select",
        options: [
          ["titik", "elastisitas harga — titik (fungsi linear)"],
          ["busur", "elastisitas harga — busur (2 titik)"],
          ["silang", "elastisitas silang (Qx terhadap Py)"],
          ["pendapatan", "elastisitas pendapatan (Q terhadap I)"],
          ["penawaran", "elastisitas penawaran (Qs terhadap P)"]
        ]
      },
      { id: "e_a", label: "Intersep permintaan (a)", def: 100, when: function (v) { return v.sub === "titik"; } },
      { id: "e_b", label: "Kemiringan permintaan (b)", def: 10, when: function (v) { return v.sub === "titik"; } },
      { id: "e_P", label: "Harga yang diuji (P)", def: 6, when: function (v) { return v.sub === "titik"; } },
      { id: "bp1", label: "Harga awal (P₁)", def: 10000, when: function (v) { return v.sub === "busur"; } },
      { id: "bq1", label: "Kuantitas awal (Q₁)", def: 1000, when: function (v) { return v.sub === "busur"; } },
      { id: "bp2", label: "Harga akhir (P₂)", def: 12000, when: function (v) { return v.sub === "busur"; } },
      { id: "bq2", label: "Kuantitas akhir (Q₂)", def: 950, when: function (v) { return v.sub === "busur"; } },
      { id: "cx_q1", label: "Qx awal", def: 100, when: function (v) { return v.sub === "silang"; } },
      { id: "cx_q2", label: "Qx akhir", def: 130, when: function (v) { return v.sub === "silang"; } },
      { id: "cx_p1", label: "Py awal", def: 8, when: function (v) { return v.sub === "silang"; } },
      { id: "cx_p2", label: "Py akhir", def: 10, when: function (v) { return v.sub === "silang"; } },
      { id: "in_q1", label: "Permintaan awal (Q₁)", def: 10, when: function (v) { return v.sub === "pendapatan"; } },
      { id: "in_q2", label: "Permintaan akhir (Q₂)", def: 13, when: function (v) { return v.sub === "pendapatan"; } },
      { id: "in_i1", label: "Pendapatan awal (I₁)", def: 4000000, when: function (v) { return v.sub === "pendapatan"; } },
      { id: "in_i2", label: "Pendapatan akhir (I₂)", def: 5000000, when: function (v) { return v.sub === "pendapatan"; } },
      { id: "sp_q1", label: "Qs awal", def: 100, when: function (v) { return v.sub === "penawaran"; } },
      { id: "sp_q2", label: "Qs akhir", def: 160, when: function (v) { return v.sub === "penawaran"; } },
      { id: "sp_p1", label: "Harga awal (P₁)", def: 10, when: function (v) { return v.sub === "penawaran"; } },
      { id: "sp_p2", label: "Harga akhir (P₂)", def: 14, when: function (v) { return v.sub === "penawaran"; } }
    ],
    compute: function (v) {
      var sub = v.sub || "titik";
      var steps = [], results = [], notes = [], charts = [], status = "";

      function pctChange(q1, q2) { return (q2 - q1) / ((q1 + q2) / 2) * 100; }
      function klasifikasi(E) {
        var x = Math.abs(E);
        if (x === 0) return "inelastis sempurna (Ep = 0)";
        if (!isFinite(x)) return "elastis sempurna (Ep = ∞)";
        if (x < 1) return "inelastis (|Ep| &lt; 1)";
        if (x === 1) return "elastis unitary (|Ep| = 1)";
        return "elastis (|Ep| &gt; 1)";
      }

      if (sub === "titik") {
        var a = v.e_a, b = v.e_b, P = v.e_P;
        if (!ok(a, b, P)) throw "Isi intersep, kemiringan, dan harga yang diuji.";
        if (!(b > 0)) throw "Kemiringan b harus lebih besar dari 0.";
        var Q = a - b * P;
        if (Q <= 0) throw "Pada harga " + nice(P) + " kuantitas = " + nice(Q) +
          " (tidak masuk akal). Pakai harga di bawah " + nice(a / b) + ".";
        var dQdP = -b;
        var E = (dQdP) * (P / Q);
        steps.push({
          label: "Fungsi permintaan dan turunannya",
          lines: [
            "Qd = " + nice(a) + " − " + nice(b) + "P     →     ∂Q/∂P = −" + nice(b),
            "Pada P = " + nice(P) + " :   Q = " + nice(a) + " − " + nice(b) + "(" + nice(P) + ") = " + nice(Q)
          ]
        });
        steps.push({
          label: "Rumus elastisitas titik",
          lines: [
            "Ep = (∂Q/∂P) × (P/Q)",
            "Ep = (−" + nice(b) + ") × (" + nice(P) + " / " + nice(Q) + ")",
            "Ep = " + nice(E) + "      |Ep| = " + nice(Math.abs(E))
          ],
          result: true
        });
        status = "Permintaan " + klasifikasi(E) + ". " +
          (Math.abs(E) > 1
            ? "Karena elastis, menurunkan harga menaikkan total penerimaan (TR = P × Q)."
            : Math.abs(E) < 1
              ? "Karena inelastis, menaikkan harga justru menaikkan total penerimaan."
              : "Kenaikan/penurunan harga tidak mengubah total penerimaan.");
        results = [
          { label: "Elastisitas harga Ep", value: nice(E), hero: true },
          { label: "|Ep|", value: nice(Math.abs(E)), hero: true },
          { label: "Klasifikasi", value: klasifikasi(E) },
          { label: "Kuantitas pada P", value: nice(Q) },
          { label: "∂Q/∂P", value: nice(dQdP) },
          { label: "P/Q", value: nice(P / Q) }
        ];
        charts = [{
          title: "Elastisitas di satu titik",
          sub: "titik uji menyusuri kurva permintaan",
          xLabel: "Kuantitas (Q)", yLabel: "Harga (P)",
          series: [{ label: "Permintaan Qd = a − bP", color: "demand", pts: [[0, a / b], [a, 0]] }],
          points: [{ x: Q, y: P, color: "ink", label: "E = " + nice(E) }],
          vlines: [{ x: Q, color: "muted" }],
          hlines: [{ y: P, color: "muted" }]
        }];
      } else if (sub === "busur") {
        var p1 = v.bp1, q1 = v.bq1, p2 = v.bp2, q2 = v.bq2;
        if (!ok(p1, q1, p2, q2)) throw "Isi kedua titik pengamatan (harga & kuantitas).";
        var dP = pctChange(p1, p2), dQ = pctChange(q1, q2);
        var Eb = dQ / dP;
        steps.push({
          label: "Perubahan relatif (midpoint)",
          lines: [
            "%ΔQ = (Q₂ − Q₁) / [(Q₁ + Q₂)/2] = (" + nice(q2) + " − " + nice(q1) + ") / " +
              nice((q1 + q2) / 2) + " = " + nice(dQ) + " %",
            "%ΔP = (P₂ − P₁) / [(P₁ + P₂)/2] = (" + nice(p2) + " − " + nice(p1) + ") / " +
              nice((p1 + p2) / 2) + " = " + nice(dP) + " %"
          ]
        });
        steps.push({
          label: "Rumus busur",
          lines: [
            "Ep = %ΔQ / %ΔP = " + nice(dQ) + " / " + nice(dP) + " = " + nice(Eb),
            "|Ep| = " + nice(Math.abs(Eb))
          ],
          result: true
        });
        status = "Antara kedua titik itu permintaan " + klasifikasi(Eb) + ".";
        results = [
          { label: "Elastisitas busur Ep", value: nice(Eb), hero: true },
          { label: "|Ep|", value: nice(Math.abs(Eb)), hero: true },
          { label: "Klasifikasi", value: klasifikasi(Eb) },
          { label: "%Δ kuantitas", value: nice(dQ) + " %" },
          { label: "%Δ harga", value: nice(dP) + " %" },
          { label: "Harga rata-rata", value: nice((p1 + p2) / 2) },
          { label: "Kuantitas rata-rata", value: nice((q1 + q2) / 2) }
        ];
        var slope = (p2 - p1) / (q2 - q1);
        var linP = function (Q) { return p1 + slope * (Q - q1); };
        var qmin = Math.min(q1, q2) * 0.85, qmax = Math.max(q1, q2) * 1.15;
        charts = [{
          title: "Elastisitas busur antara dua titik",
          sub: "garis penghubung = penaksiran permintaan",
          xLabel: "Kuantitas (Q)", yLabel: "Harga (P)",
          series: [{ label: "garis antara kedua titik", color: "demand", fn: linP, xRange: [qmin, qmax] }],
          points: [
            { x: q1, y: p1, color: "ink", label: "1 (" + nice(q1) + "; " + nice(p1) + ")" },
            { x: q2, y: p2, color: "blue", label: "2 (" + nice(q2) + "; " + nice(p2) + ")", dy: 14 }
          ]
        }];
      } else if (sub === "silang") {
        var cq1 = v.cx_q1, cq2 = v.cx_q2, cp1 = v.cx_p1, cp2 = v.cx_p2;
        if (!ok(cq1, cq2, cp1, cp2)) throw "Isi kuantitas X dan harga Y untuk kedua pengamatan.";
        var dqx = pctChange(cq1, cq2), dpy = pctChange(cp1, cp2);
        var Exy = dqx / dpy;
        steps.push({
          label: "Perubahan relatif",
          lines: [
            "%ΔQx = (" + nice(cq2) + " − " + nice(cq1) + ") / " + nice((cq1 + cq2) / 2) + " = " + nice(dqx) + " %",
            "%ΔPy = (" + nice(cp2) + " − " + nice(cp1) + ") / " + nice((cp1 + cp2) / 2) + " = " + nice(dpy) + " %"
          ]
        });
        steps.push({
          label: "Rumus elastisitas silang",
          lines: [
            "Exy = %ΔQx / %ΔPy = " + nice(dqx) + " / " + nice(dpy) + " = " + nice(Exy)
          ],
          result: true
        });
        var jenis = Exy > 0 ? "substitusi (Exy &gt; 0)" : Exy < 0 ? "komplementer (Exy &lt; 0)" : "tidak berhubungan (Exy = 0)";
        status = "X dan Y adalah barang " + jenis + ". " +
          (Exy > 0
            ? "Naiknya harga Y membuat konsumen pindah ke X."
            : "Naiknya harga Y menurunkan konsumsi X karena keduanya dipakai bersama.");
        results = [
          { label: "Elastisitas silang Exy", value: nice(Exy), hero: true },
          { label: "Hubungan barang", value: jenis },
          { label: "%Δ Qx", value: nice(dqx) + " %" },
          { label: "%Δ Py", value: nice(dpy) + " %" }
        ];
        charts = [{
          title: "Hubungan Qx terhadap harga Py",
          sub: "kemiringan positif = substitusi · negatif = komplementer",
          xLabel: "Harga barang Y (Py)", yLabel: "Kuantitas X (Qx)",
          series: [{ label: "penaksiran hubungan", color: "blue", pts: [[cp1, cq1], [cp2, cq2]] }],
          points: [
            { x: cp1, y: cq1, color: "ink", label: "1" },
            { x: cp2, y: cq2, color: "blue", label: "2", dy: 14 }
          ]
        }];
      } else if (sub === "pendapatan") {
        var iq1 = v.in_q1, iq2 = v.in_q2, ii1 = v.in_i1, ii2 = v.in_i2;
        if (!ok(iq1, iq2, ii1, ii2)) throw "Isi permintaan dan pendapatan untuk kedua pengamatan.";
        var dqi = pctChange(iq1, iq2), di = pctChange(ii1, ii2);
        var Ei = dqi / di;
        steps.push({
          label: "Perubahan relatif",
          lines: [
            "%ΔQ = (" + nice(iq2) + " − " + nice(iq1) + ") / " + nice((iq1 + iq2) / 2) + " = " + nice(dqi) + " %",
            "%ΔI = (" + nice(ii2) + " − " + nice(ii1) + ") / " + nice((ii1 + ii2) / 2) + " = " + nice(di) + " %"
          ]
        });
        steps.push({
          label: "Rumus elastisitas pendapatan",
          lines: ["EI = %ΔQ / %ΔI = " + nice(dqi) + " / " + nice(di) + " = " + nice(Ei)],
          result: true
        });
        var kategori = Ei < 0 ? "barang inferior (EI &lt; 0)" : Ei < 1 ? "barang normal pokok (0 &lt; EI &lt; 1)" : "barang normal mewah / luxury (EI &gt; 1)";
        status = "Barang tersebut tergolong " + kategori + ".";
        results = [
          { label: "Elastisitas pendapatan EI", value: nice(Ei), hero: true },
          { label: "Kategori barang", value: kategori },
          { label: "%Δ Q", value: nice(dqi) + " %" },
          { label: "%Δ I", value: nice(di) + " %" }
        ];
        charts = [{
          title: "Kurva Engel: Q terhadap pendapatan",
          sub: "kemiringan positif = barang normal",
          xLabel: "Pendapatan (I)", yLabel: "Kuantitas (Q)",
          series: [{ label: "kurva Engel", color: "supply", pts: [[ii1, iq1], [ii2, iq2]] }],
          points: [
            { x: ii1, y: iq1, color: "ink", label: "1" },
            { x: ii2, y: iq2, color: "supply", label: "2", dy: 14 }
          ]
        }];
      } else {
        var sq1 = v.sp_q1, sq2 = v.sp_q2, sp1 = v.sp_p1, sp2 = v.sp_p2;
        if (!ok(sq1, sq2, sp1, sp2)) throw "Isi kuantitas penawaran dan harga untuk kedua pengamatan.";
        var dqs = pctChange(sq1, sq2), dps = pctChange(sp1, sp2);
        var Es = dqs / dps;
        steps.push({
          label: "Perubahan relatif",
          lines: [
            "%ΔQs = (" + nice(sq2) + " − " + nice(sq1) + ") / " + nice((sq1 + sq2) / 2) + " = " + nice(dqs) + " %",
            "%ΔP  = (" + nice(sp2) + " − " + nice(sp1) + ") / " + nice((sp1 + sp2) / 2) + " = " + nice(dps) + " %"
          ]
        });
        steps.push({
          label: "Rumus elastisitas penawaran",
          lines: ["Es = %ΔQs / %ΔP = " + nice(dqs) + " / " + nice(dps) + " = " + nice(Es)],
          result: true
        });
        status = "Penawaran " + (Math.abs(Es) > 1 ? "elastis (Es &gt; 1)" : Math.abs(Es) < 1 ? "inelastis (Es &lt; 1)" : "elastis unitary (Es = 1)") +
          ". Bernotasi positif karena harga dan kuantitas penawaran bergerak searah.";
        results = [
          { label: "Elastisitas penawaran Es", value: nice(Es), hero: true },
          { label: "Klasifikasi", value: Math.abs(Es) > 1 ? "elastis" : Math.abs(Es) < 1 ? "inelastis" : "unitary" },
          { label: "%Δ Qs", value: nice(dqs) + " %" },
          { label: "%Δ P", value: nice(dps) + " %" }
        ];
        charts = [{
          title: "Kurva penawaran antara dua titik",
          sub: "kemiringan positif = hukum penawaran",
          xLabel: "Kuantitas (Qs)", yLabel: "Harga (P)",
          series: [{ label: "penawaran", color: "supply", pts: [[sq1, sp1], [sq2, sp2]] }],
          points: [
            { x: sq1, y: sp1, color: "ink", label: "1" },
            { x: sq2, y: sp2, color: "supply", label: "2", dy: 14 }
          ]
        }];
      }

      return { steps: steps, results: results, notes: notes, status: status, charts: charts };
    }
  };

  /* -------------------------------------------------------- 3. SURPLUS */
  function surplusHelpers(a, b, c, d) {
    var Pe = (a - c) / (b + d), Qe = a - b * Pe;
    return { Pe: Pe, Qe: Qe };
  }
  MODES.surplus = {
    label: "Surplus Ekonomi",
    title: "Surplus Konsumen &amp; Produsen (termasuk deadweight loss)",
    desc: "Hitung luas daerah surplus konsumen dan surplus produsen pada harga pasar atau pada harga yang ditetapkan pemerintah, lengkap dengan kesejahteraan yang hilang bila kuantitas menyusut.",
    fields: [
      { id: "a", label: "Intersep permintaan (a)", def: 200 },
      { id: "b", label: "Kemiringan permintaan (b)", def: 10 },
      { id: "c", label: "Intersep penawaran (c)", def: -40 },
      { id: "d", label: "Kemiringan penawaran (d)", def: 5 },
      {
        id: "Pmode", label: "Harga yang dipakai", def: "eq", type: "select",
        options: [["eq", "harga keseimbangan"], ["custom", "harga lain (mis. hasil kebijakan)"]]
      },
      { id: "Pcustom", label: "Harga yang ditetapkan (P)", def: 12, when: function (v) { return v.Pmode === "custom"; } }
    ],
    compute: function (v) {
      var a = v.a, b = v.b, c = v.c, d = v.d;
      if (!ok(a, b, c, d)) throw "Isi keempat koefisien permintaan dan penawaran.";
      if (!(b > 0) || !(d > 0)) throw "Koefisien b dan d harus lebih besar dari 0.";

      var h = surplusHelpers(a, b, c, d), Pe = h.Pe, Qe = h.Qe;
      var P = v.Pmode === "custom" ? v.Pcustom : Pe;
      if (!ok(P)) throw "Isi harga yang ingin diuji.";
      if (!(P > 0)) throw "Harga harus lebih besar dari 0.";

      var Qd = a - b * P, Qs = c + d * P;
      var Qt = Math.min(Qd, Qs);
      if (Qt < 0) Qt = 0;
      var CS = Qt > 0 ? (a * Qt - (Qt * Qt) / 2) / b - P * Qt : 0;
      var PS = Qt > 0 ? P * Qt - ((Qt * Qt) / 2 - c * Qt) / d : 0;
      var pdQ = (a - Qt) / b, psQ = (Qt - c) / d;
      var DWL = Qt < Qe ? Math.max(0, 0.5 * (pdQ - psQ) * (Qe - Qt)) : 0;

      var steps = [
        {
          label: "Keseimbangan pasar sebagai pembanding",
          lines: [
            "Qd = Qs → " + nice(a) + " − " + nice(b) + "P = " + nice(c) + " + " + nice(d) + "P",
            "P* = " + nice(Pe) + " ;  Q* = " + nice(Qe),
            "Harga puncak permintaan (Pd = 0) = " + nice(a / b) + " ;  harga minimum penawaran (Qs = 0) = " + nice(-c / d)
          ]
        },
        {
          label: "Kuantitas pada harga yang dipakai",
          lines: [
            "Pada P = " + nice(P) + " :   Qd = " + nice(Qd) + " ;  Qs = " + nice(Qs),
            "Yang benar-benar ditransaksikan = min(Qd, Qs) = " + nice(Qt),
            Qd > Qs ? "Harga di bawah keseimbangan → kelangkaan " + nice(Qd - Qs) + " unit"
              : Qs > Qd ? "Harga di atas keseimbangan → kelebihan penawaran " + nice(Qs - Qd) + " unit"
                : "Harga tepat di keseimbangan"
          ]
        },
        {
          label: "Hitung surplus dengan integral di bawah kurva",
          lines: [
            "CS = ∫₀^Q [Pd(q) − P] dq = (aQ − Q²/2)/b − P·Q = " + nice(CS),
            "PS = ∫₀^Q [P − Ps(q)] dq = P·Q − (Q²/2 − cQ)/d = " + nice(PS),
            "Total surplus = " + nice(CS + PS)
          ],
          result: true
        }
      ];
      if (DWL > 0) {
        steps.push({
          label: "Deadweight loss (kesejahteraan yang hilang)",
          lines: [
            "Harga permintaan pada Q = " + nice(Qt) + " : " + nice(pdQ) + " ;  harga penawaran : " + nice(psQ),
            "DWL = ½ × (Pd − Ps) × (Q* − Q) = ½ × " + nice(pdQ - psQ) + " × " + nice(Qe - Qt) + " = " + nice(DWL)
          ]
        });
      }

      var results = [
        { label: "Surplus konsumen (CS)", value: nice(CS), hero: true },
        { label: "Surplus produsen (PS)", value: nice(PS), hero: true },
        { label: "Total surplus", value: nice(CS + PS) },
        { label: "Deadweight loss", value: nice(DWL) },
        { label: "Harga yang dipakai", value: nice(P) },
        { label: "Kuantitas ditransaksikan", value: nice(Qt) },
        { label: "Keseimbangan (Q*; P*)", value: nice(Qe) + " ; " + nice(Pe) },
        { label: "Kelebihan / kelangkaan", value: nice(Math.abs(Qd - Qs)) + (Qs > Qd ? " (supply)" : Qd > Qs ? " (demand)" : " —") }
      ];

      var yTop = Math.max(a / b, Pe, P) * 1.12;
      var yDom = [0, yTop];
      var xTop = Math.max(a, c + d * yTop, Qe * 1.05) * 1.05;
      var charts = [{
        title: "Surplus konsumen dan surplus produsen",
        sub: "luas daerah dihitung dari angka input",
        xLabel: "Kuantitas (Q)", yLabel: "Harga (P)",
        xDomain: [0, xTop], yDomain: yDom,
        series: [
          { label: "Permintaan", color: "demand", pts: [[0, a / b], [a, 0]] },
          { label: "Penawaran", color: "supply", pts: [[c, 0], [c + d * yTop, yTop]] }
        ],
        regions: [
          { pts: [[0, a / b], [Qt, P], [0, P]], color: "demand", opacity: 0.18 },
          { pts: [[0, P], [Qt, P], [Qt, psQ], [0, -c / d]], color: "supply", opacity: 0.18 }
        ].concat(DWL > 0 ? [{ pts: [[Qt, pdQ], [Qe, Pe], [Qt, psQ]], color: "amber", opacity: 0.34 }] : []),
        hlines: [{ y: P, label: "P = " + nice(P), color: "blue" }],
        vlines: [{ x: Qt, label: "Q = " + nice(Qt) }],
        points: [{ x: Qe, y: Pe, color: "ink", label: "E (" + nice(Qe) + "; " + nice(Pe) + ")" }]
      }];

      return {
        steps: steps, results: results, charts: charts, notes: [],
        status: "Pada harga " + nice(P) + ", surplus konsumen " + nice(CS) + " dan surplus produsen " + nice(PS) +
          (DWL > 0 ? "; hilang " + nice(DWL) + " karena kuantitas menyusut di bawah keseimbangan." : ".")
      };
    }
  };

  /* ------------------------------------------------------ 4. UTILITAS */
  MODES.utilitas = {
    label: "Utilitas Konsumen",
    title: "Keseimbangan Konsumen — MUx/Px = MUy/Py",
    desc: "Dua barang dengan guna marjinal menurun lurus: MUx = Ax − bx·Qx dan MUy = Ay − by·Qy. Kalkulator mencari kombinasi yang memaksimalkan kepuasan pada pendapatan tertentu, sekaligus nilai guna marjinal uang (λ).",
    fields: [
      { id: "Ax", label: "MUx mula-mula (Ax)", def: 100, hint: "MUx = Ax − bx·Qx" },
      { id: "bx", label: "Penurunan MUx per unit (bx)", def: 10 },
      { id: "Ay", label: "MUy mula-mula (Ay)", def: 80, hint: "MUy = Ay − by·Qy" },
      { id: "by", label: "Penurunan MUy per unit (by)", def: 8 },
      { id: "Px", label: "Harga barang X (Px)", def: 5 },
      { id: "Py", label: "Harga barang Y (Py)", def: 4 },
      { id: "M", label: "Pendapatan (M)", def: 60 }
    ],
    compute: function (v) {
      var Ax = v.Ax, bx = v.bx, Ay = v.Ay, by = v.by, Px = v.Px, Py = v.Py, M = v.M;
      if (!ok(Ax, bx, Ay, by, Px, Py, M)) throw "Isi semua kolom.";
      if (!(bx > 0) || !(by > 0)) throw "Penurunan MU (bx dan by) harus lebih besar dari 0.";
      if (!(Px > 0) || !(Py > 0) || !(M > 0)) throw "Harga dan pendapatan harus lebih besar dari 0.";

      /* sistem:  Px·Qx + Py·Qy = M
                 Py(Ax − bx Qx) = Px(Ay − by Qy) */
      var a2 = -Py * bx, b2 = Px * by, c2 = Px * Ay - Py * Ax;
      var det = Px * b2 - Py * a2;
      if (Math.abs(det) < 1e-12) throw "Kombinasi parameter ini tidak punya solusi tunggal (coba ubah slope).";
      var Qx = (M * b2 - Py * c2) / det;
      var Qy = (Px * c2 - a2 * M) / det;
      var notes = [], corner = "";
      if (Qx < 0) { Qx = 0; Qy = M / Py; corner = "solusi sudut: seluruh pendapatan untuk barang Y"; }
      if (Qy < 0) { Qy = 0; Qx = M / Px; corner = "solusi sudut: seluruh pendapatan untuk barang X"; }
      if (corner) notes.push("MU salah satu barang terlalu kecil relatif harganya → " + corner + ".");

      var MUx = Ax - bx * Qx, MUy = Ay - by * Qy;
      var lam = MUx / Px;
      var TUx = Ax * Qx - (bx * Qx * Qx) / 2;
      var TUy = Ay * Qy - (by * Qy * Qy) / 2;
      var spend = Px * Qx + Py * Qy;

      var steps = [
        {
          label: "Fungsi guna marjinal dan syarat keseimbangan",
          lines: [
            "MUx = " + nice(Ax) + " − " + nice(bx) + " Qx        MUy = " + nice(Ay) + " − " + nice(by) + " Qy",
            "Syarat 1 (kepuasan maksimum):  MUx / Px = MUy / Py",
            "Syarat 2 (anggaran habis):      " + nice(Px) + " Qx + " + nice(Py) + " Qy = " + nice(M)
          ]
        },
        {
          label: "Bentuk persamaan linear",
          lines: [
            "Dari syarat 1:  " + nice(Py) + "(" + nice(Ax) + " − " + nice(bx) + " Qx) = " + nice(Px) + "(" + nice(Ay) + " − " + nice(by) + " Qy)",
            nice(Py * Ax) + " − " + nice(Py * bx) + " Qx = " + nice(Px * Ay) + " − " + nice(Px * by) + " Qy",
            "→  (" + nice(-Py * bx) + ") Qx + (" + nice(Px * by) + ") Qy = " + nice(c2)
          ]
        },
        {
          label: "Selesaikan (aturan Cramer)",
          lines: [
            "det = (" + nice(Px) + ")(" + nice(b2) + ") − (" + nice(Py) + ")(" + nice(a2) + ") = " + nice(det),
            "Qx* = [" + nice(M) + " × " + nice(b2) + " − " + nice(Py) + " × " + nice(c2) + "] : " + nice(det) + " = " + nice(Qx),
            "Qy* = [" + nice(Px) + " × " + nice(c2) + " − (" + nice(a2) + ") × " + nice(M) + "] : " + nice(det) + " = " + nice(Qy)
          ],
          result: true
        },
        {
          label: "Uji syarat keseimbangan",
          lines: [
            "MUx = " + nice(Ax) + " − " + nice(bx) + "(" + nice(Qx) + ") = " + nice(MUx),
            "MUy = " + nice(Ay) + " − " + nice(by) + "(" + nice(Qy) + ") = " + nice(MUy),
            "MUx/Px = " + nice(MUx) + " / " + nice(Px) + " = " + nice(lam),
            "MUy/Py = " + nice(MUy) + " / " + nice(Py) + " = " + nice(MUy / Py) + "   → sama ✓ (λ = " + nice(lam) + ")",
            "Pengeluaran = " + nice(Px) + "(" + nice(Qx) + ") + " + nice(Py) + "(" + nice(Qy) + ") = " + nice(spend) + " (pendapatan = " + nice(M) + ")"
          ]
        },
        {
          label: "Total kepuasan",
          lines: [
            "TUx = " + nice(Ax) + "Qx − ½(" + nice(bx) + ")Qx² = " + nice(TUx),
            "TUy = " + nice(Ay) + "Qy − ½(" + nice(by) + ")Qy² = " + nice(TUy),
            "TU total = " + nice(TUx + TUy)
          ]
        }
      ];

      var results = [
        { label: "Jumlah barang X (Qx*)", value: nice(Qx), hero: true },
        { label: "Jumlah barang Y (Qy*)", value: nice(Qy), hero: true },
        { label: "Guna marjinal uang (λ)", value: nice(lam) },
        { label: "Total utility", value: nice(TUx + TUy) },
        { label: "MUx dan MUy", value: nice(MUx) + " ; " + nice(MUy) },
        { label: "Pengeluaran", value: nice(spend), sub: "pendapatan " + nice(M) },
        { label: "MUx/Px = MUy/Py", value: nice(lam) + " = " + nice(MUy / Py) }
      ];

      var xMax = Math.max(Ax / bx, Ay / by, Qx * 1.3, Qy * 1.3) * 1.05;
      var yMax = Math.max(Ax, Ay, lam * 1.2) * 1.1;
      var charts = [{
        title: "Guna marjinal dua barang dan nilai λ",
        sub: "konsumsi berhenti saat MUx/Px = MUy/Py = λ",
        xLabel: "Kuantitas barang (Q)", yLabel: "Guna marjinal (MU)",
        xDomain: [0, xMax], yDomain: [0, yMax],
        series: [
          { label: "MUx = " + nice(Ax) + " − " + nice(bx) + "Qx", color: "supply", pts: [[0, Ax], [Ax / bx, 0]] },
          { label: "MUy = " + nice(Ay) + " − " + nice(by) + "Qy", color: "blue", pts: [[0, Ay], [Ay / by, 0]] }
        ],
        hlines: [{ y: lam * Px, label: "MU = λ × Px = " + nice(lam * Px), color: "amber" },
                 { y: lam * Py, label: "MU = λ × Py = " + nice(lam * Py), color: "amber", dash: true }],
        points: [
          { x: Qx, y: MUx, color: "supply", label: "Qx* = " + nice(Qx), dx: -8, dy: -12 },
          { x: Qy, y: MUy, color: "blue", label: "Qy* = " + nice(Qy), dx: 8, dy: -12 }
        ]
      }];

      return {
        steps: steps, results: results, notes: notes, charts: charts,
        status: "Kepuasan maksimum pada Qx = " + nice(Qx) + " dan Qy = " + nice(Qy) +
          ", di mana setiap rupiah terakhir memberi guna marjinal yang sama (" + nice(lam) + ")."
      };
    }
  };

  /* ----------------------------------------------------- 5. PRODUKSI */
  MODES.produksi = {
    label: "Produksi (TP/MP/AP)",
    title: "Produksi Satu Input Variabel — TP, MP, AP dan tahap produksi",
    desc: "Fungsi produksi kubik TP = a·L + b·L² − c·L³. Kalkulator menghitung MP dan AP, menemukan titik AP maksimum (tahap rasional dimulai) dan titik MP = 0 (TP maksimum), lalu menilai tahap produksi pada jumlah tenaga kerja yang kamu masukkan.",
    fields: [
      { id: "a", label: "Koefisien a (linear)", def: 20, hint: "TP = aL + bL² − cL³" },
      { id: "b", label: "Koefisien b (kuadrat)", def: 8 },
      { id: "c", label: "Koefisien c (kubik)", def: 1 },
      { id: "Lmax", label: "Batas tenaga kerja yang digambar (L maks)", def: 10 },
      { id: "L", label: "Tenaga kerja yang dievaluasi (L)", def: 5 }
    ],
    compute: function (v) {
      var a = v.a, b = v.b, c = v.c, Lmax = v.Lmax, L = v.L;
      if (!ok(a, b, c, Lmax, L)) throw "Isi semua kolom.";
      if (!(Lmax > 0)) throw "Batas L harus lebih besar dari 0.";
      if (c < 0) throw "Koefisien c (kubik) sebaiknya ≥ 0 agar kurva produksi realistis.";
      if (c === 0 && b <= 0) throw "Dengan c = 0, koefisien b harus > 0 agar ada AP maksimum.";

      function TP(x) { return a * x + b * x * x - c * x * x * x; }
      function MP(x) { return a + 2 * b * x - 3 * c * x * x; }
      function AP(x) { return a + b * x - c * x * x; }

      var Lap = c > 0 ? b / (2 * c) : Infinity;
      var APmax = isFinite(Lap) ? AP(Lap) : AP(Lmax);
      var mpRoots = roots2(-3 * c, 2 * b, a).filter(function (r) { return r > 0; });
      var Ltpmax = mpRoots.length ? Math.max.apply(null, mpRoots) : NaN;
      var TPmax = isFinite(Ltpmax) ? TP(Ltpmax) : NaN;
      var Lmpmax = c > 0 ? b / (3 * c) : NaN;
      var MPmax = isFinite(Lmpmax) ? MP(Lmpmax) : NaN;

      var tp = TP(L), mp = MP(L), ap = AP(L);
      var tahap, saran;
      if (ap <= 0 || tp < 0) { tahap = "di luar daerah produksi"; saran = "Tambahan tenaga kerja belum menghasilkan output positif."; }
      else if (mp > ap) { tahap = "Tahap 1 (belum rasional memakai input)"; saran = "AP masih naik — masih menguntungkan menambah tenaga kerja."; }
      else if (mp > 0 && isFinite(Ltpmax) && L > Ltpmax) { tahap = "Tahap 3 (tidak rasional)"; saran = "MP sudah negatif — tambahan pekerja justru menurunkan produksi."; }
      else if (mp > 0) { tahap = "Tahap 2 (rasional)"; saran = "Tahap terbaik: AP &gt; MP &gt; 0, penambahan tenaga kerja masih menaikkan produksi."; }
      else { tahap = "Tahap 3 (tidak rasional)"; saran = "MP ≤ 0 — berhenti menambah tenaga kerja."; }

      var steps = [
        {
          label: "Fungsi produksi dan turunannya",
          lines: [
            "TP = " + nice(a) + "L + " + nice(b) + "L² − " + nice(c) + "L³",
            "MP = ∂TP/∂L = " + nice(a) + " + " + nice(2 * b) + "L − " + nice(3 * c) + "L²",
            "AP = TP/L = " + nice(a) + " + " + nice(b) + "L − " + nice(c) + "L²"
          ]
        }
      ];

      if (c > 0) {
        steps.push({
          label: "AP maksimum → batas awal tahap rasional",
          lines: [
            "∂AP/∂L = " + nice(b) + " − " + nice(2 * c) + "L = 0",
            "L = " + nice(b) + " : " + nice(2 * c) + " = " + nice(Lap),
            "AP maks = " + nice(APmax) + "   (cek: MP = " + nice(MP(Lap)) + " juga " + nice(APmax) + " → AP = MP ✓)"
          ]
        });
      }
      if (isFinite(Ltpmax)) {
        steps.push({
          label: "TP maksimum → MP = 0",
          lines: [
            nice(3 * c) + "L² − " + nice(2 * b) + "L − " + nice(a) + " = 0",
            "L = [" + nice(2 * b) + " + √(" + nice(4 * b * b) + " + " + nice(12 * c * a) + ")] : " + nice(6 * c) +
              " = " + nice(Ltpmax) + " (akar positif)",
            "TP maks = " + nice(TPmax),
            "MP terbesar pada L = " + nice(Lmpmax) + " (MP = " + nice(MPmax) + ") — awal diminishing return"
          ]
        });
      }
      steps.push({
        label: "Evaluasi pada L = " + nice(L),
        lines: [
          "TP(" + nice(L) + ") = " + nice(a) + "(" + nice(L) + ") + " + nice(b) + "(" + nice(L * L) + ") − " + nice(c) + "(" + nice(L * L * L) + ") = " + nice(tp),
          "MP(" + nice(L) + ") = " + nice(mp),
          "AP(" + nice(L) + ") = " + nice(ap),
          "Tahap produksi: " + tahap
        ],
        result: true
      });

      var results = [
        { label: "Produksi total TP(L)", value: nice(tp), hero: true },
        { label: "Produk marjinal MP(L)", value: nice(mp), hero: true },
        { label: "Produk rata-rata AP(L)", value: nice(ap) },
        { label: "Tahap produksi", value: tahap, sub: saran },
        { label: "AP maksimum pada L", value: nice(Lap), sub: "AP maks = " + nice(APmax) },
        { label: "TP maksimum pada L", value: nice(Ltpmax), sub: "TP maks = " + nice(TPmax) },
        { label: "MP maksimum pada L", value: nice(Lmpmax), sub: "MP maks = " + nice(MPmax) },
        { label: "MRTS (MPL/MPK)", value: isFinite(MPmax) ? "butuh data K" : "—", sub: "MPL = " + nice(mp) }
      ];

      var xr = [0, Lmax];
      var yTop1 = Math.max(TP(Lmax), TPmax, tp, 1) * 1.1;
      var yTop2 = Math.max(MPmax, APmax, mp, ap, 1) * 1.15;
      var regions = [];
      if (isFinite(Lap) && isFinite(Ltpmax) && Lap < Lmax) {
        var bandEnd = Math.min(Ltpmax, Lmax);
        regions.push({
          pts: [[Lap, 0], [bandEnd, 0], [bandEnd, yTop1], [Lap, yTop1]],
          color: "supply", opacity: 0.07
        });
      }
      var charts = [{
        title: "Produksi total, marjinal, dan rata-rata",
        sub: "sumbu kiri: TP · sumbu kanan: MP & AP · pita hijau = tahap rasional",
        xLabel: "Tenaga kerja (L)", yLabel: "Output (TP)", yLabel2: "MP & AP",
        xDomain: xr, yDomain: [0, yTop1], yDomain2: [Math.min(0, mp), yTop2],
        series: [
          { label: "TP (sumbu kiri)", color: "ink", fn: TP, xRange: xr },
          { label: "MP", color: "demand", axis: 2, fn: MP, xRange: xr },
          { label: "AP", color: "blue", axis: 2, fn: AP, xRange: xr }
        ],
        regions: regions,
        vlines: [
          { x: Lap, label: "AP maks (L = " + nice(Lap) + ")", color: "ink" },
          { x: Ltpmax, label: "MP = 0 (L = " + nice(Ltpmax) + ")", color: "demand" },
          { x: L, label: "L uji = " + nice(L), color: "blue" }
        ],
        points: [
          { x: L, y: tp, color: "ink", label: "TP = " + nice(tp) }
        ]
      }];

      var notes = [];
      if (isFinite(Ltpmax) && Ltpmax > Lmax) notes.push("Titik MP = 0 (L = " + nice(Ltpmax) + ") berada di luar batas gambar; naikkan L maks bila ingin melihatnya.");

      return {
        steps: steps, results: results, notes: notes, charts: charts,
        status: "Pada L = " + nice(L) + ": TP = " + nice(tp) + ", MP = " + nice(mp) + ", AP = " + nice(ap) + " → " + tahap + "."
      };
    }
  };

  /* ------------------------------------------------------- 6. BIAYA */
  MODES.biaya = {
    label: "Biaya Produksi",
    title: "Biaya Produksi Jangka Pendek — TC, AC, AVC, MC",
    desc: "Biaya tetap FC ditambah biaya variabel VC = p·Q + q·Q² + r·Q³. Kalkulator menyusun TC, AC, AFC, AVC, dan MC, menemukan titik minimum AVC (titik tutup usaha) dan minimum AC (titik impas), lalu mengevaluasi biaya pada kuantitas pilihanmu.",
    fields: [
      { id: "FC", label: "Biaya tetap (FC)", def: 50 },
      { id: "p", label: "Koefisien linear (p)", def: 12, hint: "VC = pQ + qQ² + rQ³" },
      { id: "q", label: "Koefisien kuadrat (q)", def: -1.2, hint: "biasanya negatif pada awal" },
      { id: "r", label: "Koefisien kubik (r)", def: 0.08 },
      { id: "Q", label: "Kuantitas yang dievaluasi (Q)", def: 10 }
    ],
    compute: function (v) {
      var FC = v.FC, p = v.p, q = v.q, r = v.r, Q = v.Q;
      if (!ok(FC, p, q, r, Q)) throw "Isi semua kolom (boleh nol).";
      if (!(Q > 0)) throw "Kuantitas Q harus lebih besar dari 0.";
      if (FC < 0) throw "Biaya tetap tidak boleh negatif.";

      function VC(x) { return p * x + q * x * x + r * x * x * x; }
      function TC(x) { return FC + VC(x); }
      function AC(x) { return x > 0 ? TC(x) / x : NaN; }
      function AVC(x) { return x > 0 ? VC(x) / x : NaN; }
      function AFC(x) { return x > 0 ? FC / x : NaN; }
      function MC(x) { return p + 2 * q * x + 3 * r * x * x; }

      var Qavc = (r > 0 && q < 0) ? -q / (2 * r) : NaN;
      var Qmc = (r > 0 && q < 0) ? -q / (3 * r) : NaN;
      var Qac = findRoot(function (x) { return MC(x) - AC(x); }, Math.max(1e-4, Q / 200), Math.max(10, Q * 3));
      if (!isFinite(Qac)) Qac = NaN;

      var t = TC(Q), ac = AC(Q), avc = AVC(Q), afc = AFC(Q), mc = MC(Q);

      var steps = [
        {
          label: "Susun fungsi biaya",
          lines: [
            "VC = " + nice(p) + "Q + (" + nice(q) + ")Q² + " + nice(r) + "Q³",
            "TC = FC + VC = " + nice(FC) + " + " + nice(p) + "Q + (" + nice(q) + ")Q² + " + nice(r) + "Q³",
            "AC = TC/Q        AVC = VC/Q        AFC = " + nice(FC) + "/Q",
            "MC = ∂TC/∂Q = " + nice(p) + " + " + nice(2 * q) + "Q + " + nice(3 * r) + "Q²"
          ]
        },
        {
          label: "Evaluasi pada Q = " + nice(Q),
          lines: [
            "VC(" + nice(Q) + ") = " + nice(VC(Q)),
            "TC(" + nice(Q) + ") = " + nice(FC) + " + " + nice(VC(Q)) + " = " + nice(t),
            "AC = " + nice(t) + " : " + nice(Q) + " = " + nice(ac),
            "AVC = " + nice(VC(Q)) + " : " + nice(Q) + " = " + nice(avc) + "      AFC = " + nice(FC) + " : " + nice(Q) + " = " + nice(afc) + "      (AC = AVC + AFC ✓)",
            "MC = " + nice(p) + " + " + nice(2 * q) + "(" + nice(Q) + ") + " + nice(3 * r) + "(" + nice(Q * Q) + ") = " + nice(mc),
            mc < ac ? "MC (" + nice(mc) + ") &lt; AC (" + nice(ac) + ") → biaya rata-rata masih menurun"
              : "MC (" + nice(mc) + ") &gt; AC (" + nice(ac) + ") → biaya rata-rata sedang naik",
            "Laba per unit bila harga jual P: P − AC = P − " + nice(ac)
          ],
          result: true
        }
      ];
      if (isFinite(Qavc)) {
        steps.push({
          label: "Titik minimum AVC (titik tutup usaha)",
          lines: [
            "∂AVC/∂Q = " + nice(q) + " + " + nice(2 * r) + "Q = 0  →  Q = " + nice(Qavc),
            "AVC min = " + nice(AVC(Qavc)) + " ;  MC di titik itu = " + nice(MC(Qavc)) + " → MC memotong AVC di minimumnya ✓",
            "Perusahaan tutup (shutdown) bila harga pasar &lt; " + nice(AVC(Qavc))
          ]
        });
      }
      if (isFinite(Qac)) {
        steps.push({
          label: "Titik minimum AC (titik impas)",
          lines: [
            "MC = AC  →  selesaikan secara numerik: Q = " + nice(Qac),
            "AC min = " + nice(AC(Qac)) + " ;  MC di titik itu = " + nice(MC(Qac)) + " (selisih ≈ " + nice(Math.abs(MC(Qac) - AC(Qac))) + ") ✓",
            "Harga impas (break even) = " + nice(AC(Qac)) + " ; di bawah itu perusahaan rugi"
          ]
        });
      }
      if (isFinite(Qmc)) {
        steps.push({
          label: "MC minimum",
          lines: ["∂MC/∂Q = " + nice(2 * q) + " + " + nice(6 * r) + "Q = 0  →  Q = " + nice(Qmc) + " ;  MC min = " + nice(MC(Qmc))]
        });
      }

      var results = [
        { label: "TC pada Q", value: nice(t), hero: true },
        { label: "AC pada Q", value: nice(ac), hero: true },
        { label: "MC pada Q", value: nice(mc), hero: true },
        { label: "AVC pada Q", value: nice(avc) },
        { label: "AFC pada Q", value: nice(afc) },
        { label: "VC pada Q", value: nice(VC(Q)) },
        { label: "Q pada AVC minimum", value: nice(Qavc), sub: "AVC min = " + nice(isFinite(Qavc) ? AVC(Qavc) : NaN) },
        { label: "Q pada AC minimum", value: nice(Qac), sub: "AC min = " + nice(isFinite(Qac) ? AC(Qac) : NaN) },
        { label: "Q pada MC minimum", value: nice(Qmc), sub: "MC min = " + nice(isFinite(Qmc) ? MC(Qmc) : NaN) },
        { label: "Skala", value: isFinite(Qac) ? (Q < Qac ? "economies of scale (AC masih turun)" : "diseconomies of scale (AC naik)") : "—" }
      ];

      var Qstart = Math.max(0.5, (isFinite(Qac) ? Qac / 10 : 1));
      var Qmax = Math.max(20, isFinite(Qac) ? Qac * 3 : 20, Q * 2.5);
      var yTop = 0;
      for (var i = 0; i <= 60; i++) {
        var x = Qstart + (Qmax - Qstart) * (i / 60);
        yTop = Math.max(yTop, isFinite(AC(x)) ? AC(x) : 0, isFinite(AVC(x)) ? AVC(x) : 0, MC(x));
      }
      yTop *= 1.08;
      var charts = [{
        title: "Kurva biaya rata-rata dan marjinal",
        sub: "MC memotong AVC dan AC tepat di titik minimumnya",
        xLabel: "Kuantitas produksi (Q)", yLabel: "Biaya per unit / marjinal",
        xDomain: [0, Qmax], yDomain: [0, yTop],
        series: [
          { label: "AC", color: "blue", fn: AC, xRange: [Qstart, Qmax], n: 160 },
          { label: "AVC", color: "demand", fn: AVC, xRange: [Qstart, Qmax], n: 160 },
          { label: "AFC", color: "muted", dash: true, fn: AFC, xRange: [Qstart, Qmax], n: 160 },
          { label: "MC", color: "supply", fn: MC, xRange: [Qstart, Qmax], n: 160 }
        ],
        vlines: [
          { x: Q, label: "Q uji = " + nice(Q), color: "ink" },
          isFinite(Qavc) ? { x: Qavc, label: "AVC min = " + nice(Qavc), color: "demand" } : null,
          isFinite(Qac) ? { x: Qac, label: "AC min = " + nice(Qac), color: "blue" } : null
        ].filter(Boolean),
        points: [
          { x: Q, y: ac, color: "blue", label: "AC = " + nice(ac) },
          { x: Q, y: mc, color: "supply", label: "MC = " + nice(mc), dy: 14 },
          isFinite(Qac) ? { x: Qac, y: AC(Qac), color: "ink", label: "impas " + nice(AC(Qac)), dy: -12 } : null
        ].filter(Boolean)
      }];

      return {
        steps: steps, results: results, charts: charts, notes: [],
        status: "Pada Q = " + nice(Q) + ": TC = " + nice(t) + ", AC = " + nice(ac) + ", MC = " + nice(mc) + ". " +
          (isFinite(Qac) ? "Titik impas pada Q ≈ " + nice(Qac) + " dengan AC minimum " + nice(AC(Qac)) + "." : "")
      };
    }
  };

  /* -------------------------------------------------- 7. LABA MAKSIMUM */
  MODES.laba = {
    label: "Laba Maksimum",
    title: "Pendapatan &amp; Laba Maksimum — MR = MC",
    desc: "Mode monopoli memakai permintaan menurun P = a − bQ, mode persaingan sempurna memakai harga pasar yang sudah ditentukan (P = MR = AR). Keduanya menghasilkan kuantitas, harga, dan laba pada titik MR = MC.",
    fields: [
      {
        id: "seg", label: "Struktur pasar", def: "monopoli", type: "select",
        options: [["monopoli", "monopoli / permintaan menurun"], ["persaingan", "persaingan sempurna (harga pasar)"]]
      },
      { id: "a", label: "Intersep permintaan (a)", def: 100, hint: "P = a − bQ", when: function (v) { return v.seg === "monopoli"; } },
      { id: "b", label: "Kemiringan permintaan (b)", def: 2, when: function (v) { return v.seg === "monopoli"; } },
      { id: "Pmark", label: "Harga pasar (P)", def: 60, when: function (v) { return v.seg === "persaingan"; }, hint: "P = MR = AR" },
      { id: "FC", label: "Biaya tetap (FC)", def: 40 },
      { id: "p", label: "Biaya variabel — linear (p)", def: 10, hint: "VC = pQ + qQ² + rQ³" },
      { id: "q", label: "Biaya variabel — kuadrat (q)", def: 2 },
      { id: "r", label: "Biaya variabel — kubik (r)", def: 0, hint: "0 = MC linear" }
    ],
    compute: function (v) {
      var FC = v.FC, p = v.p, q = v.q, r = v.r;
      if (!ok(FC, p, q, r)) throw "Isi koefisien biaya (boleh 0).";
      var seg = v.seg || "monopoli";
      var a, b, Pmark;
      if (seg === "monopoli") {
        a = v.a; b = v.b;
        if (!ok(a, b) || !(b > 0)) throw "Isi intersep dan kemiringan permintaan (b harus > 0).";
      } else {
        Pmark = v.Pmark;
        if (!ok(Pmark) || !(Pmark > 0)) throw "Isi harga pasar yang berlaku.";
      }

      function TC(Q) { return FC + p * Q + q * Q * Q + r * Q * Q * Q; }
      function MC(Q) { return p + 2 * q * Q + 3 * r * Q * Q; }
      function AC(Q) { return Q > 0 ? TC(Q) / Q : NaN; }
      function AVC(Q) { return Q > 0 ? (p * Q + q * Q * Q + r * Q * Q * Q) / Q : NaN; }

      var Q, P, steps = [], notes = [];

      if (seg === "monopoli") {
        steps.push({
          label: "Pendapatan total dan marjinal",
          lines: [
            "P = " + nice(a) + " − " + nice(b) + "Q",
            "TR = P × Q = " + nice(a) + "Q − " + nice(b) + "Q²",
            "MR = ∂TR/∂Q = " + nice(a) + " − " + nice(2 * b) + "Q",
            "AR = TR/Q = P = " + nice(a) + " − " + nice(b) + "Q",
            "MC = ∂TC/∂Q = " + nice(p) + " + " + nice(2 * q) + "Q + " + nice(3 * r) + "Q²"
          ]
        });
        var A = 3 * r, B = 2 * q + 2 * b, C = p - a;
        var roots = roots2(A, B, C).filter(function (x) { return x > 1e-9 && a - b * x > 0; });
        if (!roots.length) throw "Tidak ada solusi MR = MC yang masuk akal dengan parameter ini.";
        Q = Math.min.apply(null, roots);
        P = a - b * Q;
        steps.push({
          label: "Syarat laba maksimum: MR = MC",
          lines: [
            nice(a) + " − " + nice(2 * b) + "Q = " + nice(p) + " + " + nice(2 * q) + "Q + " + nice(3 * r) + "Q²",
            "Susun menjadi bentuk baku: " + nice(A) + "Q² + " + nice(B) + "Q + (" + nice(C) + ") = 0",
            (Math.abs(A) < 1e-12
              ? "Karena A = 0 → Q* = " + nice(-C / B)
              : "Q = [−(" + nice(B) + ") ± √(" + nice(B * B - 4 * A * C) + ")] : " + nice(2 * A) +
                "  → akar positif: " + roots.map(function (x) { return nice(x); }).join(" ; ")),
            "Dipilih akar terkecil yang positif (MR menurun memotong MC yang menaik): Q* = " + nice(Q),
            "P* dibaca dari kurva permintaan: P = " + nice(a) + " − " + nice(b) + "(" + nice(Q) + ") = " + nice(P),
            "Cek: MR = " + nice(a - 2 * b * Q) + " ;  MC = " + nice(MC(Q)) + "  → sama ✓"
          ],
          result: true
        });
      } else {
        P = Pmark;
        steps.push({
          label: "Pada persaingan sempurna harga ditentukan pasar",
          lines: [
            "P = MR = AR = " + nice(P) + " (garis permintaan mendatar untuk perusahaan)",
            "Laba maksimum tetap di MR = MC → " + nice(P) + " = " + nice(p) + " + " + nice(2 * q) + "Q + " + nice(3 * r) + "Q²",
            "MC = ∂TC/∂Q = " + nice(p) + " + " + nice(2 * q) + "Q + " + nice(3 * r) + "Q²"
          ]
        });
        var A2 = 3 * r, B2 = 2 * q, C2 = p - P;
        var roots2b = roots2(A2, B2, C2).filter(function (x) { return x > 1e-9; });
        if (!roots2b.length) throw "Tidak ada Q yang membuat MC = harga pasar. Cek parameter biaya.";
        Q = Math.max.apply(null, roots2b);
        steps.push({
          label: "Selesaikan MC = P",
          lines: [
            nice(A2) + "Q² + " + nice(B2) + "Q + (" + nice(C2) + ") = 0",
            "Akar positif: " + roots2b.map(function (x) { return nice(x); }).join(" ; "),
            "Dipilih Q* = " + nice(Q) + " (sisi MC menaik)",
            "Cek: MC(" + nice(Q) + ") = " + nice(MC(Q)) + " = harga pasar " + nice(P) + " ✓"
          ],
          result: true
        });
      }

      var TR = P * Q, tc = TC(Q), profit = TR - tc, ac = AC(Q), avc = AVC(Q), mc = MC(Q);
      var Qavc = (r > 0 && q < 0) ? -q / (2 * r) : NaN;
      var avcMin = isFinite(Qavc) ? AVC(Qavc) : NaN;

      steps.push({
        label: "Hitung laba",
        lines: [
          "TR = P × Q = " + nice(P) + " × " + nice(Q) + " = " + nice(TR),
          "TC = " + nice(FC) + " + " + nice(p) + "(" + nice(Q) + ") + " + nice(q) + "(" + nice(Q * Q) + ") + " + nice(r) + "(" + nice(Q * Q * Q) + ") = " + nice(tc),
          "AC = TC/Q = " + nice(ac),
          "Laba = TR − TC = " + nice(profit),
          "Cara kedua: laba = (P − AC) × Q = (" + nice(P) + " − " + nice(ac) + ") × " + nice(Q) + " = " + nice((P - ac) * Q)
        ],
        result: true
      });

      var status;
      if (profit > 0) status = "Perusahaan memperoleh laba " + nice(profit) + " pada Q = " + nice(Q) + " dan harga " + nice(P) + ".";
      else if (profit === 0) status = "Perusahaan tepat impas (P = AC) pada Q = " + nice(Q) + ".";
      else status = "Perusahaan merugi " + nice(Math.abs(profit)) + " pada Q = " + nice(Q) + ". " +
        "Selama harga masih di atas AVC (" + nice(avc) + "), kerugian lebih kecil daripada tutup usaha.";
      if (isFinite(avcMin) && P < avcMin) {
        notes.push("Harga (" + nice(P) + ") berada di bawah AVC minimum (" + nice(avcMin) + ") → sebaiknya berhenti berproduksi (shutdown).");
      }
      if (seg === "monopoli") {
        notes.push("Selisih harga di atas MC = " + nice(P - mc) + " — ukuran kekuatan harga (mark-up) perusahaan.");
      }

      var results = [
        { label: "Kuantitas laba maksimum (Q*)", value: nice(Q), hero: true },
        { label: "Harga jual (P*)", value: nice(P), hero: true },
        { label: "Laba maksimum", value: nice(profit), hero: true },
        { label: "TR", value: nice(TR) },
        { label: "TC", value: nice(tc) },
        { label: "AC pada Q*", value: nice(ac), sub: "AVC = " + nice(avc) },
        { label: "MR dan MC pada Q*", value: nice(seg === "monopoli" ? a - 2 * b * Q : P) + " ; " + nice(mc) },
        { label: "Margin per unit", value: nice(P - ac) },
        { label: "P − MC (kekuatan harga)", value: nice(P - mc) },
        { label: "Titik impas (P = AC)", value: isFinite(Qavc) ? "AVC min = " + nice(avcMin) : "—" }
      ];

      var yTopCand = [P, mc, ac];
      var Qmax = seg === "monopoli" ? Math.max(a / b, Q * 1.4) : Math.max(Q * 2.2, 1);
      for (var i2 = 0; i2 <= 40; i2++) {
        var xx = (Qmax) * (i2 / 40);
        if (xx > 0) yTopCand.push(AC(xx), MC(xx));
      }
      var yTop = Math.max.apply(null, yTopCand.filter(isFinite)) * 1.1;
      if (!(yTop > 0)) yTop = 1;
      var series = [], regions = [], hlines = [], vlines = [], points = [];
      if (seg === "monopoli") {
        series.push({ label: "Permintaan (D)", color: "demand", pts: [[0, a], [a / b, 0]] });
        series.push({ label: "MR = a − 2bQ", color: "demand", dash: true, pts: [[0, a], [a / (2 * b), 0]] });
      } else {
        series.push({ label: "D = MR = AR = P", color: "demand", pts: [[0, P], [Qmax, P]] });
      }
      series.push({ label: "MC", color: "supply", fn: MC, xRange: [0, Qmax], n: 120 });
      if (FC > 0) series.push({ label: "AC", color: "blue", fn: AC, xRange: [Math.max(Qmax / 40, 0.1), Qmax], n: 120 });
      vlines.push({ x: Q, label: "Q* = " + nice(Q), color: "ink" });
      hlines.push({ y: P, label: "P* = " + nice(P), color: "blue" });
      if (profit !== 0 && isFinite(ac)) {
        regions.push({
          pts: [[0, P], [Q, P], [Q, ac], [0, ac]],
          color: profit > 0 ? "supply" : "demand", opacity: 0.18
        });
      }
      points.push({ x: Q, y: P, color: "ink", label: "E* (" + nice(Q) + "; " + nice(P) + ")" });
      points.push({ x: Q, y: mc, color: "supply", label: "MC = " + nice(mc), dy: 14 });

      var charts = [{
        title: seg === "monopoli" ? "Keseimbangan monopoli (MR = MC)" : "Keseimbangan persaingan sempurna (P = MC)",
        sub: "daerah terwarnai = laba (hijau) atau rugi (merah) per unit dikali kuantitas",
        xLabel: "Kuantitas (Q)", yLabel: "Harga & biaya per unit",
        xDomain: [0, Qmax], yDomain: [0, yTop],
        series: series, regions: regions, hlines: hlines, vlines: vlines, points: points
      }];

      return { steps: steps, results: results, notes: notes, charts: charts, status: status };
    }
  };

  /* -------------------------------------------------- 8. DISKRIMINASI */
  MODES.diskriminasi = {
    label: "Diskriminasi Harga",
    title: "Diskriminasi Harga Dua Pasar — MR1 = MR2 = MRt = MC",
    desc: "Dua pasar dengan permintaan Q1 = a1 − b1·P1 dan Q2 = a2 − b2·P2. Penerimaan marjinal dijumlahkan secara horizontal, lalu dipotongkan dengan biaya marjinal MC = c0 + c1·Q untuk memperoleh harga dan kuantitas di tiap pasar.",
    fields: [
      { id: "a1", label: "Pasar 1 — intersep (a1)", def: 200, hint: "Q1 = a1 − b1·P1" },
      { id: "b1", label: "Pasar 1 — kemiringan (b1)", def: 4 },
      { id: "a2", label: "Pasar 2 — intersep (a2)", def: 160 },
      { id: "b2", label: "Pasar 2 — kemiringan (b2)", def: 5 },
      { id: "c0", label: "MC — konstanta (c0)", def: 10, hint: "MC = c0 + c1·Q" },
      { id: "c1", label: "MC — kemiringan (c1)", def: 0, hint: "0 = MC konstan" },
      { id: "FC", label: "Biaya tetap (FC)", def: 0 }
    ],
    compute: function (v) {
      var a1 = v.a1, b1 = v.b1, a2 = v.a2, b2 = v.b2, c0 = v.c0, c1 = v.c1, FC = v.FC || 0;
      if (!ok(a1, b1, a2, b2, c0, c1, FC)) throw "Isi semua kolom (FC boleh 0).";
      if (!(b1 > 0) || !(b2 > 0)) throw "Kemiringan permintaan b1 dan b2 harus lebih besar dari 0.";
      if (c1 < 0) throw "Kemiringan MC (c1) tidak boleh negatif.";
      if (c0 < 0) throw "Konstanta MC tidak boleh negatif.";

      var notes = [];
      /* iterasi himpunan pasar aktif */
      var active = [true, true], m = c0, iter, i;
      for (iter = 0; iter < 25; iter++) {
        var sumA = 0, sumB = 0, anyChange = false;
        for (i = 0; i < 2; i++) {
          var ai = i === 0 ? a1 : a2, bi = i === 0 ? b1 : b2;
          var q = (ai - bi * m) / 2;
          var act = q > 1e-9;
          if (act !== active[i]) anyChange = true;
          active[i] = act;
          if (act) { sumA += ai; sumB += bi; }
        }
        if (!sumA || !sumB) break;
        var newM = (c0 + c1 * (sumA / 2)) / (1 + c1 * (sumB / 2));
        if (Math.abs(newM - m) < 1e-12 && !anyChange) { m = newM; break; }
        m = newM;
        if (!anyChange && iter > 3) break;
      }

      function marketQ(ai, bi) { return Math.max(0, (ai - bi * m) / 2); }
      var Q1 = marketQ(a1, b1), Q2 = marketQ(a2, b2);
      var P1 = (a1 - Q1) / b1, P2 = (a2 - Q2) / b2;
      var Qt = Q1 + Q2;
      var TR1 = P1 * Q1, TR2 = P2 * Q2, TR = TR1 + TR2;
      var VC = c0 * Qt + c1 * Qt * Qt / 2;
      var TC = FC + VC, profit = TR - TC;
      if (Q1 <= 0) notes.push("Pasar 1 tidak dilayani: pada MR bersama, MR pasar 1 sudah di bawah MC sejak unit pertama.");
      if (Q2 <= 0) notes.push("Pasar 2 tidak dilayani: pada MR bersama, MR pasar 2 sudah di bawah MC sejak unit pertama.");
      notes.push("Pembagian pasar harus efektif (tidak bisa dijual ulang antar pasar), jika tidak harga rendah akan bocor ke pasar mahal.");

      var E1 = -b1 * (P1 / (Q1 || 1)), E2 = -b2 * (P2 / (Q2 || 1));
      var steps = [
        {
          label: "Invers permintaan dan MR tiap pasar",
          lines: [
            "Pasar 1: Q1 = " + nice(a1) + " − " + nice(b1) + "P1  →  P1 = (" + nice(a1) + " − Q1)/" + nice(b1) + " = " + nice(a1 / b1) + " − " + nice(1 / b1) + "Q1",
            "         MR1 = " + nice(a1 / b1) + " − " + nice(2 / b1) + "Q1         (kemiringan dua kali P1)",
            "Pasar 2: Q2 = " + nice(a2) + " − " + nice(b2) + "P2  →  P2 = " + nice(a2 / b2) + " − " + nice(1 / b2) + "Q2",
            "         MR2 = " + nice(a2 / b2) + " − " + nice(2 / b2) + "Q2",
            "MC = " + nice(c0) + (c1 > 0 ? " + " + nice(c1) + "Q" : " (konstan)")
          ]
        },
        {
          label: "Penjumlahan horizontal MR (MRt = MR1 + MR2)",
          lines: [
            "Pada nilai MR bersama = m, tiap pasar memilih kuantitas:",
            "  Q1 = (" + nice(a1) + " − " + nice(b1) + "m)/2        Q2 = (" + nice(a2) + " − " + nice(b2) + "m)/2",
            "Kuantitas total: QTotal = (" + nice(a1 + a2) + " − " + nice(b1 + b2) + "m)/2",
            "Dibalik: m = (" + nice(a1 + a2) + " − 2·QTotal)/" + nice(b1 + b2) + "  →  inilah kurva MRt",
            c1 > 0
              ? "Syarat keseimbangan m = MC: m = [" + nice(c0) + " + " + nice(c1) + "(" + nice((a1 + a2) / 2) + ")] : [1 + " + nice(c1) + "(" + nice((b1 + b2) / 2) + ")] = " + nice(m)
              : "MC konstan → MR bersama = m = " + nice(m) + " (MR1 = MR2 = MC)"
          ],
          result: true
        },
        {
          label: "Kuantitas dan harga di tiap pasar",
          lines: [
            "Q1 = (" + nice(a1) + " − " + nice(b1) + " × " + nice(m) + ")/2 = " + nice(Q1) + "   →   P1 = (a1 − Q1)/b1 = " + nice(P1),
            "Q2 = (" + nice(a2) + " − " + nice(b2) + " × " + nice(m) + ")/2 = " + nice(Q2) + "   →   P2 = (a2 − Q2)/b2 = " + nice(P2),
            "QTotal = " + nice(Qt),
            "Cek: MR1 = " + nice(a1 / b1 - (2 / b1) * Q1) + " ;  MR2 = " + nice(a2 / b2 - (2 / b2) * Q2) + " ;  MC = " + nice(c0 + c1 * Qt) + "  → ketiganya sama ✓"
          ]
        },
        {
          label: "Elastisitas tiap pasar dan laba",
          lines: [
            "E1 = (∂Q1/∂P1) × (P1/Q1) = (" + nice(-b1) + ")(" + nice(P1) + "/" + nice(Q1) + ") = " + nice(E1),
            "E2 = (" + nice(-b2) + ")(" + nice(P2) + "/" + nice(Q2) + ") = " + nice(E2),
            "TR = " + nice(TR1) + " + " + nice(TR2) + " = " + nice(TR),
            "TC = " + nice(FC) + " + " + nice(c0) + "(" + nice(Qt) + ")" + (c1 > 0 ? " + ½(" + nice(c1) + ")(" + nice(Qt * Qt) + ")" : "") + " = " + nice(TC),
            "Laba = TR − TC = " + nice(profit)
          ],
          result: true
        }
      ];

      var hasil = [
        { label: "Harga pasar 1 (P1)", value: nice(P1), hero: true },
        { label: "Harga pasar 2 (P2)", value: nice(P2), hero: true },
        { label: "Laba total", value: nice(profit), hero: true },
        { label: "Kuantitas pasar 1 (Q1)", value: nice(Q1), sub: "TR = " + nice(TR1) },
        { label: "Kuantitas pasar 2 (Q2)", value: nice(Q2), sub: "TR = " + nice(TR2) },
        { label: "MR bersama = MC", value: nice(m), sub: "MR1 = MR2 = MRt" },
        { label: "QTotal", value: nice(Qt) },
        { label: "TR total", value: nice(TR) },
        { label: "TC total", value: nice(TC) },
        { label: "Elastisitas E1 ; E2", value: nice(E1) + " ; " + nice(E2), sub: "pasar lebih elastis diberi harga lebih murah" },
        { label: "Selisih harga", value: nice(Math.abs(P1 - P2)), sub: "P1 − P2 = " + nice(P1 - P2) }
      ];

      var mrtInv = function (Q) { return ((a1 + a2) - 2 * Q) / (b1 + b2); };
      var mcFn = function (Q) { return c0 + c1 * Q; };
      var qm1 = Math.max(Q1 * 1.6, a1 / b1 * 0.6), qm2 = Math.max(Q2 * 1.6, a2 / b2 * 0.6);
      var yD1 = Math.max(a1 / b1, P1 * 1.2), yD2 = Math.max(a2 / b2, P2 * 1.2);
      var qmT = Math.max(Qt * 1.5, 1);
      var yT = Math.max(mrtInv(0), m, c0 + c1 * qmT) * 1.15;

      var charts = [
        {
          title: "Pasar 1",
          sub: "MR1 = MC bersama → Q1, lalu harga dibaca dari D1",
          xLabel: "Kuantitas pasar 1", yLabel: "Harga P1",
          xDomain: [0, qm1], yDomain: [0, yD1],
          series: [
            { label: "D1", color: "demand", pts: [[0, a1 / b1], [a1, 0]] },
            { label: "MR1", color: "demand", dash: true, pts: [[0, a1 / b1], [a1 / 2, 0]] }
          ],
          hlines: [{ y: m, label: "MR bersama = " + nice(m), color: "blue" }],
          vlines: [{ x: Q1, label: "Q1 = " + nice(Q1) }],
          points: [{ x: Q1, y: P1, color: "ink", label: "P1 = " + nice(P1) }]
        },
        {
          title: "Pasar 2",
          sub: "MR2 = MC bersama → Q2, lalu harga dibaca dari D2",
          xLabel: "Kuantitas pasar 2", yLabel: "Harga P2",
          xDomain: [0, qm2], yDomain: [0, yD2],
          series: [
            { label: "D2", color: "supply", pts: [[0, a2 / b2], [a2, 0]] },
            { label: "MR2", color: "supply", dash: true, pts: [[0, a2 / b2], [a2 / 2, 0]] }
          ],
          hlines: [{ y: m, label: "MR bersama = " + nice(m), color: "blue" }],
          vlines: [{ x: Q2, label: "Q2 = " + nice(Q2) }],
          points: [{ x: Q2, y: P2, color: "ink", label: "P2 = " + nice(P2) }]
        },
        {
          title: "Gabungan: MRt = MR1 + MR2 dijumlahkan horizontal",
          sub: "perpotongan MRt dengan MC menentukan output total",
          xLabel: "Kuantitas total (QTotal)", yLabel: "MR & MC per unit",
          xDomain: [0, qmT], yDomain: [0, yT],
          series: [
            { label: "MR1 (pasar 1)", color: "demand", width: 1.4, dash: true, pts: [[0, a1 / b1], [a1 / 2, 0]] },
            { label: "MR2 (pasar 2)", color: "supply", width: 1.4, dash: true, pts: [[0, a2 / b2], [a2 / 2, 0]] },
            { label: "MRt", color: "ink", fn: mrtInv, xRange: [0, (a1 + a2) / 2], n: 60 },
            { label: "MC", color: "blue", fn: mcFn, xRange: [0, qmT], n: 60 }
          ],
          points: [{ x: Qt, y: m, color: "ink", label: "QTotal = " + nice(Qt) + " ; MR = MC = " + nice(m) }],
          vlines: [{ x: Qt, color: "ink" }]
        }
      ];

      return {
        steps: steps, results: hasil, notes: notes, charts: charts,
        status: "Diskriminasi harga menghasilkan P1 = " + nice(P1) + " (Q1 = " + nice(Q1) + ") dan P2 = " + nice(P2) +
          " (Q2 = " + nice(Q2) + ") dengan laba total " + nice(profit) + "."
      };
    }
  };
<!-- @@APP-NEXT@@ -->