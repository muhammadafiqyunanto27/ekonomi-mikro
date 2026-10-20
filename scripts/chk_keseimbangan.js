/* uji cepat mesin keseimbangan multi-kebijakan — node scripts/chk_keseimbangan.js */
global.window = {
  location: { search: "" },
  Charts: {
    fmt: function (v, dec) {
      if (typeof v !== "number" || !isFinite(v)) return String(v);
      return v.toLocaleString("id-ID", { maximumFractionDigits: dec === undefined ? 4 : dec, minimumFractionDigits: 0 });
    }
  }
};
global.document = { readyState: "loading", addEventListener: function () {} };
require("../js/app.js");
var K = global.window.EKONOMI.MODES.keseimbangan;

function nums(res) {
  var m = {};
  (res.results || []).forEach(function (r) { m[r.label] = r.value; });
  return m;
}
function run(name, v, expect) {
  var res, err = null;
  try { res = K.compute(v); } catch (e) { err = String(e); }
  if (err) { console.log("[" + name + "] ERROR: " + err); return; }
  var n = nums(res);
  console.log("[" + name + "] " + JSON.stringify(n));
  console.log("  status: " + res.status);
  console.log("  steps: " + res.steps.length + " | ada why: " +
    res.steps.filter(function (s) { return !!s.why; }).length +
    " | tag hasil: " + res.steps.filter(function (s) { return typeof s.result === "string"; }).length);
  if (expect) {
    Object.keys(expect).forEach(function (k) {
      var got = n[k];
      var want = expect[k];
      var pass = typeof want === "number" ? Math.abs(parseFloat(String(got).replace(/\./g, "").replace(",", ".")) - want) < 0.011 : String(got).indexOf(want) >= 0;
      console.log("  " + (pass ? "OK  " : "GAGAL") + " | " + k + " = " + got + " (harus " + want + ")");
    });
  }
  console.log("  grafik: " + res.charts.map(function (c) {
    return c.title + " || " + c.sub + " || seri: " + c.series.map(function (s) { return s.label; }).join(" ; ");
  }).join(" / "));
}

/* 1. default tanpa kebijakan */
run("murni", { a: 200, b: 10, c: -40, d: 5, surplus: true },
  { "Harga keseimbangan P*": 16, "Kuantitas keseimbangan Q*": 40, "Surplus konsumen": 80, "Surplus produsen": 160 });

/* 2. floor mengikat + beli pemerintah */
run("floor18", { a: 200, b: 10, c: -40, d: 5, surplus: true, pol_floor: true, Pmin: 18, govBuy: true },
  { "Kelebihan penawaran": 30, "Biaya pembelian pemerintah": 540 });

/* 3. pajak per unit */
run("pajak125", { a: 200, b: 10, c: -40, d: 5, surplus: true, pol_pajak: true, t: 1.25 },
  { "Harga dibayar pembeli (Pb)": 16.4166667, "Penerimaan pemerintah": 44.7916667, "Surplus konsumen": 64.2013889 });

/* 4. gabah (prefill kasus) */
run("gabah", { a: 2000, b: 3, c: -500, d: 2, surplus: true, pol_floor: true, Pmin: 600, govBuy: true },
  { "Kelebihan penawaran": 500, "Biaya pembelian pemerintah": 300000 });

/* 5. mie (prefill kasus) */
run("mie", { a: 20000, b: 5, c: -5000, d: 20, surplus: true, pol_ceiling: true, Pmax: 750 },
  { "Kelangkaan": 6250 });

/* 6. kombinasi pajak + floor */
run("pajak+floor", { a: 200, b: 10, c: -40, d: 5, surplus: true, pol_pajak: true, t: 3, pol_floor: true, Pmin: 14, govBuy: false },
  { "Harga diterima penjual (Ps)": 14, "Harga dibayar pembeli (Pb)": 17 });

/* 7. subsidi + pajak persen */
run("sub+persen", { a: 200, b: 10, c: -40, d: 5, surplus: true, pol_subsidi: true, s: 2, pol_persen: true, k: 20 },
  { "Harga diterima penjual (Ps)": 15.2941176, "Harga dibayar pembeli (Pb)": 16.3529412 });

/* 8. kuota mengikat */
run("kuota20", { a: 200, b: 10, c: -40, d: 5, surplus: true, pol_kuota: true, Qbar: 20 },
  { "Kuantitas setelah kebijakan": 20, "Harga dibayar pembeli (Pb)": 18, "Harga diterima penjual (Ps)": 12 });

/* 9. ceiling tidak mengikat */
run("ceiling20", { a: 200, b: 10, c: -40, d: 5, surplus: true, pol_ceiling: true, Pmax: 20 },
  { "Harga keseimbangan P*": 16, "Kuantitas setelah kebijakan": 40 });

/* 10. pajak + floor + kuota sekaligus */
run("pajak+floor+kuota", { a: 200, b: 10, c: -40, d: 5, surplus: true, pol_pajak: true, t: 2, pol_floor: true, Pmin: 15, govBuy: true, pol_kuota: true, Qbar: 25 },
  { "Kuantitas setelah kebijakan": 25 });
