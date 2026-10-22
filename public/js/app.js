/* =========================================================================
   app.js — logika kalkulator Ekonomi Mikro.
   Setiap mode: kumpulan field + fungsi hitung yang mengembalikan
   { steps, results, notes, charts }. Semua hitungan dilakukan lokal.
   ========================================================================= */
(function () {
  "use strict";

  var fmt = (window.Charts && window.Charts.fmt) || function (v) { return String(v); };

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
  /* Pastikan pasar punya titik potong di kuadran positif. Kurva linear bisa
     berpotongan di Q atau P negatif; itu bukan keseimbangan pasar yang bisa
     digambar/ditafsirkan, jadi lebih baik ditolak dengan pesan jelas. */
  function cekKeseimbanganPositif(a, b, c, d) {
    var pe = (a - c) / (b + d);
    var qe = a - b * pe;
    if (!(pe > 0) || !(qe > 0)) {
      throw "Tidak ada keseimbangan pasar di daerah positif dengan angka ini " +
        "(P* = " + nice(pe) + ", Q* = " + nice(qe) + "). " +
        "Kurva permintaan dan penawaran harus berpotongan pada harga dan kuantitas yang keduanya lebih besar dari 0. " +
        "Periksa kembali a, b, c, dan d.";
    }
    return { Pe: pe, Qe: qe };
  }
  /* Math.max/min biasa menghasilkan NaN bila salah satu argumen NaN.
     Untuk domain grafik kita hanya ingin nilai yang benar-benar terhitung. */
  function maksFinite() {
    var vals = [];
    for (var i = 0; i < arguments.length; i++) {
      if (isFinite(arguments[i])) vals.push(arguments[i]);
    }
    vals.push(1);
    return Math.max.apply(null, vals);
  }
  function minFinite() {
    var vals = [];
    for (var i = 0; i < arguments.length; i++) {
      if (isFinite(arguments[i])) vals.push(arguments[i]);
    }
    vals.push(0);
    return Math.min.apply(null, vals);
  }

  /* ============================================================ MODES */
  var MODES = {};

  /* -------------------------------------------------- 1. KESEIMBANGAN */
  MODES.keseimbangan = {
    label: "Keseimbangan Pasar",
    title: "Keseimbangan Pasar — permintaan, penawaran, dan kebijakan",
    desc: "Qd = a − bP dan Qs = c + dP. Cari keseimbangan murni, lalu kombinasikan kebijakan apa pun sekaligus: pajak per unit, pajak persen, subsidi, harga minimum, harga maksimum, atau kuota — semuanya bisa dicentang bersamaan.",
    fields: [
      { id: "a", label: "Intersep permintaan (a)", def: 200, hint: "Qd = a − bP · konstanta saat P = 0" },
      { id: "b", label: "Kemiringan permintaan (b)", def: 10, hint: "harus &gt; 0" },
      { id: "c", label: "Intersep penawaran (c)", def: -40, hint: "Qs = c + dP · biasa negatif" },
      { id: "d", label: "Kemiringan penawaran (d)", def: 5, hint: "harus &gt; 0" },
      { heading: "Kebijakan pemerintah — boleh dikombinasikan" },
      { id: "pol_pajak", label: "Pajak per unit (t)", type: "check", def: false },
      { id: "t", label: "t =", def: 3, dep: true, when: function (v) { return v.pol_pajak; } },
      { id: "pol_persen", label: "Pajak persen (k %)", type: "check", def: false },
      { id: "k", label: "k (%) =", def: 20, dep: true, when: function (v) { return v.pol_persen; } },
      { id: "pol_subsidi", label: "Subsidi per unit (s)", type: "check", def: false },
      { id: "s", label: "s =", def: 3, dep: true, when: function (v) { return v.pol_subsidi; } },
      { id: "pol_floor", label: "Harga minimum / floor (melindungi produsen)", type: "check", def: false },
      { id: "Pmin", label: "Pmin =", def: 18, dep: true, when: function (v) { return v.pol_floor; } },
      { id: "govBuy", label: "Pemerintah membeli kelebihan (surplus) itu", type: "check", def: true, dep: true, when: function (v) { return v.pol_floor; } },
      { id: "pol_ceiling", label: "Harga maksimum / ceiling (melindungi pembeli)", type: "check", def: false },
      { id: "Pmax", label: "Pmax =", def: 12, dep: true, when: function (v) { return v.pol_ceiling; } },
      { id: "pol_kuota", label: "Kuota produksi (Q̄)", type: "check", def: false },
      { id: "Qbar", label: "Q̄ =", def: 30, dep: true, when: function (v) { return v.pol_kuota; } },
      { id: "surplus", label: "Tampilkan daerah surplus konsumen &amp; produsen", def: true, type: "check" }
    ],
    compute: function (v) {
      var a = v.a, b = v.b, c = v.c, d = v.d;
      if (!ok(a, b, c, d)) throw "Isi keempat koefisien permintaan dan penawaran dengan angka.";
      if (!(a > 0)) throw "Intersep permintaan (a) harus lebih besar dari 0.";
      if (!(b > 0) || !(d > 0)) throw "Koefisien b (permintaan) dan d (penawaran) harus lebih besar dari 0.";

      /* kebijakan yang dicentang — boleh lebih dari satu sekaligus */
      var onPajak = !!v.pol_pajak, onPersen = !!v.pol_persen, onSub = !!v.pol_subsidi;
      var onFloor = !!v.pol_floor, onCeil = !!v.pol_ceiling, onKuota = !!v.pol_kuota;
      var t = onPajak ? v.t : 0, kpersen = onPersen ? v.k : 0, s = onSub ? v.s : 0;
      if (onPajak && !(t > 0)) throw "Pajak per unit (t) harus lebih besar dari 0.";
      if (onPersen && !(kpersen > 0)) throw "Pajak persen (k) harus lebih besar dari 0.";
      if (onSub && !(s > 0)) throw "Subsidi per unit (s) harus lebih besar dari 0.";
      var Pmin = v.Pmin, Pmax = v.Pmax, Qbar = v.Qbar;
      if (onFloor && !ok(Pmin)) throw "Isi besaran harga minimum (Pmin).";
      if (onCeil && !ok(Pmax)) throw "Isi besaran harga maksimum (Pmax).";
      if (onFloor && Pmin <= 0) throw "Harga minimum (Pmin) harus lebih besar dari 0.";
      if (onCeil && Pmax <= 0) throw "Harga maksimum (Pmax) harus lebih besar dari 0.";
      if (onKuota && !(Qbar > 0)) throw "Kuota produksi (Q̄) harus lebih besar dari 0.";
      if (onFloor && onCeil && ok(Pmin, Pmax) && Pmin > Pmax) {
        throw "Harga minimum (" + nice(Pmin) + ") lebih tinggi daripada harga maksimum (" + nice(Pmax) +
          ") — mustahil dipenuhi pasar. Turunkan salah satu.";
      }

      var den = b + d;
      var eqPos = cekKeseimbanganPositif(a, b, c, d);
      var Pe = eqPos.Pe, Qe = eqPos.Qe;
      var choke = a / b, Ps0 = -c / d;
      var hasFiscal = onPajak || onPersen || onSub;
      var w = t - s;             /* belah ketupat tetap per unit: pajak +, subsidi − */
      var m = 1 + kpersen / 100; /* pengali pajak persen: Pb = m·Ps + w */

      var Pb = Pe, Ps = Pe, Qt = Qe, Qprod = Qe;   /* Qprod = kuantitas yang benar-benar diproduksi */
      var excess = 0, excessType = "", govCost = 0, rev = 0, wedge = 0;
      var floorBind = false, ceilBind = false, kuotaBind = false;
      var notes = [], steps = [];
      var policies = [];
      if (onPajak) policies.push("pajak " + nice(t) + "/unit");
      if (onPersen) policies.push("pajak " + nice(kpersen) + "%");
      if (onSub) policies.push("subsidi " + nice(s) + "/unit");
      if (onFloor) policies.push("floor " + nice(Pmin));
      if (onCeil) policies.push("ceiling " + nice(Pmax));
      if (onKuota) policies.push("kuota " + nice(Qbar));

      steps.push({
        label: "Fungsi permintaan & penawaran yang dipakai",
        lines: [
          "Qd = " + nice(a) + " − " + nice(b) + "P",
          "Qs = " + nice(c) + " + " + nice(d) + "P"
        ],
        why: "Empat angka ini kamu ketik di kolom kiri (a, b, c, d). Bentuknya linear: makin tinggi harga makin sedikit yang diminta (kemiringan −b) dan makin banyak yang ditawarkan (kemiringan +d). Kurva di grafik memakai persamaan ini persis — angkanya ikut berubah kalau kamu ganti input."
      });
      steps.push({
        label: "Keseimbangan murni: Qd = Qs",
        lines: [
          nice(a) + " − " + nice(b) + "P = " + nice(c) + " + " + nice(d) + "P",
          nice(a - c) + " = (" + nice(b) + " + " + nice(d) + ")P = " + nice(den) + "P",
          "P* = " + nice(a - c) + " : " + nice(den) + " = " + nice(Pe),
          "Q* = " + nice(a) + " − " + nice(b) + "×" + nice(Pe) + " = " + nice(Qe)
        ],
        result: "P* = " + nice(Pe) + " · Q* = " + nice(Qe),
        why: "Keseimbangan ada di harga yang membuat jumlah diminta sama dengan jumlah ditawarkan, jadi kedua ruas disamakan. P dikeluarkan dari faktor (b + d), lalu P* disubstitusikan balik untuk mendapatkan Q*. Dua angka ini jadi patokan pembanding semua kebijakan di bawah."
      });

      if (hasFiscal) {
        var psF = (a - c - b * w) / (d + b * m);
        var pbF = m * psF + w;
        var qF = a - b * pbF;
        if (!(qF > 0)) throw "Dengan pajak/subsidi sebesar ini tidak ada kuantitas pasar yang positif. Turunkan pajak atau naikkan subsidi.";
        if (!(pbF >= 0) || !(psF >= 0)) throw "Pajak/subsidi ini menghasilkan harga pembeli atau penjual yang negatif. Periksa kembali besarannya.";
        steps.push({
          label: "Geser penawaran lewat belah ketupat harga: Pb = m·Ps + w",
          lines: [
            "w = t − s = " + nice(t) + (onSub ? " − " + nice(s) : " − 0") + " = " + nice(w) + "   (belah ketupat per unit)",
            "m = 1 + k/100 = " + nice(m) + "   (pengali pajak persen)",
            nice(a) + " − " + nice(b) + "(" + nice(m) + "Ps + (" + nice(w) + ")) = " + nice(c) + " + " + nice(d) + "Ps",
            nice(a - c - b * w) + " = " + nice(d + b * m) + "Ps",
            "Ps = " + nice(a - c - b * w) + " : " + nice(d + b * m) + " = " + nice(psF),
            "Pb = " + nice(m) + " × " + nice(psF) + " + (" + nice(w) + ") = " + nice(pbF),
            "Q = " + nice(a) + " − " + nice(b) + "×" + nice(pbF) + " = " + nice(qF)
          ],
          result: "Pb = " + nice(pbF) + " · Ps = " + nice(psF) + " · Q = " + nice(qF),
          why: "Pajak atau subsidi membuat pembeli dan penjual melihat harga yang berbeda: selisihnya dikunci belah ketupat w per unit, sedangkan pajak persen mengali harga penjual lewat m. Angka w dan m berasal dari kolom t, s, k yang kamu centang. Hubungan Pb = m·Ps + w disubstitusikan ke Qd = Qs sehingga tersisa satu variabel (Ps), lalu Pb dan Q dihitung menyusul."
        });
        Pb = pbF; Ps = psF; Qt = qF; Qprod = qF;
        wedge = Pb - Ps;
        rev = wedge * Qt;
        steps.push({
          label: "Sebaran beban dan penerimaan pemerintah",
          lines: [
            "Pajak per unit efektif = Pb − Ps = " + nice(Pb) + " − " + nice(Ps) + " = " + nice(wedge),
            (rev >= 0 ? "Penerimaan pemerintah = " : "Biaya pemerintah (subsidi) = ") +
              nice(wedge) + " × " + nice(Qt) + " = " + nice(Math.abs(rev)),
            "Pembeli menanggung/menerima per unit = Pb − P* = " + nice(Pb) + " − " + nice(Pe) + " = " + nice(Pb - Pe),
            "Penjual menanggung/menerima per unit = P* − Ps = " + nice(Pe) + " − " + nice(Ps) + " = " + nice(Pe - Ps)
          ],
          why: "Dibanding keseimbangan murni P*, pembeli membayar lebih mahal (atau lebih murah saat subsidi) dan penjual menerima lebih sedikit (atau lebih banyak). Selisih Pb − P* dan P* − Ps inilah ukuran siapa menanggung beban kebijakan; besarnya dibagi menurut kemiringan kedua kurva — makin tegak suatu kurva, makin kecil beban di pihak itu."
        });
      }

      if (onFloor) {
        floorBind = Pmin > Ps;
        if (!floorBind) {
          steps.push({
            label: "Uji harga minimum (floor)",
            lines: [
              "Pmin = " + nice(Pmin) + " versus harga penjual yang berlaku = " + nice(Ps),
              "Pmin ≤ Ps → TIDAK mengikat"
            ],
            why: "Harga minimum hanya mengubah pasar bila ditetapkan di atas harga yang sudah diterima penjual. Kalau di bawahnya, aturan ini tidak memaksa apa pun dan pasar tetap di titik yang sudah dihitung."
          });
          notes.push("Harga minimum hanya efektif bila di atas harga penjual yang berlaku.");
        } else {
          var pbFl = m * Pmin + w;
          var qdFraw = a - b * pbFl, qsFraw = c + d * Pmin;
          var qdF = Math.max(0, qdFraw);
          var qsF = Math.max(0, qsFraw);
          excess = qsF - qdF;
          excessType = excess >= 0 ? "supply" : "demand";
          if (v.govBuy) {
            Qt = qsF;
            Qprod = qsF;
            govCost = excess > 0 ? Pmin * excess : 0;
          } else {
            Qt = Math.min(qdF, qsF);
            Qprod = Qt;
          }
          Pb = pbFl; Ps = Pmin; wedge = Pb - Ps; rev = wedge * Qt;
          if (qdF <= 0) notes.push("Pada harga minimum ini tidak ada pembeli yang mampu membeli (Qd = 0), jadi kuantitas yang terjual ke konsumen nol.");
          steps.push({
            label: "Floor mengikat: kunci harga penjual di Pmin",
            lines: [
              "Ps dikunci = Pmin = " + nice(Pmin),
              "Pb = m×Pmin + w = " + nice(m) + "×" + nice(Pmin) + " + (" + nice(w) + ") = " + nice(pbFl),
              "Qd(Pb) = " + nice(a) + " − " + nice(b) + "×" + nice(pbFl) + " = " + nice(qdFraw) +
                (qdFraw < 0 ? " → 0 (tidak ada permintaan efektif)" : ""),
              "Qs(Pmin) = " + nice(c) + " + " + nice(d) + "×" + nice(Pmin) + " = " + nice(qsFraw) +
                (qsFraw < 0 ? " → 0 (tidak ada penawaran efektif)" : ""),
              excess >= 0
                ? "Kelebihan penawaran = Qs − Qd = " + nice(qsF) + " − " + nice(qdF) + " = " + nice(excess) + " unit"
                : "Kelangkaan = Qd − Qs = " + nice(qdF) + " − " + nice(qsF) + " = " + nice(-excess) + " unit",
              v.govBuy
                ? "Biaya pembelian pemerintah = Pmin × kelebihan = " + nice(Pmin) + " × " + nice(excess) + " = " + nice(govCost)
                : "Yang terjual = min(Qd, Qs) = " + nice(Qt) + " — sisa produksi menumpuk"
            ],
            result: "Pb = " + nice(pbFl) + " · Ps = " + nice(Pmin) + " · Q = " + nice(Qt),
            why: "Floor melindungi harga yang diterima produsen, jadi Ps dikunci di Pmin; pembeli tetap membayar Pb = m×Ps + w. Pada harga itu penjual ingin menjual lebih banyak daripada yang laku — itulah kelebihan penawaran. Pemerintah boleh menyerapnya (biaya = Pmin × kelebihan, silakan centang di kolom kiri) atau membiarkannya menumpuk sebagai rugi produsen."
          });
        }
      }

      if (onCeil) {
        ceilBind = Pmax < Pb;
        if (!ceilBind) {
          steps.push({
            label: "Uji harga maksimum (ceiling)",
            lines: [
              "Pmax = " + nice(Pmax) + " versus harga pembeli yang berlaku = " + nice(Pb),
              "Pmax ≥ Pb → TIDAK mengikat"
            ],
            why: "Harga maksimum hanya mengikat bila lebih rendah daripada harga yang dibayar pembeli saat ini. Kalau di atasnya, aturan ini tidak mengubah apa pun."
          });
          notes.push("Harga maksimum hanya efektif bila di bawah harga pembeli yang berlaku.");
        } else {
          var pc = Pmax;
          var qdCraw = a - b * pc;
          var qdC = Math.max(0, qdCraw);
          var psC = (pc - w) / m;
          if (!(psC >= 0)) throw "Harga maksimum ini membuat harga yang diterima penjual negatif. Periksa kembali Pmax, pajak, dan subsidi.";
          if (floorBind && psC < Pmin) {
            /* floor dan ceiling sama-sama mengikat — konflik harga */
            var qsC2 = Math.max(0, c + d * Pmin);
            Qt = Math.min(qdC, qsC2); Qprod = Qt;
            Pb = pc; Ps = Pmin; wedge = Pb - Ps; rev = wedge * Qt;
            excess = qsC2 - qdC; excessType = excess >= 0 ? "supply" : "demand";
            notes.push("Floor dan ceiling sama-sama mengikat: pembeli dibatasi Pmax sementara penjual dijamin Pmin — kuantitas jadi yang terkecil di antara keduanya.");
            steps.push({
              label: "Floor + ceiling sama-sama mengikat (konflik harga)",
              lines: [
                "Pembeli dibatasi Pb = Pmax = " + nice(pc),
                "Penjual dijamin Ps = Pmin = " + nice(Pmin),
                "Qd(Pmax) = " + nice(a) + " − " + nice(b) + "×" + nice(pc) + " = " + nice(qdCraw) +
                  (qdCraw < 0 ? " → 0 (tidak ada permintaan efektif)" : ""),
                "Qs(Pmin) = " + nice(c) + " + " + nice(d) + "×" + nice(Pmin) + " = " + nice(qsC2),
                "Kuantitas terjadi = min(Qd, Qs) = " + nice(Qt)
              ],
              result: "Pb = " + nice(pc) + " · Ps = " + nice(Pmin) + " · Q = " + nice(Qt),
              why: "Kedua aturan saling menutup: pembeli tidak boleh membayar di atas Pmax, produsen tidak boleh menerima di bawah Pmin. Selisih Pb − Ps dipaksa oleh aturan, bukan lagi oleh belah ketupat, dan kuantitas pasar jadi yang terkecil di antara yang diminta dan yang ditawarkan."
            });
          } else {
            var qsCraw = c + d * psC;
            var qsC = Math.max(0, qsCraw);
            Qt = Math.min(qdC, qsC); Qprod = Qt;
            excess = qdC - qsC; excessType = excess >= 0 ? "demand" : "supply";
            Pb = pc; Ps = psC; wedge = Pb - Ps; rev = wedge * Qt;
            if (qdC <= 0) notes.push("Pada harga maksimum ini permintaan efektif nol (Qd = 0).");
            steps.push({
              label: "Ceiling mengikat: kunci harga pembeli di Pmax",
              lines: [
                "Pb dikunci = Pmax = " + nice(pc),
                "Ps = (Pmax − w) / m = (" + nice(pc) + " − (" + nice(w) + ")) / " + nice(m) + " = " + nice(psC),
                "Qd(Pmax) = " + nice(a) + " − " + nice(b) + "×" + nice(pc) + " = " + nice(qdCraw) +
                  (qdCraw < 0 ? " → 0 (tidak ada permintaan efektif)" : ""),
                "Qs(Ps) = " + nice(c) + " + " + nice(d) + "×" + nice(psC) + " = " + nice(qsCraw) +
                  (qsCraw < 0 ? " → 0 (tidak ada penawaran efektif)" : ""),
                "Kelangkaan = Qd − Qs = " + nice(qdC) + " − " + nice(qsC) + " = " + nice(qdC - qsC) + " unit",
                "Yang terbeli = Qs = " + nice(qsC) + " — sisanya antre / pasar gelap"
              ],
              result: "Pb = " + nice(pc) + " · Ps = " + nice(psC) + " · Q = " + nice(Qt),
              why: "Ceiling membatasi harga yang dibayar pembeli, jadi Pb dikunci di Pmax dan penjual tinggal menerima Ps = (Pb − w)/m. Karena harga dipaksa murah, permintaan melonjak sementara penawaran menyusut → kelangkaan; barang yang benar-benar tersedia dibatasi penawaran (Qs)."
            });
          }
        }
      }

      if (onKuota) {
        if (!(Qbar < Qt - 1e-9)) {
          steps.push({
            label: "Uji kuota produksi",
            lines: [
              "Q̄ = " + nice(Qbar) + " versus kuantitas yang berlaku = " + nice(Qt),
              "Q̄ ≥ Q → TIDAK mengikat"
            ],
            why: "Kuota hanya mengubah pasar bila lebih kecil daripada kuantitas yang memang terjadi; kalau di atas itu, produsen tetap bebas berproduksi seperti semula."
          });
          notes.push("Kuota di atas kuantitas yang berlaku tidak mengikat apa pun.");
        } else {
          var pq = Qbar;
          if (pq >= a) throw "Kuota Q̄ = " + nice(pq) + " terlalu besar: harga pembeli dari kurva permintaan menjadi nol atau negatif. Kuota harus lebih kecil dari intersep permintaan a = " + nice(a) + ".";
          var pbQ = (a - pq) / b;
          var psMC = (pq - c) / d;
          if (!(psMC >= 0)) throw "Kuota Q̄ = " + nice(pq) + " terlalu kecil untuk kurva penawaran ini: harga di sisi penjual menjadi negatif. Naikkan kuota atau periksa intersep c.";
          var psNet = (pbQ - w) / m;
          if (hasFiscal && !(psNet >= 0)) throw "Kuota dan pajak/subsidi ini menghasilkan harga bersih penjual yang negatif. Periksa kembali besarannya.";
          var linesQ = [
            "Kuantitas dikunci Q = Q̄ = " + nice(pq),
            "Pb dari kurva permintaan: Pb = (a − Q̄)/b = (" + nice(a) + " − " + nice(pq) + ") / " + nice(b) + " = " + nice(pbQ),
            "Ps (biaya marjinal di Q̄) = (Q̄ − c)/d = (" + nice(pq) + " − (" + nice(c) + ")) / " + nice(d) + " = " + nice(psMC)
          ];
          if (hasFiscal) {
            linesQ.push("Ps setelah belah ketupat = (Pb − w)/m = (" + nice(pbQ) + " − (" + nice(w) + ")) / " + nice(m) + " = " + nice(psNet));
          }
          linesQ.push("Rent (selisih harga di kuota) = Pb − Ps = " + nice(pbQ) + " − " + nice(psMC) + " = " + nice(pbQ - psMC));
          if (floorBind && psNet < Pmin) {
            linesQ.push("Catatan: kantong produsen (" + nice(psNet) + ") di bawah floor " + nice(Pmin) + " → perlu jaminan tambahan, rent naik jadi " + nice(pbQ - Pmin));
          }
          if (excessType === "supply" && excess > 0) {
            notes.push("Karena produksi dipaksa berhenti di Q̄, kelebihan penawaran dari tahap floor tidak lagi terjadi.");
            excess = 0; excessType = ""; govCost = 0;
          }
          Qt = pq; Qprod = pq; Pb = pbQ; Ps = psMC; kuotaBind = true;
          wedge = Pb - Ps; rev = hasFiscal ? (pbQ - psNet) * pq : 0;
          steps.push({
            label: "Kuota mengikat: kunci kuantitas di Q̄",
            lines: linesQ,
            result: "Pb = " + nice(pbQ) + " · Ps = " + nice(psMC) + " · Q = " + nice(pq),
            why: "Kuota memaksa kuantitas pasar berhenti di Q̄. Harga pembeli dibaca dari kurva permintaan pada Q̄ (seberapa besar pembeli masih bersedia bayar), harga penjual dari biaya marjinal di titik itu. Selisihnya adalah 'rent' — keuntungan bagi pemegang izin kuota; produsen perlu insentif agar mau patuh mengurangi produksi."
          });
        }
      }

      /* surplus & dwl pada kuantitas yang benar-benar terjadi */
      if (!(Qt >= 0) || !(Qprod >= 0) || !(Pb >= 0) || !(Ps >= 0)) {
        throw "Kombinasi kebijakan ini menghasilkan harga atau kuantitas negatif. Periksa kembali besarannya.";
      }
      var Qcs = Math.max(Math.min(Qt, a - b * Pb), 0);    /* konsumen beli Qd(Pb), bukan total produksi */
      var Qps = Qprod;                                /* produksi = kuantitas yang dipasok */
      function csv(Q) { return Q <= 0 ? 0 : (a * Q - (Q * Q) / 2) / b - Pb * Q; }
      function psv(Q) { return Q <= 0 ? 0 : Ps * Q - ((Q * Q) / 2 - c * Q) / d; }
      var CS = csv(Qcs), PS = psv(Qps);
      var DWL = 0;
      if (Qt < Qe && Pb >= Ps) {
        var pdQ = (a - Qt) / b, psQd = (Qt - c) / d;
        DWL = 0.5 * (pdQ - psQd) * (Qe - Qt);
        if (DWL < 0) DWL = 0;
      }

      steps.push({
        label: "Surplus ekonomi pada kuantitas yang terjadi",
        lines: [
          "CS = ∫₀^Q [Pd(q) − Pb] dq = (a×Q − Q²/2)/b − Pb×Q = " + nice(CS),
          "PS = ∫₀^Q [Ps − Ps(q)] dq = Ps×Q − (Q²/2 − c×Q)/d = " + nice(PS),
          "Total surplus = CS + PS = " + nice(CS + PS) +
            (DWL > 0 ? "   —   berkurang " + nice(DWL) + " (deadweight loss)" : "")
        ],
        result: "CS = " + nice(CS) + " · PS = " + nice(PS) + (DWL > 0 ? " · DWL = " + nice(DWL) : ""),
        why: "Surplus konsumen adalah luas di bawah kurva permintaan dan di atas harga bayar Pb; surplus produsen luas di atas kurva penawaran dan di bawah harga terima Ps — keduanya dihitung lewat integral pada kuantitas yang benar-benar terjadi. Karena kuantitas berkurang dari Q*, ada luas segitiga yang tidak sempat menjadi surplus siapa pun: itulah deadweight loss, tanda kebijakan menimbulkan inefficiency."
      });

      /* status: ringkasan bahasa manusia */
      var status;
      if (policies.length === 0) {
        status = "Pasar berada di keseimbangan: tidak ada kekuatan yang menekan harga naik atau turun.";
      } else if (!hasFiscal && !floorBind && !ceilBind && !kuotaBind) {
        status = "Kebijakan " + policies.join(" + ") + " sudah diuji tetapi TIDAK mengikat — pasar tetap di keseimbangan murni (" +
          nice(Pe) + " / " + nice(Qe) + "). Lihat langkah uji di atas.";
      } else {
        status = "Kebijakan aktif: " + policies.join(" + ") + ". Pembeli bayar " + nice(Pb) +
          ", penjual terima " + nice(Ps) + ", kuantitas pasar " + nice(Qt) +
          " (tanpa kebijakan: " + nice(Pe) + " / " + nice(Qe) + ").";
        if (excess > 0 && excessType === "supply") {
          status += " Kelebihan penawaran " + nice(excess) + " unit" +
            (govCost > 0 ? " diserap pemerintah dengan biaya " + nice(govCost) + "." : " menumpuk / tidak terjual.");
        }
        if (excess > 0 && excessType === "demand") {
          status += " Kelangkaan " + nice(excess) + " unit — permintaan tidak terlayani.";
        }
      }

      var results = [
        { label: "Harga keseimbangan P*", value: nice(Pe), hero: true },
        { label: "Kuantitas keseimbangan Q*", value: nice(Qe), hero: true },
        { label: "Harga dibayar pembeli (Pb)", value: nice(Pb), sub: policies.length ? "" : "sama dengan P*" },
        { label: "Harga diterima penjual (Ps)", value: nice(Ps), sub: policies.length ? "" : "sama dengan P*" },
        { label: "Kuantitas setelah kebijakan", value: nice(Qt) },
        { label: "Selisih harga (Pb − Ps)", value: nice(wedge), sub: hasFiscal ? "= belah ketupat (pajak − subsidi)" : onKuota ? "= rent kuota" : "" },
        { label: "Surplus konsumen", value: nice(CS) },
        { label: "Surplus produsen", value: nice(PS) },
        { label: "Total surplus", value: nice(CS + PS) },
        { label: "Deadweight loss", value: nice(DWL), sub: DWL > 0 ? "kesejahteraan yang hilang" : "—" }
      ];
      if (excess > 0 && excessType === "supply") results.push({ label: "Kelebihan penawaran", value: nice(excess), sub: "excess supply" });
      if (excess > 0 && excessType === "demand") results.push({ label: "Kelangkaan", value: nice(excess), sub: "excess demand" });
      if (govCost > 0) {
        results.push({ label: "Biaya pembelian pemerintah", value: nice(govCost), sub: "menyerap kelebihan penawaran" });
        /* Pembelian pemerintah adalah biaya anggaran, bukan surplus yang dinikmati
           rumah tangga. Tampilkan angka bersihnya agar tidak terbaca sebagai laba. */
        var netWelfare = CS + PS + rev - govCost;
        results.push({
          label: "Surplus bersih setelah pembelian pemerintah",
          value: nice(netWelfare),
          sub: "CS + PS" + (rev > 0 ? " + penerimaan pemerintah" : rev < 0 ? " − biaya subsidi" : "") + " − biaya pembelian"
        });
        notes.push("Total surplus di atas adalah CS + PS. Karena pemerintah membeli kelebihan penawaran, biaya pembelian " +
          nice(govCost) + " harus dikurangkan untuk melihat surplus bersih; angka bersihnya ditampilkan terpisah. " +
          "DWL pada kartu ini mengukur kuantitas yang lebih kecil dari Q*; kelebihan produksi pada pembelian pemerintah belum dimasukkan ke DWL.");
      }
      if (rev > 0) results.push({ label: "Penerimaan pemerintah", value: nice(rev), sub: "(Pb − Ps) × Q" });
      else if (rev < 0) results.push({ label: "Biaya subsidi", value: nice(-rev), sub: "(Pb − Ps) × Q" });

      /* ---------- grafik: kurva memakai persamaan & angka yang sama dengan langkah ----------
         Gaya gambar mengikuti catatan kuliah: sumbu 0 tampak, kurva diteruskan ke
         daerah negatif supaya intersep Qd/Qs terbaca, dan setiap kebijakan aktif
         menambah garisnya sendiri. */
      var yMax = Math.max(choke, Pe, Pb, Ps,
        onFloor ? (Pmin || 0) : 0, onCeil ? (Pmax || 0) : 0, 1) * 1.12;
      var yMin = -0.08 * yMax;
      var xMax = Math.max(a, c + d * yMax, Qe * 1.06, Qt * 1.10, Qprod * 1.10,
        onKuota && kuotaBind ? Qbar * 1.06 : 0, 1) * 1.04;
      var xMin = Math.min(0, c + d * yMin);
      var xPad = (xMax - xMin) * 0.03;
      xMin -= xPad;
      xMax += xPad;

      var series = [
        { label: "Qd = " + nice(a) + " − " + nice(b) + "P", color: "demand",
          pts: [[a - b * yMin, yMin], [0, choke]] },
        { label: "Qs = " + nice(c) + " + " + nice(d) + "P", color: "supply",
          pts: [[c + d * yMin, yMin], [c + d * yMax, yMax]] }
      ];
      if (hasFiscal) {
        series.push({
          label: "Qs′ = penawaran efektif" + (onPersen ? " (pajak " + nice(kpersen) + "%)" : onSub ? " (subsidi)" : " (pajak)"),
          color: "supply", dash: true,
          pts: [[c + d * (yMin - w) / m, yMin], [c + d * (yMax - w) / m, yMax]]
        });
      }

      /* garis bantu tambahan: selisih harga, kelebihan/kelangkaan, rent kuota */
      if (Math.abs(Pb - Ps) > 1e-9 && (hasFiscal || kuotaBind)) {
        series.push({
          label: hasFiscal ? "Selisih harga (Pb − Ps)" : "Rent kuota",
          color: "amber", width: 2.6,
          pts: [[Qt, Ps], [Qt, Pb]]
        });
      }
      if (floorBind && !ceilBind && !kuotaBind) {
        var qdFl = Math.max(0, a - b * (m * Pmin + w)), qsFl = Math.max(0, c + d * Pmin);
        if (Math.abs(qsFl - qdFl) > 1e-9) {
          series.push({
            label: qsFl > qdFl ? "Kelebihan penawaran" : "Kelangkaan",
            color: "amber", width: 2.6,
            pts: [[Math.min(qdFl, qsFl), Pmin], [Math.max(qdFl, qsFl), Pmin]]
          });
        }
      }
      if (ceilBind && !floorBind && !kuotaBind) {
        var qdCe = Math.max(0, a - b * Pmax), qsCe = Math.max(0, c + d * ((Pmax - w) / m));
        if (Math.abs(qdCe - qsCe) > 1e-9) {
          series.push({
            label: qdCe > qsCe ? "Kelangkaan" : "Kelebihan penawaran",
            color: "amber", width: 2.6,
            pts: [[Math.min(qdCe, qsCe), Pmax], [Math.max(qdCe, qsCe), Pmax]]
          });
        }
      }

      var regions = [];
      if (v.surplus) {
        regions.push({ pts: [[0, choke], [Qcs, Pb], [0, Pb]], color: "demand", opacity: 0.16, label: "CS" });
        var psPts = Ps0 >= 0
          ? [[0, Ps], [Qps, Ps], [Qps, (Qps - c) / d], [0, Ps0]]
          : [[0, Ps], [Qps, Ps], [Qps, (Qps - c) / d], [c, 0], [0, 0]];
        regions.push({ pts: psPts, color: "supply", opacity: 0.16, label: "PS" });
      }
      /* penerimaan pajak / biaya subsidi / rent kuota: persegi antara Pb dan Ps */
      if (Qt > 0 && Math.abs(Pb - Ps) > 1e-9 && (hasFiscal || kuotaBind)) {
        regions.push({ pts: [[0, Ps], [Qt, Ps], [Qt, Pb], [0, Pb]], color: "amber", opacity: 0.12 });
      }
      if (DWL > 0) {
        regions.push({
          pts: [[Qt, (a - Qt) / b], [Qe, Pe], [Qt, (Qt - c) / d]],
          color: "amber", opacity: 0.34, label: "DWL"
        });
      }

      var hlines = [], vlines = [], points = [];
      function addH(y, label, color, dash) {
        var dup = hlines.some(function (hL) { return Math.abs(hL.y - y) < 1e-9; });
        if (!dup) hlines.push({ y: y, label: label, color: color, dash: dash });
      }
      function addV(x, label, color, dash) {
        var dup = vlines.some(function (vL) { return Math.abs(vL.x - x) < 1e-9; });
        if (!dup) vlines.push({ x: x, label: label, color: color, dash: dash });
      }
      if (Math.abs(Pb - Ps) > 1e-9 && (hasFiscal || kuotaBind)) {
        addH(Pb, "Pb = " + nice(Pb), "blue");
        addH(Ps, "Ps = " + nice(Ps), "blue", true);
      }
      if (policies.length && (Math.abs(Pb - Pe) > 1e-9 || Math.abs(Ps - Pe) > 1e-9)) {
        addH(Pe, "P* = " + nice(Pe), "muted", true);
      }
      if (policies.length && Math.abs(Qt - Qe) > 1e-9) {
        addV(Qe, "Q* = " + nice(Qe), "muted", true);
        addV(Qt, "Q′ = " + nice(Qt), "blue");
      }
      if (onFloor) {
        addH(Pmin, "floor = " + nice(Pmin), "blue");
        if (floorBind && !ceilBind && !kuotaBind) {
          var qdFv = a - b * (m * Pmin + w), qsFv = c + d * Pmin;
          if (qdFv >= 0 && qdFv <= xMax) addV(qdFv, "Qd = " + nice(qdFv), "demand");
          if (qsFv >= 0 && qsFv <= xMax) addV(qsFv, "Qs = " + nice(qsFv), "supply");
        }
      }
      if (onCeil) {
        addH(Pmax, "ceiling = " + nice(Pmax), "blue");
        if (ceilBind && !floorBind && !kuotaBind) {
          var qdCv = a - b * Pmax, qsCv = c + d * ((Pmax - w) / m);
          if (qdCv >= 0 && qdCv <= xMax) addV(qdCv, "Qd = " + nice(qdCv), "demand");
          if (qsCv >= 0 && qsCv <= xMax) addV(qsCv, "Qs = " + nice(qsCv), "supply");
        }
      }
      if (onKuota && kuotaBind) addV(Qbar, "kuota = " + nice(Qbar), "blue");

      points.push({ x: Qe, y: Pe, color: "ink", label: "E (" + nice(Qe) + "; " + nice(Pe) + ")" });
      if (Math.abs(Qt - Qe) > 1e-9 && isFinite(Qt)) {
        points.push({ x: Qt, y: Pb, color: "blue", label: "E′ (" + nice(Qt) + "; " + nice(Pb) + ")" });
      }

      var floorGap = floorBind && !ceilBind && !kuotaBind;
      var ceilGap = ceilBind && !floorBind && !kuotaBind;
      var floorNote = !onFloor ? "" :
        floorGap ? "; floor mengikat: garis amber = kelebihan penawaran" :
        kuotaBind ? "; floor aktif, tetapi kuantitas akhir dikunci kuota" :
        floorBind ? "; floor dan ceiling sama-sama mengikat (konflik harga)" :
        "; floor di bawah Ps → tidak mengikat";
      var ceilNote = !onCeil ? "" :
        ceilGap ? "; ceiling mengikat: garis amber = kelangkaan" :
        kuotaBind ? "; ceiling aktif, tetapi kuantitas akhir dikunci kuota" :
        ceilBind ? "; floor dan ceiling sama-sama mengikat (konflik harga)" :
        "; ceiling di atas Pb → tidak mengikat";
      var subChart = "Sumbu 0 ditampilkan dan garis kurva diteruskan ke daerah negatif agar intersep Qd/Qs terbaca — E = keseimbangan murni, E′ = titik setelah kebijakan" +
        (hasFiscal ? "; garis putus-putus Qs′ = penawaran efektif setelah pajak/subsidi" : "") +
        floorNote + ceilNote +
        (onKuota && kuotaBind ? "; garis tegak kuota = Q̄, selisih Pb − Ps = rent" : "") + ".";
      var charts = [{
        title: "Keseimbangan pasar" + (policies.length ? " — " + policies.join(" + ") : ""),
        sub: subChart,
        xLabel: "Kuantitas (Q)", yLabel: "Harga (P)",
        xDomain: [xMin, xMax], yDomain: [yMin, yMax],
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
        if (!(a > 0)) throw "Intersep permintaan (a) harus lebih besar dari 0.";
        if (!(b > 0)) throw "Kemiringan b harus lebih besar dari 0.";
        if (!(P > 0)) throw "Harga yang diuji (P) harus lebih besar dari 0.";
        var Q = a - b * P;
        if (Q <= 0) throw "Pada harga " + nice(P) + " kuantitas = " + nice(Q) +
          " (tidak masuk akal). Pakai harga di bawah " + nice(a / b) + ".";
        var dQdP = -b;
        var E = (dQdP) * (P / Q);
        steps.push({
          label: "Fungsi permintaan dan turunannya",
          lines: [
            "Qd = " + nice(a) + " − " + nice(b) + "P",
            "∂Q/∂P = −" + nice(b),
            "Pada P = " + nice(P) + " : Q = " + nice(a) + " − " + nice(b) + "(" + nice(P) + ") = " + nice(Q)
          ],
          why: "Langkah ini menyiapkan dua bahan untuk rumus elastisitas: fungsi permintaan dan turunannya terhadap harga. Karena bentuknya linear, turunan ∂Q/∂P selalu sama dengan −b, yaitu −" + nice(b) + ", bukan angka hitungan baru. Nilai Q didapat dengan memasukkan harga uji P = " + nice(P) + " ke fungsi permintaan yang kamu isi di kolom a, b, dan P."
        });
        steps.push({
          label: "Rumus elastisitas titik",
          lines: [
            "Ep = (∂Q/∂P) × (P/Q)",
            "Ep = (−" + nice(b) + ") × (" + nice(P) + " / " + nice(Q) + ")",
            "Ep = " + nice(E),
            "|Ep| = " + nice(Math.abs(E))
          ],
          result: "Ep = " + nice(E) + " · |Ep| = " + nice(Math.abs(E)),
          why: "Elastisitas titik mengukur berapa persen kuantitas berubah bila harga berubah satu persen pada titik itu. Caranya, kemiringan ∂Q/∂P dikalikan rasio P/Q di titik uji, sehingga hasilnya tidak bergantung pada satuan harga maupun kuantitas. Angka P dan Q di sini persis angka yang dihitung pada langkah sebelumnya."
        });
        steps.push({
          label: "Interpretasi",
          lines: [
            Math.abs(E) > 1 ? "|Ep| &gt; 1 → permintaan elastis"
              : Math.abs(E) < 1 ? "|Ep| &lt; 1 → permintaan inelastis"
                : "|Ep| = 1 → permintaan elastis unitary",
            "Jika harga naik 1%, kuantitas permintaan berubah sekitar " + nice(E) + "% (bergerak berlawanan arah).",
            "TR = P × Q pada titik uji = " + nice(P) + " × " + nice(Q) + " = " + nice(P * Q)
          ],
          why: "Langkah terakhir menerjemahkan angka Ep menjadi sifat permintaan: di atas 1 elastis, di bawah 1 inelastis, tepat 1 unitary. Arah negatif muncul karena harga dan kuantitas bergerak berlawanan. TR dihitung sebagai pembanding agar kamu bisa melihat apakah menaikkan harga menambah atau justru mengurangi penerimaan."
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
          sub: "Kurva Qd = " + nice(a) + " − " + nice(b) + "P dengan titik uji pada P = " + nice(P) + "; garis bantu tegak dan datar menunjukkan Q dan P yang menjadi penyebut dan pembilang pada rumus Ep = (∂Q/∂P)(P/Q).",
          xLabel: "Kuantitas (Q)", yLabel: "Harga (P)",
          series: [{ label: "Qd = " + nice(a) + " − " + nice(b) + "P", color: "demand", pts: [[0, a / b], [a, 0]] }],
          points: [{ x: Q, y: P, color: "ink", label: "E = " + nice(E) }],
          vlines: [{ x: Q, color: "muted" }],
          hlines: [{ y: P, color: "muted" }]
        }];
      } else if (sub === "busur") {
        var p1 = v.bp1, q1 = v.bq1, p2 = v.bp2, q2 = v.bq2;
        if (!ok(p1, q1, p2, q2)) throw "Isi kedua titik pengamatan (harga & kuantitas).";
        if (!(p1 > 0) || !(p2 > 0) || !(q1 > 0) || !(q2 > 0)) {
          throw "Harga dan kuantitas pada kedua pengamatan harus lebih besar dari 0.";
        }
        if (Math.abs(p2 - p1) < 1e-12) throw "Harga awal dan akhir harus berbeda; jika tidak, %ΔP = 0 dan elastisitas tidak terdefinisi.";
        var dP = pctChange(p1, p2), dQ = pctChange(q1, q2);
        var Eb = dQ / dP;
        steps.push({
          label: "Perubahan relatif (midpoint)",
          lines: [
            "%ΔQ = (Q₂ − Q₁) / [(Q₁ + Q₂)/2]",
            "%ΔQ = (" + nice(q2) + " − " + nice(q1) + ") / " + nice((q1 + q2) / 2) + " = " + nice(dQ) + " %",
            "%ΔP = (P₂ − P₁) / [(P₁ + P₂)/2]",
            "%ΔP = (" + nice(p2) + " − " + nice(p1) + ") / " + nice((p1 + p2) / 2) + " = " + nice(dP) + " %"
          ],
          why: "Elastisitas busur dipakai saat kamu hanya punya dua pengamatan, bukan satu fungsi. Perubahan kuantitas dan harga dibagi rata-rata kedua titik (metode midpoint) supaya hasilnya sama baik dihitung dari titik awal ke titik akhir maupun sebaliknya. Angka Q₁, Q₂, P₁, P₂ berasal dari empat kolom pengamatan yang kamu isi."
        });
        steps.push({
          label: "Rumus busur",
          lines: [
            "Ep = %ΔQ / %ΔP",
            "Ep = " + nice(dQ) + " / " + nice(dP) + " = " + nice(Eb),
            "|Ep| = " + nice(Math.abs(Eb))
          ],
          result: "Ep = " + nice(Eb) + " · |Ep| = " + nice(Math.abs(Eb)),
          why: "Setelah kedua perubahan relatif diketahui, elastisitas busur hanyalah pembagiannya. Hasil ini menggambarkan rata-rata sepanjang rentang antara kedua titik, bukan elastisitas di satu titik tertentu. Tanda negatif menunjukkan hubungan harga dan kuantitas yang berlawanan seperti biasa."
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
        var sameQ = Math.abs(q2 - q1) < 1e-12;
        var slope = sameQ ? NaN : (p2 - p1) / (q2 - q1);
        var linP = sameQ ? null : function (Q) { return p1 + slope * (Q - q1); };
        var qmin = Math.min(q1, q2) * 0.85, qmax = Math.max(q1, q2) * 1.15;
        var busurSeries = sameQ
          ? { label: "Q = " + nice(q1) + " (kuantitas tetap)", color: "demand", pts: [[q1, p1], [q2, p2]] }
          : { label: "P = " + (linP(0) < 0 ? "−" + nice(-linP(0)) : nice(linP(0))) + (slope < 0 ? " − " + nice(-slope) : " + " + nice(slope)) + "Q", color: "demand", fn: linP, xRange: [qmin, qmax] };
        charts = [{
          title: "Elastisitas busur antara dua titik",
          sub: "Garis penghubung kedua pengamatan menjadi penaksiran kurva permintaan; elastisitas busur dihitung dari perubahan relatif, sehingga nilainya mewakili seluruh rentang antara titik 1 dan titik 2, bukan kemiringan garisnya.",
          xLabel: "Kuantitas (Q)", yLabel: "Harga (P)",
          xDomain: [qmin, qmax],
          series: [busurSeries],
          points: [
            { x: q1, y: p1, color: "ink", label: "1 (" + nice(q1) + "; " + nice(p1) + ")" },
            { x: q2, y: p2, color: "blue", label: "2 (" + nice(q2) + "; " + nice(p2) + ")", dy: 14 }
          ]
        }];
      } else if (sub === "silang") {
        var cq1 = v.cx_q1, cq2 = v.cx_q2, cp1 = v.cx_p1, cp2 = v.cx_p2;
        if (!ok(cq1, cq2, cp1, cp2)) throw "Isi kuantitas X dan harga Y untuk kedua pengamatan.";
        if (!(cq1 > 0) || !(cq2 > 0) || !(cp1 > 0) || !(cp2 > 0)) {
          throw "Kuantitas X dan harga Y pada kedua pengamatan harus lebih besar dari 0.";
        }
        if (Math.abs(cp2 - cp1) < 1e-12) throw "Harga Y awal dan akhir harus berbeda; jika tidak, %ΔPy = 0 dan elastisitas silang tidak terdefinisi.";
        var dqx = pctChange(cq1, cq2), dpy = pctChange(cp1, cp2);
        var Exy = dqx / dpy;
        steps.push({
          label: "Perubahan relatif",
          lines: [
            "%ΔQx = (" + nice(cq2) + " − " + nice(cq1) + ") / " + nice((cq1 + cq2) / 2) + " = " + nice(dqx) + " %",
            "%ΔPy = (" + nice(cp2) + " − " + nice(cp1) + ") / " + nice((cp1 + cp2) / 2) + " = " + nice(dpy) + " %"
          ],
          why: "Langkah ini mengubah selisih kuantitas X dan harga Y menjadi persen terhadap nilai rata-ratanya, sama seperti metode midpoint pada elastisitas busur. Tujuannya agar kedua perubahan bisa dibandingkan meski satuannya berbeda. Angka-angka berasal dari kolom Qx dan Py untuk pengamatan awal dan akhir."
        });
        steps.push({
          label: "Rumus elastisitas silang",
          lines: [
            "Exy = %ΔQx / %ΔPy",
            "Exy = " + nice(dqx) + " / " + nice(dpy) + " = " + nice(Exy)
          ],
          result: "Exy = " + nice(Exy),
          why: "Elastisitas silang membandingkan perubahan jumlah barang X dengan perubahan harga barang Y. Tandanya yang paling penting: positif berarti kedua barang saling menggantikan, negatif berarti saling melengkapi. Besarnya angka menunjukkan seberapa kuat hubungan itu."
        });
        var jenis = Exy > 0 ? "substitusi (Exy &gt; 0)" : Exy < 0 ? "komplementer (Exy &lt; 0)" : "tidak berhubungan (Exy = 0)";
        status = "X dan Y adalah barang " + jenis + ". " +
          (Exy > 0
            ? "Naiknya harga Y membuat konsumen pindah ke X."
            : Exy < 0
              ? "Naiknya harga Y menurunkan konsumsi X karena keduanya dipakai bersama."
              : "Perubahan harga Y tidak mengubah konsumsi X secara sistematis.");
        results = [
          { label: "Elastisitas silang Exy", value: nice(Exy), hero: true },
          { label: "Hubungan barang", value: jenis },
          { label: "%Δ Qx", value: nice(dqx) + " %" },
          { label: "%Δ Py", value: nice(dpy) + " %" }
        ];
        var slX = (cq2 - cq1) / (cp2 - cp1);
        var icX = cq1 - slX * cp1;
        charts = [{
          title: "Hubungan Qx terhadap harga Py",
          sub: "Dua pengamatan Qx pada dua tingkat harga Y; garis miring ke atas berarti kedua barang substitusi (Exy positif), miring ke bawah berarti komplementer (Exy negatif).",
          xLabel: "Harga barang Y (Py)", yLabel: "Kuantitas X (Qx)",
          series: [{
            label: isFinite(slX)
              ? "Qx = " + (icX < 0 ? "−" + nice(-icX) : nice(icX)) + (slX < 0 ? " − " + nice(-slX) : " + " + nice(slX)) + "Py"
              : "Qx = " + nice(cq1) + " (Py tetap)",
            color: "blue", pts: [[cp1, cq1], [cp2, cq2]]
          }],
          points: [
            { x: cp1, y: cq1, color: "ink", label: "1" },
            { x: cp2, y: cq2, color: "blue", label: "2", dy: 14 }
          ]
        }];
      } else if (sub === "pendapatan") {
        var iq1 = v.in_q1, iq2 = v.in_q2, ii1 = v.in_i1, ii2 = v.in_i2;
        if (!ok(iq1, iq2, ii1, ii2)) throw "Isi permintaan dan pendapatan untuk kedua pengamatan.";
        if (!(iq1 > 0) || !(iq2 > 0) || !(ii1 > 0) || !(ii2 > 0)) {
          throw "Kuantitas dan pendapatan pada kedua pengamatan harus lebih besar dari 0.";
        }
        if (Math.abs(ii2 - ii1) < 1e-12) throw "Pendapatan awal dan akhir harus berbeda; jika tidak, %ΔI = 0 dan elastisitas pendapatan tidak terdefinisi.";
        var dqi = pctChange(iq1, iq2), di = pctChange(ii1, ii2);
        var Ei = dqi / di;
        steps.push({
          label: "Perubahan relatif",
          lines: [
            "%ΔQ = (" + nice(iq2) + " − " + nice(iq1) + ") / " + nice((iq1 + iq2) / 2) + " = " + nice(dqi) + " %",
            "%ΔI = (" + nice(ii2) + " − " + nice(ii1) + ") / " + nice((ii1 + ii2) / 2) + " = " + nice(di) + " %"
          ],
          why: "Langkah ini mengubah selisih permintaan dan pendapatan menjadi persen terhadap nilai rata-ratanya. Cara midpoint dipakai agar hasilnya tidak bergantung pada titik mana yang dianggap awal. Angka Q₁, Q₂, I₁, I₂ berasal dari kolom pengamatan yang kamu isi."
        });
        steps.push({
          label: "Rumus elastisitas pendapatan",
          lines: [
            "EI = %ΔQ / %ΔI",
            "EI = " + nice(dqi) + " / " + nice(di) + " = " + nice(Ei)
          ],
          result: "EI = " + nice(Ei),
          why: "Elastisitas pendapatan membandingkan perubahan jumlah yang diminta dengan perubahan pendapatan. Tandanya menentukan jenis barang: negatif berarti inferior, positif berarti normal, dan di atas 1 berarti mewah. Angka persen yang dibagi di sini adalah hasil langkah sebelumnya."
        });
        var kategori = Ei < 0
          ? "barang inferior (EI &lt; 0)"
          : Math.abs(Ei - 1) < 1e-12
            ? "barang normal dengan elastisitas unitary (EI = 1)"
            : Ei < 1
              ? "barang normal pokok (0 &lt; EI &lt; 1)"
              : "barang normal mewah / luxury (EI &gt; 1)";
        status = "Barang tersebut tergolong " + kategori + ".";
        results = [
          { label: "Elastisitas pendapatan EI", value: nice(Ei), hero: true },
          { label: "Kategori barang", value: kategori },
          { label: "%Δ Q", value: nice(dqi) + " %" },
          { label: "%Δ I", value: nice(di) + " %" }
        ];
        var slI = (iq2 - iq1) / (ii2 - ii1);
        var icI = iq1 - slI * ii1;
        charts = [{
          title: "Kurva Engel: Q terhadap pendapatan",
          sub: "Kurva Engel menghubungkan pendapatan dengan jumlah yang diminta; garis miring ke atas menandakan barang normal, sedangkan garis menurun menandakan barang inferior. Elastisitas pendapatan dihitung dari perubahan relatif kedua titik pada garis ini.",
          xLabel: "Pendapatan (I)", yLabel: "Kuantitas (Q)",
          series: [{
            label: isFinite(slI)
              ? "Q = " + (icI < 0 ? "−" + nice(-icI) : nice(icI)) + (slI < 0 ? " − " + fmt(-slI, 8) : " + " + fmt(slI, 8)) + "I"
              : "Q = " + nice(iq1) + " (I tetap)",
            color: "supply", pts: [[ii1, iq1], [ii2, iq2]]
          }],
          points: [
            { x: ii1, y: iq1, color: "ink", label: "1" },
            { x: ii2, y: iq2, color: "supply", label: "2", dy: 14 }
          ]
        }];
      } else {
        var sq1 = v.sp_q1, sq2 = v.sp_q2, sp1 = v.sp_p1, sp2 = v.sp_p2;
        if (!ok(sq1, sq2, sp1, sp2)) throw "Isi kuantitas penawaran dan harga untuk kedua pengamatan.";
        if (!(sq1 > 0) || !(sq2 > 0) || !(sp1 > 0) || !(sp2 > 0)) {
          throw "Kuantitas penawaran dan harga pada kedua pengamatan harus lebih besar dari 0.";
        }
        if (Math.abs(sp2 - sp1) < 1e-12) throw "Harga awal dan akhir harus berbeda; jika tidak, %ΔP = 0 dan elastisitas penawaran tidak terdefinisi.";
        var dqs = pctChange(sq1, sq2), dps = pctChange(sp1, sp2);
        var Es = dqs / dps;
        steps.push({
          label: "Perubahan relatif",
          lines: [
            "%ΔQs = (" + nice(sq2) + " − " + nice(sq1) + ") / " + nice((sq1 + sq2) / 2) + " = " + nice(dqs) + " %",
            "%ΔP = (" + nice(sp2) + " − " + nice(sp1) + ") / " + nice((sp1 + sp2) / 2) + " = " + nice(dps) + " %"
          ],
          why: "Langkah ini menghitung perubahan relatif kuantitas penawaran dan harga dengan metode midpoint. Kedua angka harus dalam persen agar bisa dibandingkan. Nilainya berasal dari kolom Qs dan harga untuk pengamatan awal dan akhir yang kamu isi."
        });
        steps.push({
          label: "Rumus elastisitas penawaran",
          lines: [
            "Es = %ΔQs / %ΔP",
            "Es = " + nice(dqs) + " / " + nice(dps) + " = " + nice(Es)
          ],
          result: "Es = " + nice(Es),
          why: "Elastisitas penawaran membandingkan perubahan jumlah yang ditawarkan dengan perubahan harga. Hasilnya positif karena harga dan kuantitas penawaran bergerak searah. Angka yang dibagi adalah persentase dari langkah sebelumnya."
        });
        status = "Penawaran " + (Math.abs(Es) > 1 ? "elastis (Es &gt; 1)" : Math.abs(Es) < 1 ? "inelastis (Es &lt; 1)" : "elastis unitary (Es = 1)") +
          ". Bernotasi positif karena harga dan kuantitas penawaran bergerak searah.";
        results = [
          { label: "Elastisitas penawaran Es", value: nice(Es), hero: true },
          { label: "Klasifikasi", value: Math.abs(Es) > 1 ? "elastis" : Math.abs(Es) < 1 ? "inelastis" : "unitary" },
          { label: "%Δ Qs", value: nice(dqs) + " %" },
          { label: "%Δ P", value: nice(dps) + " %" }
        ];
        var slS = (sp2 - sp1) / (sq2 - sq1);
        var icS = sp1 - slS * sq1;
        charts = [{
          title: "Kurva penawaran antara dua titik",
          sub: "Garis penawaran melalui dua pengamatan harga dan kuantitas; arahnya naik karena hukum penawaran, dan elastisitasnya dihitung dari perubahan relatif kedua titik, bukan dari kemiringan garis.",
          xLabel: "Kuantitas (Qs)", yLabel: "Harga (P)",
          series: [{
            label: Math.abs(sq2 - sq1) < 1e-12
              ? "Qs = " + nice(sq1) + " (kuantitas tetap)"
              : "P = " + (icS < 0 ? "−" + nice(-icS) : nice(icS)) + (slS < 0 ? " − " + fmt(-slS, 6) : " + " + fmt(slS, 6)) + "Qs",
            color: "supply", pts: [[sq1, sp1], [sq2, sp2]]
          }],
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
      if (!(a > 0)) throw "Intersep permintaan (a) harus lebih besar dari 0.";
      if (!(b > 0) || !(d > 0)) throw "Koefisien b dan d harus lebih besar dari 0.";

      var eqPos = cekKeseimbanganPositif(a, b, c, d);
      var Pe = eqPos.Pe, Qe = eqPos.Qe;
      var P = v.Pmode === "custom" ? v.Pcustom : Pe;
      if (!ok(P)) throw "Isi harga yang ingin diuji.";
      if (!(P > 0)) throw "Harga harus lebih besar dari 0.";

      var QdRaw = a - b * P, QsRaw = c + d * P;
      var Qd = Math.max(0, QdRaw), Qs = Math.max(0, QsRaw);
      var Qt = Math.min(Qd, Qs);
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
            "Harga puncak permintaan (Pd = 0) = " + nice(a / b),
            "Harga minimum penawaran (Qs = 0) = " + nice(-c / d)
          ],
          why: "Langkah ini mencari keseimbangan murni sebagai pembanding dengan menyamakan Qd dan Qs. Angka a, b, c, d berasal dari kolom input. Harga puncak permintaan a/b dan harga minimum penawaran −c/d adalah batas atas dan bawah daerah surplus, jadi keduanya perlu diketahui sebelum menghitung luas."
        },
        {
          label: "Kuantitas pada harga yang dipakai",
          lines: [
            "Pada P = " + nice(P) + " : Qd = " + nice(QdRaw) + " ;  Qs = " + nice(QsRaw),
            "Kuantitas efektif (tidak negatif): Qd = " + nice(Qd) + " ;  Qs = " + nice(Qs),
            "Yang benar-benar ditransaksikan = min(Qd, Qs) = " + nice(Qt),
            Qd > Qs ? "Harga di bawah keseimbangan → kelangkaan " + nice(Qd - Qs) + " unit"
              : Qs > Qd ? "Harga di atas keseimbangan → kelebihan penawaran " + nice(Qs - Qd) + " unit"
                : "Harga tepat di keseimbangan"
          ],
          why: "Pada harga P yang dipakai, kuantitas diminta dan ditawarkan dihitung terpisah dari fungsi masing-masing. Yang benar-benar ditransaksikan adalah yang lebih kecil, karena tidak ada yang bisa membeli barang yang tidak diproduksi atau menjual barang yang tidak diminta. Selisih Qd dan Qs menunjukkan apakah harga itu menimbulkan kelangkaan atau kelebihan penawaran."
        },
        {
          label: "Hitung surplus dengan integral di bawah kurva",
          lines: [
            "CS = ∫₀^Q [Pd(q) − P] dq = (aQ − Q²/2)/b − P·Q",
            "CS = " + nice(CS),
            "PS = ∫₀^Q [P − Ps(q)] dq = P·Q − (Q²/2 − cQ)/d",
            "PS = " + nice(PS),
            "Total surplus = CS + PS = " + nice(CS + PS)
          ],
          result: "CS = " + nice(CS) + " · PS = " + nice(PS) + " · total = " + nice(CS + PS),
          why: "Surplus konsumen adalah luas di bawah kurva permintaan dan di atas harga P, dihitung lewat integral pada kuantitas yang terjadi. Surplus produsen adalah luas di atas kurva penawaran dan di bawah harga P. Keduanya memakai Q yang sama supaya total surplus mencerminkan kesejahteraan yang benar-benar tercipta pada harga itu."
        }
      ];
      if (DWL > 0) {
        steps.push({
          label: "Deadweight loss (kesejahteraan yang hilang)",
          lines: [
            "Harga permintaan pada Q = " + nice(Qt) + " : " + nice(pdQ),
            "Harga penawaran pada Q = " + nice(Qt) + " : " + nice(psQ),
            "DWL = ½ × (Pd − Ps) × (Q* − Q)",
            "DWL = ½ × " + nice(pdQ - psQ) + " × " + nice(Qe - Qt) + " = " + nice(DWL)
          ],
          why: "Karena kuantitas menyusut dari Q* ke Q, ada segitiga di antara kurva permintaan dan penawaran yang tidak lagi menjadi surplus siapa pun. Luasnya dihitung setengah kali selisih harga permintaan dan penawaran pada Q, dikali selisih kuantitas. Itulah deadweight loss, ukuran kesejahteraan yang hilang akibat harga tidak berada di keseimbangan."
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
        sub: "Daerah di bawah kurva permintaan dan di atas harga adalah surplus konsumen; daerah di atas kurva penawaran dan di bawah harga adalah surplus produsen. Segitiga kecil di antara keduanya muncul bila kuantitas menyusut di bawah Q*, dan luasnya adalah deadweight loss.",
        xLabel: "Kuantitas (Q)", yLabel: "Harga (P)",
        xDomain: [0, xTop], yDomain: yDom,
        series: [
          { label: "Qd = " + nice(a) + " − " + nice(b) + "P", color: "demand", pts: [[0, a / b], [a, 0]] },
          { label: "Qs = " + nice(c) + " + " + nice(d) + "P", color: "supply", pts: [[c, 0], [c + d * yTop, yTop]] }
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
      if (!(Ax > 0) || !(Ay > 0)) throw "Guna marjinal awal (Ax dan Ay) harus lebih besar dari 0.";
      if (!(bx > 0) || !(by > 0)) throw "Penurunan MU (bx dan by) harus lebih besar dari 0.";
      if (!(Px > 0) || !(Py > 0) || !(M > 0)) throw "Harga dan pendapatan harus lebih besar dari 0.";

      /* sistem:  Px·Qx + Py·Qy = M
                 Py(Ax − bx Qx) = Px(Ay − by Qy) */
      var a2 = -Py * bx, b2 = Px * by, c2 = Px * Ay - Py * Ax;
      var det = Px * b2 - Py * a2;
      if (Math.abs(det) < 1e-12) throw "Kombinasi parameter ini tidak punya solusi tunggal (coba ubah slope).";
      var QxRaw = (M * b2 - Py * c2) / det;
      var QyRaw = (Px * c2 - a2 * M) / det;
      var Qx = QxRaw, Qy = QyRaw;
      var notes = [], corner = "";
      if (Qx < 0) { Qx = 0; Qy = M / Py; corner = "Y"; notes.push("MU barang X terlalu kecil relatif harganya → solusi sudut: seluruh pendapatan untuk barang Y."); }
      if (Qy < 0) { Qy = 0; Qx = M / Px; corner = "X"; notes.push("MU barang Y terlalu kecil relatif harganya → solusi sudut: seluruh pendapatan untuk barang X."); }

      var MUx = Ax - bx * Qx, MUy = Ay - by * Qy;
      /* Pada solusi sudut, λ adalah MU per rupiah dari barang yang tetap dibeli;
         barang yang tidak dibeli hanya perlu memenuhi MU/P ≤ λ. */
      var lam = corner === "Y" ? MUy / Py : MUx / Px;
      var TUx = Ax * Qx - (bx * Qx * Qx) / 2;
      var TUy = Ay * Qy - (by * Qy * Qy) / 2;
      var spend = Px * Qx + Py * Qy;
      if (MUx < 0 || MUy < 0) {
        notes.push("Guna marjinal salah satu barang sudah negatif: konsumen berada di titik jenuh, sehingga tambahan barang justru menurunkan kepuasan. Grafik tetap menampilkan daerah MU negatif agar posisinya terbaca.");
      }

      var steps = [
        {
          label: "Fungsi guna marjinal dan syarat keseimbangan",
          lines: [
            "MUx = " + nice(Ax) + " − " + nice(bx) + " Qx",
            "MUy = " + nice(Ay) + " − " + nice(by) + " Qy",
            "Syarat 1 (kepuasan maksimum): MUx / Px = MUy / Py",
            "Syarat 2 (anggaran habis): " + nice(Px) + " Qx + " + nice(Py) + " Qy = " + nice(M)
          ],
          why: "Dua fungsi guna marjinal dan dua syarat keseimbangan konsumen ditulis lebih dulu. Syarat pertama memastikan setiap rupiah memberi tambahan kepuasan yang sama, syarat kedua memastikan seluruh pendapatan terpakai. Angka Ax, bx, Ay, by, Px, Py, dan M semuanya berasal dari kolom input."
        },
        {
          label: "Bentuk persamaan linear",
          lines: [
            "Dari syarat 1: " + nice(Py) + "(" + nice(Ax) + " − " + nice(bx) + " Qx) = " + nice(Px) + "(" + nice(Ay) + " − " + nice(by) + " Qy)",
            nice(Py * Ax) + " − " + nice(Py * bx) + " Qx = " + nice(Px * Ay) + " − " + nice(Px * by) + " Qy",
            "→ (" + nice(-Py * bx) + ") Qx + (" + nice(Px * by) + ") Qy = " + nice(c2)
          ],
          why: "Syarat MUx/Px = MUy/Py diubah menjadi persamaan linear dengan mengalikan silang kedua harga. Bentuk ini perlu supaya dua syarat bisa diselesaikan bersamaan sebagai sistem dua persamaan. Koefisien di ruas kiri adalah hasil kali harga dengan penurunan guna marjinal yang kamu isi."
        },
        {
          label: "Selesaikan (aturan Cramer)",
          lines: [
            "det = (" + nice(Px) + ")(" + nice(b2) + ") − (" + nice(Py) + ")(" + nice(a2) + ") = " + nice(det),
            "Qx mentah = [" + nice(M) + " × " + nice(b2) + " − " + nice(Py) + " × " + nice(c2) + "] : " + nice(det) + " = " + nice(QxRaw) +
              (QxRaw < 0 ? " → 0 (solusi sudut)" : ""),
            "Qy mentah = [" + nice(Px) + " × " + nice(c2) + " − (" + nice(a2) + ") × " + nice(M) + "] : " + nice(det) + " = " + nice(QyRaw) +
              (QyRaw < 0 ? " → 0 (solusi sudut)" : "")
          ],
          result: "Qx* = " + nice(Qx) + " · Qy* = " + nice(Qy),
          why: "Sistem dua persamaan diselesaikan dengan aturan Cramer: determinan utama menjadi pembagi hasil substitusi. Cara ini dipilih karena sistemnya kecil dan linear. Qx* dan Qy* adalah kombinasi yang memenuhi kedua syarat sekaligus, yaitu kepuasan maksimum dengan anggaran habis."
        },
        {
          label: "Uji syarat keseimbangan",
          lines: [
            "MUx = " + nice(Ax) + " − " + nice(bx) + "(" + nice(Qx) + ") = " + nice(MUx),
            "MUy = " + nice(Ay) + " − " + nice(by) + "(" + nice(Qy) + ") = " + nice(MUy),
            "MUx/Px = " + nice(MUx) + " / " + nice(Px) + " = " + nice(MUx / Px),
            "MUy/Py = " + nice(MUy) + " / " + nice(Py) + " = " + nice(MUy / Py),
            corner === "Y"
              ? "Solusi sudut Qx = 0: syaratnya MUx/Px ≤ λ = MUy/Py = " + nice(lam)
              : corner === "X"
                ? "Solusi sudut Qy = 0: syaratnya MUy/Py ≤ λ = MUx/Px = " + nice(lam)
                : "→ sama (λ = " + nice(lam) + ")",
            "Pengeluaran = " + nice(Px) + "(" + nice(Qx) + ") + " + nice(Py) + "(" + nice(Qy) + ") = " + nice(spend) + " (pendapatan = " + nice(M) + ")"
          ],
          why: "Nilai Qx* dan Qy* dimasukkan kembali ke fungsi guna marjinal. Pada solusi interior kedua rasio MU terhadap harga sama dengan λ; pada solusi sudut, barang yang tidak dibeli hanya perlu memenuhi MU/P ≤ λ karena seluruh anggaran habis di barang lain. Pengeluaran dicek agar sama dengan pendapatan."
        },
        {
          label: "Total kepuasan",
          lines: [
            "TUx = " + nice(Ax) + "Qx − ½(" + nice(bx) + ")Qx² = " + nice(TUx),
            "TUy = " + nice(Ay) + "Qy − ½(" + nice(by) + ")Qy² = " + nice(TUy),
            "TU total = " + nice(TUx + TUy)
          ],
          why: "Total kepuasan dihitung dengan menjumlahkan luas di bawah kurva MU tiap barang sampai kuantitas yang dipilih. Rumus Ax·Qx − ½bx·Qx² berasal dari integral MUx terhadap Qx. Angka ini berguna untuk membandingkan kepuasan sebelum dan sesudah perubahan harga atau pendapatan."
        }
      ];

      var results = [
        { label: "Jumlah barang X (Qx*)", value: nice(Qx), hero: true },
        { label: "Jumlah barang Y (Qy*)", value: nice(Qy), hero: true },
        { label: "Guna marjinal uang (λ)", value: nice(lam) },
        { label: "Total utility", value: nice(TUx + TUy) },
        { label: "MUx dan MUy", value: nice(MUx) + " ; " + nice(MUy) },
        { label: "Pengeluaran", value: nice(spend), sub: "pendapatan " + nice(M) },
        { label: corner === "Y" ? "Syarat sudut: MUx/Px ≤ λ" : corner === "X" ? "Syarat sudut: MUy/Py ≤ λ" : "MUx/Px = MUy/Py",
          value: corner === "Y" ? nice(MUx / Px) + " ≤ " + nice(lam)
            : corner === "X" ? nice(MUy / Py) + " ≤ " + nice(lam)
              : nice(lam) + " = " + nice(MUy / Py) }
      ];

      var xMax = Math.max(Ax / bx, Ay / by, Qx * 1.3, Qy * 1.3, 1) * 1.05;
      var yMin = Math.min(0, MUx, MUy, lam * Px, lam * Py) * 1.08;
      var yMax = Math.max(Ax, Ay, lam * Px, lam * Py, 1) * 1.08;
      if (!(yMax > yMin)) yMax = yMin + 1;
      var charts = [{
        title: "Guna marjinal dua barang dan nilai λ",
        sub: corner === "Y"
          ? "Solusi sudut: Qx* = 0, jadi MUx/Px hanya perlu ≤ λ; seluruh anggaran dipakai untuk Y sehingga Qy* berada di MUy = λ × Py."
          : corner === "X"
            ? "Solusi sudut: Qy* = 0, jadi MUy/Py hanya perlu ≤ λ; seluruh anggaran dipakai untuk X sehingga Qx* berada di MUx = λ × Px."
            : "Dua kurva guna marjinal dan tingkat λ: Qx* dan Qy* berada di ketinggian MU = λ × P masing-masing, tanda bahwa rupiah terakhir di kedua barang memberi tambahan kepuasan per rupiah yang sama.",
        xLabel: "Kuantitas barang (Q)", yLabel: "Guna marjinal (MU)",
        xDomain: [0, xMax], yDomain: [yMin, yMax],
        series: [
          { label: "MUx = " + nice(Ax) + " − " + nice(bx) + "Qx", color: "supply", pts: [[0, Ax], [Ax / bx, 0], [xMax, Ax - bx * xMax]] },
          { label: "MUy = " + nice(Ay) + " − " + nice(by) + "Qy", color: "blue", pts: [[0, Ay], [Ay / by, 0], [xMax, Ay - by * xMax]] }
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
        status: corner
          ? "Kepuasan maksimum tercapai di solusi sudut: Qx = " + nice(Qx) + ", Qy = " + nice(Qy) +
            ". Seluruh anggaran dipakai untuk " + (corner === "Y" ? "barang Y" : "barang X") +
            ", dengan λ = " + nice(lam) + "."
          : "Kepuasan maksimum pada Qx = " + nice(Qx) + " dan Qy = " + nice(Qy) +
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
      if (!(L >= 0)) throw "Tenaga kerja (L) tidak boleh negatif.";
      if (!(a >= 0) || !(b >= 0)) throw "Koefisien a dan b tidak boleh negatif.";
      if (c < 0) throw "Koefisien c (kubik) sebaiknya ≥ 0 agar kurva produksi realistis.";
      if (c === 0 && a === 0 && b === 0) throw "Dengan a = b = c = 0, fungsi produksi bernilai nol untuk semua L. Isi minimal salah satu koefisien positif.";

      function TP(x) { return a * x + b * x * x - c * x * x * x; }
      function MP(x) { return a + 2 * b * x - 3 * c * x * x; }
      function AP(x) { return a + b * x - c * x * x; }

      var Lap = c > 0 ? b / (2 * c) : NaN;
      var APmax = isFinite(Lap) ? AP(Lap) : NaN;
      var mpRoots = roots2(-3 * c, 2 * b, a).filter(function (r) { return r > 0; });
      var Ltpmax = mpRoots.length ? Math.max.apply(null, mpRoots) : NaN;
      var TPmax = isFinite(Ltpmax) ? TP(Ltpmax) : NaN;
      var Lmpmax = c > 0 ? b / (3 * c) : NaN;
      var MPmax = isFinite(Lmpmax) ? MP(Lmpmax) : NaN;

      var tp = TP(L), mp = MP(L), ap = AP(L);
      var tahap, saran;
      if (ap <= 0 || tp < 0) { tahap = "di luar daerah produksi"; saran = "Tambahan tenaga kerja belum menghasilkan output positif."; }
      else if (c === 0 && b === 0) { tahap = "AP konstan, MP = AP (fungsi linear)"; saran = "Tidak ada titik AP maksimum atau MP = 0 yang berhingga; setiap tambahan L menaikkan TP dengan laju tetap."; }
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
          ],
          why: "Fungsi produksi kubik dan turunannya disiapkan lebih dulu. MP adalah turunan TP terhadap L, sedangkan AP adalah TP dibagi L. Dari ketiga bentuk ini semua titik penting dihitung, dan angka a, b, c berasal dari kolom input."
        }
      ];

      if (c > 0) {
        steps.push({
          label: "AP maksimum → batas awal tahap rasional",
          lines: [
            "∂AP/∂L = " + nice(b) + " − " + nice(2 * c) + "L = 0",
            "L = " + nice(b) + " : " + nice(2 * c) + " = " + nice(Lap),
            "AP maks = " + nice(APmax),
            "Cek: MP = " + nice(MP(Lap)) + ", sama dengan AP → AP = MP"
          ],
          why: "AP maksimum terjadi saat turunan AP terhadap L sama dengan nol, sehingga L = b dibagi 2c. Di titik itu MP tepat memotong AP dari atas, yang sekaligus menandai awal tahap rasional. Angka b dan c adalah koefisien yang kamu isi."
        });
      }
      if (isFinite(Ltpmax)) {
        steps.push({
          label: "TP maksimum → MP = 0",
          lines: [
            nice(3 * c) + "L² − " + nice(2 * b) + "L − " + nice(a) + " = 0",
            "L = [" + nice(2 * b) + " + √(" + nice(4 * b * b) + " + " + nice(12 * c * a) + ")] : " + nice(6 * c) + " = " + nice(Ltpmax),
            "Akar positif dipakai karena L tidak boleh negatif",
            "TP maks = " + nice(TPmax),
            "MP terbesar pada L = " + nice(Lmpmax) + " (MP = " + nice(MPmax) + ") — awal tambahan hasil yang menurun"
          ],
          why: "TP maksimum terjadi saat MP = 0, yaitu ketika tambahan tenaga kerja tidak lagi menambah output. Persamaan kuadrat MP diselesaikan dan diambil akar positifnya karena L tidak boleh negatif. Angka a, b, c yang sama dipakai di sini, sedangkan MP terbesar pada L = b/(3c) menandai awal tambahan hasil yang menurun."
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
        result: "TP = " + nice(tp) + " · MP = " + nice(mp) + " · AP = " + nice(ap),
        why: "Langkah ini mengevaluasi ketiga ukuran pada jumlah tenaga kerja yang kamu pilih, lalu membandingkan MP dengan AP untuk menentukan tahap produksi. TP dihitung langsung dari fungsi, MP dan AP dari rumus turunan dan pembagian. Posisi L terhadap titik AP maksimum dan MP = 0 itulah yang menentukan tahap 1, 2, atau 3."
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

      var xr = [0, Math.max(Lmax, L) * 1.02];
      /* Domain harus memuat titik evaluasi dan nilai minimum kurva; jika tidak,
         titik TP(L) bisa tergambar di luar kotak grafik. */
      var yTop1 = maksFinite(TP(Lmax), TPmax, tp) * 1.1;
      var yMin1 = minFinite(0, TP(Lmax), TPmax, tp) * 1.08;
      var yTop2 = maksFinite(MPmax, APmax, mp, ap, MP(xr[1]), AP(xr[1])) * 1.15;
      var yMin2 = minFinite(0, mp, ap, MP(xr[1]), AP(xr[1]), MPmax, APmax) * 1.08;
      var regions = [];
      if (isFinite(Lap) && isFinite(Ltpmax) && Lap < xr[1]) {
        var bandEnd = Math.min(Ltpmax, xr[1]);
        regions.push({
          pts: [[Lap, 0], [bandEnd, 0], [bandEnd, yTop1], [Lap, yTop1]],
          color: "supply", opacity: 0.07
        });
      }
      var charts = [{
        title: "Produksi total, marjinal, dan rata-rata",
        sub: "Kurva TP, MP, dan AP dari fungsi yang sama dengan langkah di atas: MP memotong AP di titik AP maksimum, dan TP mencapai puncak saat MP = 0." +
          (isFinite(Lap) && isFinite(Ltpmax) ? " Pita hijau menandai tahap rasional antara L = " + nice(Lap) + " dan L = " + nice(Ltpmax) + "." : ""),
        xLabel: "Tenaga kerja (L)", yLabel: "Output (TP)", yLabel2: "MP & AP",
        xDomain: xr, yDomain: [yMin1, yTop1], yDomain2: [yMin2, yTop2],
        series: [
          { label: "TP = " + nice(a) + "L + " + nice(b) + "L² − " + nice(c) + "L³ (sumbu kiri)", color: "ink", fn: TP, xRange: xr },
          { label: "MP = " + nice(a) + " + " + nice(2 * b) + "L − " + nice(3 * c) + "L² (sumbu kanan)", color: "demand", axis: 2, fn: MP, xRange: xr },
          { label: "AP = " + nice(a) + " + " + nice(b) + "L − " + nice(c) + "L² (sumbu kanan)", color: "blue", axis: 2, fn: AP, xRange: xr }
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
      if (isFinite(Ltpmax) && Ltpmax > xr[1]) notes.push("Titik MP = 0 (L = " + nice(Ltpmax) + ") berada di luar batas gambar; naikkan L maks bila ingin melihatnya.");
      if (L > Lmax) notes.push("Grafik diperluas sampai L = " + nice(L) + " karena L uji melebihi batas gambar " + nice(Lmax) + ".");
      if (c === 0) {
        notes.push(b > 0
          ? "Karena c = 0, AP dan TP terus naik tanpa titik maksimum yang berhingga; nilai pada tabel adalah nilai di L uji, bukan puncak."
          : "Karena c = 0 dan b = 0, AP tetap dan TP naik linear tanpa titik maksimum; nilai pada tabel adalah nilai di L uji, bukan puncak.");
      }

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
      if (!(p >= 0) || !(r >= 0)) throw "Koefisien p dan r tidak boleh negatif; keduanya harus menghasilkan biaya yang masuk akal.";

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
      if (!(t >= 0) || !(ac >= 0) || !(avc >= 0) || !(mc >= 0)) {
        throw "Pada Q ini ada biaya yang negatif. Periksa koefisien p, q, dan r agar TC, AC, AVC, dan MC tidak negatif.";
      }
      if (isFinite(Qavc) && !(AVC(Qavc) >= 0)) throw "AVC minimum menjadi negatif; koefisien biaya variabel tidak masuk akal. Periksa p, q, dan r.";
      if (isFinite(Qmc) && !(MC(Qmc) >= 0)) throw "MC minimum menjadi negatif; koefisien biaya variabel tidak masuk akal. Periksa p, q, dan r.";
      if (isFinite(Qac) && !(AC(Qac) >= 0)) throw "AC minimum menjadi negatif; koefisien biaya tetap dan variabel tidak masuk akal.";

      var steps = [
        {
          label: "Susun fungsi biaya",
          lines: [
            "VC = " + nice(p) + "Q + (" + nice(q) + ")Q² + " + nice(r) + "Q³",
            "TC = FC + VC = " + nice(FC) + " + " + nice(p) + "Q + (" + nice(q) + ")Q² + " + nice(r) + "Q³",
            "AC = TC/Q",
            "AVC = VC/Q",
            "AFC = " + nice(FC) + "/Q",
            "MC = ∂TC/∂Q = " + nice(p) + " + " + nice(2 * q) + "Q + " + nice(3 * r) + "Q²"
          ],
          why: "Fungsi biaya disusun dari tiga bagian: biaya tetap FC, biaya variabel VC, dan turunannya MC. AC, AVC, dan AFC adalah biaya per unit yang diperoleh dengan membagi tiap komponen dengan Q. Semua koefisien berasal dari kolom FC, p, q, dan r."
        },
        {
          label: "Evaluasi pada Q = " + nice(Q),
          lines: [
            "VC(" + nice(Q) + ") = " + nice(VC(Q)),
            "TC(" + nice(Q) + ") = " + nice(FC) + " + " + nice(VC(Q)) + " = " + nice(t),
            "AC = " + nice(t) + " : " + nice(Q) + " = " + nice(ac),
            "AVC = " + nice(VC(Q)) + " : " + nice(Q) + " = " + nice(avc),
            "AFC = " + nice(FC) + " : " + nice(Q) + " = " + nice(afc),
            "Cek: AC = AVC + AFC",
            "MC = " + nice(p) + " + " + nice(2 * q) + "(" + nice(Q) + ") + " + nice(3 * r) + "(" + nice(Q * Q) + ") = " + nice(mc),
            mc < ac ? "MC (" + nice(mc) + ") &lt; AC (" + nice(ac) + ") → biaya rata-rata masih menurun"
              : "MC (" + nice(mc) + ") &gt; AC (" + nice(ac) + ") → biaya rata-rata sedang naik",
            "Laba per unit bila harga jual P: P − AC = P − " + nice(ac)
          ],
          result: "TC = " + nice(t) + " · AC = " + nice(ac) + " · MC = " + nice(mc),
          why: "Semua biaya dievaluasi pada kuantitas Q yang kamu isi. AC = TC/Q dan AVC = VC/Q, sedangkan AFC = FC/Q, sehingga AC harus sama dengan AVC + AFC. MC dihitung dari turunan TC dan dibandingkan dengan AC untuk melihat apakah biaya rata-rata sedang turun atau naik."
        }
      ];
      if (isFinite(Qavc)) {
        steps.push({
          label: "Titik minimum AVC (titik tutup usaha)",
          lines: [
            "∂AVC/∂Q = " + nice(q) + " + " + nice(2 * r) + "Q = 0",
            "Q = " + nice(Qavc),
            "AVC min = " + nice(AVC(Qavc)),
            "MC di titik itu = " + nice(MC(Qavc)) + " → MC memotong AVC di minimumnya",
            "Perusahaan tutup (shutdown) bila harga pasar &lt; " + nice(AVC(Qavc))
          ],
          why: "Titik tutup usaha adalah minimum AVC, dicari saat turunan AVC terhadap Q sama dengan nol. Di titik itu MC memotong AVC, jadi harga pasar di bawah nilai ini membuat produksi tidak menutup biaya variabel. Angka q dan r berasal dari koefisien biaya variabel."
        });
      }
      if (isFinite(Qac)) {
        steps.push({
          label: "Titik minimum AC (titik impas)",
          lines: [
            "MC = AC → diselesaikan secara numerik: Q = " + nice(Qac),
            "AC min = " + nice(AC(Qac)),
            "MC di titik itu = " + nice(MC(Qac)) + " (selisih ≈ " + nice(Math.abs(MC(Qac) - AC(Qac))) + ")",
            "Harga impas (break even) = " + nice(AC(Qac)) + " ; di bawah itu perusahaan rugi"
          ],
          why: "Titik impas adalah minimum AC, yaitu saat MC = AC. Persamaannya diselesaikan secara numerik karena bentuk kubiknya tidak selalu mudah difaktorkan. Harga jual di bawah AC minimum berarti setiap unit yang terjual masih meninggalkan kerugian."
        });
      }
      if (isFinite(Qmc)) {
        steps.push({
          label: "MC minimum",
          lines: [
            "∂MC/∂Q = " + nice(2 * q) + " + " + nice(6 * r) + "Q = 0",
            "Q = " + nice(Qmc),
            "MC min = " + nice(MC(Qmc))
          ],
          why: "MC minimum dicari dari turunan MC terhadap Q. Titik ini bukan keputusan produksi, tetapi berguna untuk membaca di mana tambahan biaya mulai melambat sebelum naik lagi. Angka q dan r yang sama dipakai seperti pada langkah sebelumnya."
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
      var Qmax = maksFinite(20, Q * 2.5, isFinite(Qac) ? Qac * 3 : NaN,
        isFinite(Qavc) ? Qavc * 1.5 : NaN, isFinite(Qmc) ? Qmc * 1.5 : NaN);
      var yTop = maksFinite(ac, avc, mc, afc);
      for (var i = 0; i <= 60; i++) {
        var x = Qstart + (Qmax - Qstart) * (i / 60);
        yTop = maksFinite(yTop, AC(x), AVC(x), MC(x), AFC(x));
      }
      if (isFinite(Qavc)) yTop = maksFinite(yTop, AVC(Qavc), MC(Qavc));
      if (isFinite(Qac)) yTop = maksFinite(yTop, AC(Qac), MC(Qac));
      if (isFinite(Qmc)) yTop = maksFinite(yTop, MC(Qmc));
      yTop *= 1.08;
      var yMin = minFinite(0, ac, avc, mc, AC(Qstart), AVC(Qstart), MC(Qstart)) * 1.05;
      if (!(yTop > yMin)) yTop = yMin + 1;
      var charts = [{
        title: "Kurva biaya rata-rata dan marjinal",
        sub: "MC memotong AVC di titik tutup usaha dan memotong AC di titik impas. Garis tegak menandai Q uji serta kedua titik minimum yang dihitung pada langkah sebelumnya, sehingga terlihat apakah biaya rata-rata masih turun atau sudah naik.",
        xLabel: "Kuantitas produksi (Q)", yLabel: "Biaya per unit / marjinal",
        xDomain: [0, Qmax], yDomain: [yMin, yTop],
        series: [
          { label: "AC = " + nice(FC) + "/Q + " + nice(p) + (q === 0 ? "" : (q < 0 ? " − " + nice(-q) : " + " + nice(q)) + "Q") + (r === 0 ? "" : (r < 0 ? " − " + nice(-r) : " + " + nice(r)) + "Q²"), color: "blue", fn: AC, xRange: [Qstart, Qmax], n: 160 },
          { label: "AVC = " + nice(p) + (q === 0 ? "" : (q < 0 ? " − " + nice(-q) : " + " + nice(q)) + "Q") + (r === 0 ? "" : (r < 0 ? " − " + nice(-r) : " + " + nice(r)) + "Q²"), color: "demand", fn: AVC, xRange: [Qstart, Qmax], n: 160 },
          { label: "AFC = " + nice(FC) + "/Q", color: "muted", dash: true, fn: AFC, xRange: [Qstart, Qmax], n: 160 },
          { label: "MC = " + nice(p) + (2 * q === 0 ? "" : (2 * q < 0 ? " − " + nice(-2 * q) : " + " + nice(2 * q)) + "Q") + (3 * r === 0 ? "" : (3 * r < 0 ? " − " + nice(-3 * r) : " + " + nice(3 * r)) + "Q²"), color: "supply", fn: MC, xRange: [Qstart, Qmax], n: 160 }
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
      if (FC < 0 || p < 0 || r < 0) throw "FC, p, dan r tidak boleh negatif.";
      var seg = v.seg || "monopoli";
      var a, b, Pmark;
      if (seg === "monopoli") {
        a = v.a; b = v.b;
        if (!ok(a, b) || !(b > 0)) throw "Isi intersep dan kemiringan permintaan (b harus > 0).";
        if (!(a > 0)) throw "Intersep permintaan (a) harus lebih besar dari 0.";
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
          ],
          why: "Langkah ini menurunkan TR, MR, AR, dan MC dari fungsi permintaan serta fungsi biaya. Pada permintaan menurun, MR selalu lebih curam daripada harga karena setiap tambahan unit menurunkan harga semua unit sebelumnya. Angka a, b, p, q, dan r berasal dari kolom input."
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
              : "Q = [−(" + nice(B) + ") ± √(" + nice(B * B - 4 * A * C) + ")] : " + nice(2 * A)),
            "Akar positif: " + roots.map(function (x) { return nice(x); }).join(" ; "),
            "Dipilih akar terkecil yang positif (MR menurun memotong MC yang menaik): Q* = " + nice(Q),
            "P* dibaca dari kurva permintaan: P = " + nice(a) + " − " + nice(b) + "(" + nice(Q) + ") = " + nice(P),
            "Cek: MR = " + nice(a - 2 * b * Q) + " ;  MC = " + nice(MC(Q)) + " → sama"
          ],
          result: "Q* = " + nice(Q) + " · P* = " + nice(P),
          why: "Laba maksimum tercapai saat tambahan penerimaan sama dengan tambahan biaya, yaitu MR = MC. Persamaan itu disusun menjadi bentuk kuadrat, lalu diambil akar positif terkecil karena di situlah MR memotong MC yang menaik. Harga jual dibaca dari kurva permintaan pada Q*."
        });
      } else {
        P = Pmark;
        steps.push({
          label: "Pada persaingan sempurna harga ditentukan pasar",
          lines: [
            "P = MR = AR = " + nice(P) + " (garis permintaan mendatar untuk perusahaan)",
            "Laba maksimum tetap di MR = MC → " + nice(P) + " = " + nice(p) + " + " + nice(2 * q) + "Q + " + nice(3 * r) + "Q²",
            "MC = ∂TC/∂Q = " + nice(p) + " + " + nice(2 * q) + "Q + " + nice(3 * r) + "Q²"
          ],
          why: "Pada persaingan sempurna perusahaan menerima harga pasar, sehingga permintaan yang dihadapinya mendatar dan P = MR = AR. Laba tetap dimaksimalkan di MR = MC, yang sekarang berarti harga pasar sama dengan biaya marjinal. Harga P berasal dari kolom harga pasar, sedangkan koefisien biaya dari kolom p, q, dan r."
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
            "Cek: MC(" + nice(Q) + ") = " + nice(MC(Q)) + " = harga pasar " + nice(P)
          ],
          result: "Q* = " + nice(Q) + " · P* = " + nice(P),
          why: "Persamaan MC = P diselesaikan untuk Q, dan dipilih akar pada sisi MC yang menaik agar laba benar-benar maksimum. Setelah Q* diketahui, harga sudah tetap sebesar harga pasar. Baris cek memastikan MC di Q* memang sama dengan harga."
        });
      }

      var TR = P * Q, tc = TC(Q), profit = TR - tc, ac = AC(Q), avc = AVC(Q), mc = MC(Q);
      if (!(ac >= 0) || !(avc >= 0) || !(mc >= 0)) {
        throw "Pada Q* ini biaya rata-rata atau biaya marjinal negatif. Periksa kembali p, q, dan r agar MC dan AC masuk akal.";
      }
      /* AVC minimum bisa berada di Q = 0 bila AVC tidak pernah turun
         (q ≥ 0 atau r = 0); dalam kasus itu harga shutdown sama dengan p. */
      var Qavc = (r > 0 && q < 0) ? -q / (2 * r) : 0;
      var avcMin = isFinite(Qavc) && Qavc > 0 ? AVC(Qavc) : p;
      if (!(avcMin >= 0)) {
        throw "AVC minimum negatif. Koefisien biaya variabel tidak masuk akal untuk analisis shutdown; periksa p, q, dan r.";
      }

      steps.push({
        label: "Hitung laba",
        lines: [
          "TR = P × Q = " + nice(P) + " × " + nice(Q) + " = " + nice(TR),
          "TC = " + nice(FC) + " + " + nice(p) + "(" + nice(Q) + ") + " + nice(q) + "(" + nice(Q * Q) + ") + " + nice(r) + "(" + nice(Q * Q * Q) + ") = " + nice(tc),
          "AC = TC/Q = " + nice(ac),
          "Laba = TR − TC = " + nice(profit),
          "Cara kedua: laba = (P − AC) × Q = (" + nice(P) + " − " + nice(ac) + ") × " + nice(Q) + " = " + nice((P - ac) * Q)
        ],
        result: "Laba = " + nice(profit),
        why: "TR dihitung dari harga kali kuantitas, TC dari fungsi biaya pada kuantitas yang sama, lalu laba adalah selisihnya. Cara kedua (P − AC) × Q memberi hasil yang sama dan menunjukkan laba per unit. Angka-angka ini memakai Q* dan P* dari langkah sebelumnya."
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
        { label: "Harga shutdown (AVC min)", value: isFinite(avcMin) ? nice(avcMin) : "—" }
      ];

      var yTopCand = [P, mc, ac];
      if (seg === "monopoli") yTopCand.push(a);
      var Qmax = seg === "monopoli" ? Math.max(a / b, Q * 1.4) : Math.max(Q * 2.2, 1);
      for (var i2 = 0; i2 <= 40; i2++) {
        var xx = (Qmax) * (i2 / 40);
        if (xx > 0) yTopCand.push(AC(xx), MC(xx));
      }
      var yTop = maksFinite.apply(null, yTopCand) * 1.1;
      if (!(yTop > 0)) yTop = 1;
      var series = [], regions = [], hlines = [], vlines = [], points = [];
      if (seg === "monopoli") {
        series.push({ label: "P = " + nice(a) + " − " + nice(b) + "Q (permintaan)", color: "demand", pts: [[0, a], [a / b, 0]] });
        series.push({ label: "MR = " + nice(a) + " − " + nice(2 * b) + "Q", color: "demand", dash: true, pts: [[0, a], [a / (2 * b), 0]] });
      } else {
        series.push({ label: "P = MR = AR = " + nice(P), color: "demand", pts: [[0, P], [Qmax, P]] });
      }
      series.push({ label: "MC = " + nice(p) + (2 * q === 0 ? "" : (2 * q < 0 ? " − " + nice(-2 * q) : " + " + nice(2 * q)) + "Q") + (3 * r === 0 ? "" : (3 * r < 0 ? " − " + nice(-3 * r) : " + " + nice(3 * r)) + "Q²"), color: "supply", fn: MC, xRange: [0, Qmax], n: 120 });
      if (FC > 0) series.push({ label: "AC = " + nice(FC) + "/Q + " + nice(p) + (q === 0 ? "" : (q < 0 ? " − " + nice(-q) : " + " + nice(q)) + "Q") + (r === 0 ? "" : (r < 0 ? " − " + nice(-r) : " + " + nice(r)) + "Q²"), color: "blue", fn: AC, xRange: [Math.max(Qmax / 40, 0.1), Qmax], n: 120 });
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
        sub: "Daerah terwarnai adalah selisih harga dan biaya rata-rata dikali kuantitas: hijau berarti laba, merah berarti rugi. Titik E* menunjukkan kuantitas dan harga tempat MR = MC, dan garis P* memperlihatkan harga yang dibaca dari kurva permintaan.",
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
      if (!(a1 > 0) || !(a2 > 0)) throw "Intersep permintaan pasar 1 dan 2 (a1, a2) harus lebih besar dari 0.";
      if (!(b1 > 0) || !(b2 > 0)) throw "Kemiringan permintaan b1 dan b2 harus lebih besar dari 0.";
      if (c1 < 0) throw "Kemiringan MC (c1) tidak boleh negatif.";
      if (c0 < 0) throw "Konstanta MC tidak boleh negatif.";
      if (FC < 0) throw "Biaya tetap tidak boleh negatif.";

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

      var E1 = Q1 > 0 ? -b1 * (P1 / Q1) : NaN;
      var E2 = Q2 > 0 ? -b2 * (P2 / Q2) : NaN;
      var steps = [
        {
          label: "Invers permintaan dan MR tiap pasar",
          lines: [
            "Pasar 1: Q1 = " + nice(a1) + " − " + nice(b1) + "P1",
            "→ P1 = (" + nice(a1) + " − Q1)/" + nice(b1) + " = " + nice(a1 / b1) + " − " + nice(1 / b1) + "Q1",
            "MR1 = " + nice(a1 / b1) + " − " + nice(2 / b1) + "Q1 (kemiringan dua kali P1)",
            "Pasar 2: Q2 = " + nice(a2) + " − " + nice(b2) + "P2",
            "→ P2 = (" + nice(a2) + " − Q2)/" + nice(b2) + " = " + nice(a2 / b2) + " − " + nice(1 / b2) + "Q2",
            "MR2 = " + nice(a2 / b2) + " − " + nice(2 / b2) + "Q2",
            "MC = " + nice(c0) + (c1 > 0 ? " + " + nice(c1) + "Q" : " (konstan)")
          ],
          why: "Permintaan tiap pasar dibalik menjadi harga sebagai fungsi kuantitas, lalu diturunkan menjadi MR. Pada permintaan linear, MR punya intersep sama tetapi kemiringannya dua kali lebih curam. Angka a1, b1, a2, b2 berasal dari kolom input, sedangkan MC dari c0 dan c1."
        },
        {
          label: "Penjumlahan horizontal MR (MRt = MR1 + MR2)",
          lines: [
            "Pada MR bersama = m, tiap pasar memilih kuantitas:",
            "Q1 = (" + nice(a1) + " − " + nice(b1) + "m)/2",
            "Q2 = (" + nice(a2) + " − " + nice(b2) + "m)/2",
            "QTotal = (" + nice(a1 + a2) + " − " + nice(b1 + b2) + "m)/2",
            "Dibalik: m = (" + nice(a1 + a2) + " − 2·QTotal)/" + nice(b1 + b2) + " → kurva MRt",
            c1 > 0
              ? "Syarat m = MC: m = [" + nice(c0) + " + " + nice(c1) + "(" + nice((a1 + a2) / 2) + ")] : [1 + " + nice(c1) + "(" + nice((b1 + b2) / 2) + ")] = " + nice(m)
              : "MC konstan → MR bersama = m = " + nice(m) + " (MR1 = MR2 = MC)"
          ],
          result: "MR bersama = " + nice(m),
          why: "Karena satu pabrik melayani dua pasar, MR tiap pasar dijumlahkan secara horizontal pada setiap tingkat MR yang sama. Hasilnya kurva MRt, dan keseimbangan tercapai saat MRt = MC. Angka m adalah tingkat MR bersama yang memenuhi syarat itu; bila MC konstan, m langsung sama dengan MC."
        },
        {
          label: "Kuantitas dan harga di tiap pasar",
          lines: [
            "Q1 = (" + nice(a1) + " − " + nice(b1) + " × " + nice(m) + ")/2 = " + nice(Q1),
            "P1 = (a1 − Q1)/b1 = " + nice(P1),
            "Q2 = (" + nice(a2) + " − " + nice(b2) + " × " + nice(m) + ")/2 = " + nice(Q2),
            "P2 = (a2 − Q2)/b2 = " + nice(P2),
            "QTotal = " + nice(Qt),
            "Cek: MR1 = " + nice(a1 / b1 - (2 / b1) * Q1) + " ;  MR2 = " + nice(a2 / b2 - (2 / b2) * Q2) + " ;  MC = " + nice(c0 + c1 * Qt) + " → ketiganya sama"
          ],
          result: "Q1 = " + nice(Q1) + " · P1 = " + nice(P1) + " · Q2 = " + nice(Q2) + " · P2 = " + nice(P2),
          why: "Setelah m diketahui, kuantitas tiap pasar dihitung dari MR masing-masing, lalu harganya dibaca dari kurva permintaan pasar itu. Pasar dengan permintaan lebih elastis akan mendapat harga lebih rendah. Baris cek memastikan MR1, MR2, dan MC di output total benar-benar sama."
        },
        {
          label: "Elastisitas tiap pasar dan laba",
          lines: [
            Q1 > 0
              ? "E1 = (∂Q1/∂P1) × (P1/Q1) = (" + nice(-b1) + ")(" + nice(P1) + "/" + nice(Q1) + ") = " + nice(E1)
              : "E1 = — (pasar 1 tidak dilayani)",
            Q2 > 0
              ? "E2 = (" + nice(-b2) + ")(" + nice(P2) + "/" + nice(Q2) + ") = " + nice(E2)
              : "E2 = — (pasar 2 tidak dilayani)",
            "TR = " + nice(TR1) + " + " + nice(TR2) + " = " + nice(TR),
            "TC = " + nice(FC) + " + " + nice(c0) + "(" + nice(Qt) + ")" + (c1 > 0 ? " + ½(" + nice(c1) + ")(" + nice(Qt * Qt) + ")" : "") + " = " + nice(TC),
            "Laba = TR − TC = " + nice(profit)
          ],
          result: "Laba = " + nice(profit) + " · E1 = " + nice(E1) + " · E2 = " + nice(E2),
          why: "Elastisitas tiap pasar dihitung untuk menjelaskan mengapa harganya berbeda, lalu TR, TC, dan laba dijumlahkan dari kedua pasar. TC memakai biaya variabel dari total output, bukan per pasar, karena produksinya satu. Angka E yang lebih besar menunjukkan pasar yang lebih peka terhadap harga."
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

      /* MRt hanya menjumlahkan pasar yang benar-benar aktif. Bila satu pasar
         tidak dilayani, kurva MRt harus sama dengan MR pasar yang aktif. */
      var activeA = (Q1 > 0 ? a1 : 0) + (Q2 > 0 ? a2 : 0);
      var activeB = (Q1 > 0 ? b1 : 0) + (Q2 > 0 ? b2 : 0);
      var mrtInv = function (Q) { return activeB > 0 ? (activeA - 2 * Q) / activeB : NaN; };
      var mcFn = function (Q) { return c0 + c1 * Q; };
      var qm1 = Math.max(Q1 * 1.6, a1 / b1 * 0.6), qm2 = Math.max(Q2 * 1.6, a2 / b2 * 0.6);
      var yD1 = Math.max(a1 / b1, P1 * 1.2), yD2 = Math.max(a2 / b2, P2 * 1.2);
      var qmT = Math.max(Qt * 1.5, 1);
      var yT = maksFinite(mrtInv(0), m, c0 + c1 * qmT) * 1.15;
      var combinedSeries = [];
      if (Q1 > 0) combinedSeries.push({ label: "MR1 = " + nice(a1 / b1) + " − " + nice(2 / b1) + "Q1", color: "demand", width: 1.4, dash: true, pts: [[0, a1 / b1], [a1 / 2, 0]] });
      if (Q2 > 0) combinedSeries.push({ label: "MR2 = " + nice(a2 / b2) + " − " + nice(2 / b2) + "Q2", color: "supply", width: 1.4, dash: true, pts: [[0, a2 / b2], [a2 / 2, 0]] });
      if (activeB > 0) combinedSeries.push({ label: "MRt = " + nice(activeA / activeB) + " − " + nice(2 / activeB) + "QTotal", color: "ink", fn: mrtInv, xRange: [0, activeA / 2], n: 60 });
      combinedSeries.push({ label: "MC = " + nice(c0) + (c1 > 0 ? " + " + nice(c1) + "QTotal" : ""), color: "blue", fn: mcFn, xRange: [0, qmT], n: 60 });

      var charts = [
        {
          title: "Pasar 1",
          sub: "Permintaan pasar 1 (D1) dan penerimaan marjinalnya (MR1); Q1 dibaca di perpotongan MR1 dengan garis MR bersama = MC, lalu P1 dibaca dari D1 pada Q1.",
          xLabel: "Kuantitas pasar 1", yLabel: "Harga P1",
          xDomain: [0, qm1], yDomain: [0, yD1],
          series: [
            { label: "P1 = " + nice(a1 / b1) + " − " + nice(1 / b1) + "Q1", color: "demand", pts: [[0, a1 / b1], [a1, 0]] },
            { label: "MR1 = " + nice(a1 / b1) + " − " + nice(2 / b1) + "Q1", color: "demand", dash: true, pts: [[0, a1 / b1], [a1 / 2, 0]] }
          ],
          hlines: [{ y: m, label: "MR bersama = " + nice(m), color: "blue" }],
          vlines: [{ x: Q1, label: "Q1 = " + nice(Q1) }],
          points: [{ x: Q1, y: P1, color: "ink", label: "P1 = " + nice(P1) }]
        },
        {
          title: "Pasar 2",
          sub: "Permintaan pasar 2 (D2) dan penerimaan marjinalnya (MR2); Q2 dibaca di perpotongan MR2 dengan garis MR bersama = MC, lalu P2 dibaca dari D2 pada Q2.",
          xLabel: "Kuantitas pasar 2", yLabel: "Harga P2",
          xDomain: [0, qm2], yDomain: [0, yD2],
          series: [
            { label: "P2 = " + nice(a2 / b2) + " − " + nice(1 / b2) + "Q2", color: "supply", pts: [[0, a2 / b2], [a2, 0]] },
            { label: "MR2 = " + nice(a2 / b2) + " − " + nice(2 / b2) + "Q2", color: "supply", dash: true, pts: [[0, a2 / b2], [a2 / 2, 0]] }
          ],
          hlines: [{ y: m, label: "MR bersama = " + nice(m), color: "blue" }],
          vlines: [{ x: Q2, label: "Q2 = " + nice(Q2) }],
          points: [{ x: Q2, y: P2, color: "ink", label: "P2 = " + nice(P2) }]
        },
        {
          title: "Gabungan: MRt = MR1 + MR2 dijumlahkan horizontal",
          sub: "MRt adalah penjumlahan horizontal MR1 dan MR2; perpotongannya dengan MC menentukan output total, lalu output itu dibagi kembali ke tiap pasar menurut MR masing-masing.",
          xLabel: "Kuantitas total (QTotal)", yLabel: "MR & MC per unit",
          xDomain: [0, qmT], yDomain: [0, yT],
          series: combinedSeries,
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
  /* ======================================================== UI WIRING */
  function $(id) { return document.getElementById(id); }

  function clearOutput() {
    ["calc-results", "calc-steps", "calc-notes", "calc-charts"].forEach(function (id) {
      var el = $(id);
      if (el) el.innerHTML = "";
    });
    var st = $("calc-status");
    if (st) st.innerHTML = "";
  }

  function renderResults(results) {
    var el = $("calc-results");
    if (!el) return;
    el.innerHTML = "";
    (results || []).forEach(function (r) {
      var d = document.createElement("div");
      d.className = "result" + (r.hero ? " hero-result" : "");
      d.innerHTML =
        '<span class="rlabel">' + (r.label || "") + "</span>" +
        '<span class="rvalue">' + (r.value || "") +
        (r.sub ? '<small class="rsub">' + r.sub + "</small>" : "") + "</span>";
      el.appendChild(d);
    });
  }

  function renderSteps(steps) {
    var el = $("calc-steps");
    if (!el) return;
    el.innerHTML = "";
    (steps || []).forEach(function (st) {
      var li = document.createElement("li");
      /* satu wadah untuk seluruh isi langkah: nomor tetap di kolom kiri,
         isi langkah di kolom kanan (bukan disempitkan ke lebar kolom nomor) */
      var html = '<div class="st-body">';
      var tag = typeof st.result === "string" && st.result ? st.result : "";
      if (st.label || tag) {
        html += '<div class="st-head">' +
          '<span class="st-label">' + (st.label || "") + "</span>" +
          (tag ? '<span class="st-tag">' + tag + "</span>" : "") +
          "</div>";
      }
      /* setiap persamaan satu baris horizontal; keterangan menyusul di kanan
         bila ruang cukup, kalau tidak pindah ke baris berikutnya */
      if (st.lines && st.lines.length) {
        html += '<div class="st-lines">' + st.lines.map(function (ln) {
          if (ln && typeof ln === "object") {
            return '<div class="st-eq">' +
              '<span class="st-line">' + (ln.left || "") + "</span>" +
              (ln.note ? '<span class="st-note">' + ln.note + "</span>" : "") +
              "</div>";
          }
          return '<div class="st-eq"><span class="st-line">' + ln + "</span></div>";
        }).join("") + "</div>";
      }
      if (st.why) html += '<p class="st-why">' + st.why + "</p>";
      html += "</div>";
      li.innerHTML = html;
      el.appendChild(li);
    });
  }

  function renderNotes(notes) {
    var el = $("calc-notes");
    if (!el) return;
    el.innerHTML = "";
    (notes || []).forEach(function (n) {
      var div = document.createElement("div");
      div.className = "note";
      div.innerHTML = n;
      el.appendChild(div);
    });
  }

  function renderStatus(status) {
    var el = $("calc-status") || $("calc-desc");
    if (el) el.innerHTML = status || "";
  }

  function showError(msg) {
    var el = $("calc-error");
    if (!el) return;
    el.hidden = false;
    el.textContent = msg; /* pesan teks polos — aman dari HTML */
  }
  function hideError() {
    var el = $("calc-error");
    if (!el) return;
    el.hidden = true;
    el.textContent = "";
  }

  var boundMode = null;
  var recomputeTimer = null;

  function currentValues(id) {
    var m = MODES[id];
    var out = {};
    if (!m) return out;
    m.fields.forEach(function (f) {
      var el = $("f-" + id + "-" + f.id);
      if (!el) return;
      if (f.type === "check") out[f.id] = el.checked;
      else if (f.type === "select") out[f.id] = el.value; /* teks, jangan diparse jadi angka */
      else out[f.id] = parseVal(el.value);
    });
    return out;
  }

  function updateFieldVisibility(id) {
    var m = MODES[id];
    if (!m) return;
    var vals = currentValues(id);
    m.fields.forEach(function (f) {
      var wrap = $("w-" + id + "-" + f.id);
      if (!wrap) return;
      var show = true;
      if (typeof f.when === "function") {
        try { show = !!f.when(vals); } catch (e) { show = true; }
      }
      wrap.classList.toggle("hidden", !show);
      var el = $("f-" + id + "-" + f.id);
      if (el) el.disabled = !show;
    });
  }

  function buildForm(id) {
    var m = MODES[id];
    var form = $("calc-form");
    if (!m || !form) return;
    boundMode = id;
    var title = $("calc-title");
    var desc = $("calc-desc");
    if (title) title.textContent = m.title || m.label;
    if (desc) desc.textContent = m.desc || "";
    form.innerHTML = "";
    form.setAttribute("data-mode", id);

    /* petunjuk singkat di atas kolom input */
    var legend = document.createElement("p");
    legend.className = "form-legend";
    legend.textContent = "Isi angka di bawah — hasil, langkah, dan grafik menyusul otomatis. Pakai titik (.) untuk desimal, mis. 1.25.";
    form.appendChild(legend);

    m.fields.forEach(function (f) {
      /* judul kelompok input, mis. "Kebijakan pemerintah" */
      if (f.heading) {
        var gh = document.createElement("p");
        gh.className = "form-group";
        gh.textContent = f.heading;
        form.appendChild(gh);
        return;
      }
      var wrap = document.createElement("div");
      wrap.className = "field" + (f.dep ? " dep" : "");
      wrap.id = "w-" + id + "-" + f.id;

      if (f.type === "check") {
        wrap.classList.add("check");
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = "f-" + id + "-" + f.id;
        cb.name = f.id;
        cb.checked = !!f.def;
        var cl = document.createElement("label");
        cl.setAttribute("for", cb.id);
        cl.innerHTML = f.label;
        wrap.appendChild(cb);
        wrap.appendChild(cl);
        form.appendChild(wrap);
        return;
      }

      var label = document.createElement("label");
      label.setAttribute("for", "f-" + id + "-" + f.id);
      label.innerHTML = f.label;
      wrap.appendChild(label);

      if (f.type === "select") {
        var sel = document.createElement("select");
        sel.id = "f-" + id + "-" + f.id;
        sel.name = f.id;
        (f.options || []).forEach(function (o) {
          var opt = document.createElement("option");
          opt.value = o[0];
          opt.textContent = o[1];
          sel.appendChild(opt);
        });
        if (f.def !== undefined) sel.value = String(f.def);
        wrap.appendChild(sel);
      } else {
        var inp = document.createElement("input");
        inp.type = "text";
        inp.setAttribute("inputmode", "decimal");
        inp.id = "f-" + id + "-" + f.id;
        inp.name = f.id;
        inp.value = f.def === undefined ? "" : String(f.def);
        if (f.placeholder) inp.placeholder = f.placeholder;
        wrap.appendChild(inp);
      }
      if (f.hint) {
        var h = document.createElement("span");
        h.className = "hint";
        h.innerHTML = f.hint;
        wrap.appendChild(h);
      }
      form.appendChild(wrap);
    });

    /* tombol aksi */
    var act = document.createElement("div");
    act.className = "form-actions";
    var btnCalc = document.createElement("button");
    btnCalc.className = "btn";
    btnCalc.type = "button";
    btnCalc.textContent = "Hitung";
    btnCalc.addEventListener("click", function () { computeAndRender(true); });
    var btnReset = document.createElement("button");
    btnReset.className = "btn btn-line";
    btnReset.type = "button";
    btnReset.textContent = "Reset";
    btnReset.addEventListener("click", function () {
      clearOutput();
      buildForm(boundMode);
      computeAndRender(true);
    });
    act.appendChild(btnCalc);
    act.appendChild(btnReset);
    form.appendChild(act);

    /* dengarkan input — dengung 350ms supaya nggak hitung tiap ketikan */
    if (!form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("input", function () {
        if (!boundMode) return;
        updateFieldVisibility(boundMode);
        clearTimeout(recomputeTimer);
        recomputeTimer = setTimeout(function () { computeAndRender(false); }, 350);
      });
      form.addEventListener("change", function () {
        if (!boundMode) return;
        updateFieldVisibility(boundMode);
        computeAndRender(false);
      });
    }
    updateFieldVisibility(id);
  }

  function computeAndRender(force) {
    var id = boundMode;
    var m = MODES[id];
    var form = $("calc-form");
    if (!m || !m.compute || !form) return;
    hideError();
    updateFieldVisibility(id);
    var vals = currentValues(id);
    try {
      var out = m.compute(vals);
      renderResults(out.results);
      renderSteps(out.steps);
      renderNotes(out.notes || []);
      renderStatus(out.status || "");
      var charts = $("calc-charts");
      if (charts) {
        charts.innerHTML = "";
        if (out.charts && out.charts.length) {
          window.Charts.render(charts, out.charts);
        } else {
          var empty = document.createElement("div");
          empty.className = "chart-empty";
          empty.textContent = "Grafik tidak tersedia untuk mode ini.";
          charts.appendChild(empty);
        }
      }
    } catch (e) {
      /* Jangan biarkan angka/grafik lama tetap tampil di samping input baru
         yang gagal dihitung — itu mudah disalahartikan sebagai hasil valid. */
      showError(e && e.message ? e.message : String(e));
      renderResults([]);
      renderSteps([]);
      renderNotes([]);
      renderStatus("");
      var c = $("calc-charts");
      if (c) c.innerHTML = "";
    }
  }

  function buildTabs(active) {
    var tabs = $("mode-tabs");
    if (!tabs) return;
    tabs.innerHTML = "";
    Object.keys(MODES).forEach(function (key, i) {
      var btn = document.createElement("button");
      btn.className = "mode-tab";
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.dataset.mode = key;
      btn.setAttribute("aria-selected", key === active ? "true" : "false");
      btn.textContent = ("0" + (i + 1)).slice(-2) + "  " + MODES[key].label;
      btn.addEventListener("click", function () {
        Array.prototype.forEach.call(tabs.querySelectorAll(".mode-tab"), function (b) {
          b.setAttribute("aria-selected", b === btn ? "true" : "false");
        });
        clearOutput();
        hideError();
        buildForm(key);
        computeAndRender(true);
      });
      tabs.appendChild(btn);
    });
  }

  function applyValues(mode, json) {
    var vals;
    try { vals = JSON.parse(json || "{}"); } catch (e) { return; }
    /* kompatibilitas tautan lama: "policy":"floor" dst → centang checkbox kebijakan */
    if (mode === "keseimbangan" && vals.policy) {
      var pmap = {
        pajak: "pol_pajak", pajakprosen: "pol_persen", subsidi: "pol_subsidi",
        floor: "pol_floor", ceiling: "pol_ceiling", kuota: "pol_kuota"
      };
      if (pmap[vals.policy]) vals[pmap[vals.policy]] = true;
      delete vals.policy;
    }
    Object.keys(vals).forEach(function (k) {
      var el = $("f-" + mode + "-" + k);
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!vals[k];
      else el.value = String(vals[k]);
    });
    updateFieldVisibility(mode);
  }

  function switchMode(mode) {
    var tabs = $("mode-tabs");
    if (!tabs || !MODES[mode]) return false;
    Array.prototype.forEach.call(tabs.querySelectorAll(".mode-tab"), function (b) {
      b.setAttribute("aria-selected", b.dataset.mode === mode ? "true" : "false");
    });
    clearOutput();
    hideError();
    buildForm(mode);
    return true;
  }

  /* gambar ulang grafik ketika tema terang/gelap berganti (js/theme.js) */
  document.addEventListener("ek:themechange", function () {
    if (boundMode) computeAndRender(false);
  });

  /* tombol "Coba di kalkulator" di halaman lain → pindah + isi + hitung */
  function wirePrefill() {
    document.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-calc]") : null;
      if (!btn) return;
      ev.preventDefault();
      var mode = btn.getAttribute("data-calc");
      var json = btn.getAttribute("data-values") || "{}";
      if (!MODES[mode]) return;
      if (!$("mode-tabs")) {
        /* halaman non-kalkulator: pindah dulu sambil bawa parameter */
        location.href = "kalkulator.html?mode=" + encodeURIComponent(mode) +
          "&values=" + encodeURIComponent(json);
        return;
      }
      if (!switchMode(mode)) return;
      applyValues(mode, json);
      computeAndRender(true);
      var sec = $("kalkulator");
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function init() {
    wirePrefill();
    var tabs = $("mode-tabs");
    if (!tabs) return; /* halaman tanpa kalkulator: cukup tombol prefill */
    var params;
    try { params = new URLSearchParams(location.search); } catch (e) { params = null; }
    var mode = params ? params.get("mode") : null;
    if (!MODES[mode]) mode = Object.keys(MODES)[0];
    buildTabs(mode);
    buildForm(mode);
    if (params && params.get("values")) applyValues(mode, params.get("values"));
    hideError();
    computeAndRender(true);
  }

  /* API kecil untuk debugging / kebutuhan halaman lain */
  window.EKONOMI = { MODES: MODES, compute: function () { computeAndRender(true); }, switchMode: switchMode, applyValues: applyValues };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();