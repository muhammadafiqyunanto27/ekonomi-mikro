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
    var n = parseFloat(String((v === undefined || v === null ? "" : v)).replace(/\s/g, "").replace(",", "."));
    return isFinite(n) ? n : NaN;
  }
  function ok() {
    for (var i = 0; i < arguments.length; i++) {
      if (!isFinite(arguments[i])) return false;
    }
    return true;
  }
  /* akar real persamaan Ax^2 + Bx + C = 0 */
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
    lo = (lo === undefined ? 1e-6 : lo);
    hi = (hi === undefined ? 1 : hi);
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
    desc: "Qd = a − bP dan Qs = c + dP. Cari keseimbangan murni, lalu kombinasikan kebijakan apa pun sekaligus.",
    fields: [
      { id: "a", label: "Intersep permintaan (a)", def: 200 },
      { id: "b", label: "Kemiringan permintaan (b)", def: 10 },
      { id: "c", label: "Intersep penawaran (c)", def: -40 },
      { id: "d", label: "Kemiringan penawaran (d)", def: 5 },
      { heading: "Kebijakan pemerintah — boleh dikombinasikan" },
      { id: "pol_pajak", label: "Pajak per unit (t)", type: "check", def: false },
      { id: "t", label: "t =", def: 3, dep: true, when: function (v) { return v.pol_pajak; } },
      { id: "pol_persen", label: "Pajak persen (k %)", type: "check", def: false },
      { id: "k", label: "k (%) =", def: 20, dep: true, when: function (v) { return v.pol_persen; } },
      { id: "pol_subsidi", label: "Subsidi per unit (s)", type: "check", def: false },
      { id: "s", label: "s =", def: 3, dep: true, when: function (v) { return v.pol_subsidi; } },
      { id: "pol_floor", label: "Harga minimum / floor", type: "check", def: false },
      { id: "Pmin", label: "Pmin =", def: 18, dep: true, when: function (v) { return v.pol_floor; } },
      { id: "govBuy", label: "Pemerintah membeli kelebihan", type: "check", def: true, dep: true, when: function (v) { return v.pol_floor; } },
      { id: "pol_ceiling", label: "Harga maksimum / ceiling", type: "check", def: false },
      { id: "Pmax", label: "Pmax =", def: 12, dep: true, when: function (v) { return v.pol_ceiling; } },
      { id: "pol_kuota", label: "Kuota produksi (Q̄)", type: "check", def: false },
      { id: "Qbar", label: "Q̄ =", def: 30, dep: true, when: function (v) { return v.pol_kuota; } },
      { id: "surplus", label: "Tampilkan daerah surplus konsumen & produsen", def: true, type: "check" }
    ],
    compute: function (v) {
      var a = v.a, b = v.b, c = v.c, d = v.d;
      if (!ok(a, b, c, d)) throw "Isi keempat koefisien permintaan dan penawaran dengan angka.";
      if (!(b > 0) || !(d > 0)) throw "Koefisien b dan d harus lebih besar dari 0.";

      var onPajak = !!v.pol_pajak, onPersen = !!v.pol_persen, onSub = !!v.pol_subsidi;
      var onFloor = !!v.pol_floor, onCeil = !!v.pol_ceiling, onKuota = !!v.pol_kuota;
      var t = (onPajak ? v.t : 0), kpersen = (onPersen ? v.k : 0), s = (onSub ? v.s : 0);
      if (onPajak && !(t > 0)) throw "Pajak per unit (t) harus lebih besar dari 0.";
      if (onPersen && !(kpersen > 0)) throw "Pajak persen (k) harus lebih besar dari 0.";
      if (onSub && !(s > 0)) throw "Subsidi per unit (s) harus lebih besar dari 0.";
      var Pmin = v.Pmin, Pmax = v.Pmax, Qbar = v.Qbar;
      if (onFloor && !ok(Pmin)) throw "Isi besaran harga minimum (Pmin).";
      if (onCeil && !ok(Pmax)) throw "Isi besaran harga maksimum (Pmax).";
      if (onKuota && !(Qbar > 0)) throw "Kuota produksi (Q̄) harus lebih besar dari 0.";
      if (onFloor && onCeil && ok(Pmin, Pmax) && Pmin > Pmax) throw "Harga minimum lebih tinggi daripada harga maksimum.";

      var den = b + d;
      var Pe = (a - c) / den, Qe = a - b * Pe;
      var choke = a / b, Ps0 = -c / d;
      var hasFiscal = onPajak || onPersen || onSub;
      var w = t - s;
      var m = 1 + kpersen / 100;

      var Pb = Pe, Ps = Pe, Qt = Qe, Qprod = Qe;
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
        lines: ["Qd = " + nice(a) + " − " + nice(b) + "P", "Qs = " + nice(c) + " + " + nice(d) + "P"],
        why: "Empat angka dari kolom input membentuk fungsi linear pasar."
      });
      steps.push({
        label: "Keseimbangan murni: Qd = Qs",
        lines: [
          nice(a) + " − " + nice(b) + "P = " + nice(c) + " + " + nice(d) + "P",
          nice(a - c) + " = (" + nice(b) + " + " + nice(d) + ")P",
          nice(a - c) + " = " + nice(den) + "P",
          "P* = " + nice(a - c) + " / " + nice(den) + " = " + nice(Pe),
          "Q* = " + nice(a) + " − " + nice(b) + " × " + nice(Pe) + " = " + nice(Qe)
        ],
        result: "P* = " + nice(Pe) + " · Q* = " + nice(Qe),
        why: "Samakan Qd = Qs, kumpulkan P, bagi untuk dapat P*, lalu substitusikan untuk dapat Q*."
      });

      if (hasFiscal) {
        var psF = (a - c - b * w) / (d + b * m);
        var pbF = m * psF + w;
        var qF = a - b * pbF;
        steps.push({
          label: "Belah ketupat harga: Pb = m·Ps + w",
          lines: [
            "w = t − s = " + nice(w),
            "m = 1 + k/100 = " + nice(m),
            "Ps = " + nice(psF),
            "Pb = " + nice(pbF),
            "Q = " + nice(qF)
          ],
          result: "Pb = " + nice(pbF) + " · Ps = " + nice(psF) + " · Q = " + nice(qF)
        });
        Pb = pbF; Ps = psF; Qt = qF; Qprod = qF;
        wedge = Pb - Ps;
        rev = wedge * Qt;
      }

      if (onFloor) {
        floorBind = Pmin > Ps + 1e-9;
        if (floorBind) {
          var pbFl = m * Pmin + w;
          var qdF2 = a - b * pbFl, qsF2 = c + d * Pmin;
          excess = qsF2 - qdF2;
          excessType = excess >= 0 ? "supply" : "demand";
          Qt = v.govBuy ? qsF2 : Math.min(qdF2, qsF2);
          Qprod = v.govBuy ? qsF2 : Qt;
          govCost = (v.govBuy && excess > 0) ? Pmin * excess : 0;
          Pb = pbFl; Ps = Pmin; wedge = Pb - Ps; rev = wedge * Qt;
          steps.push({
            label: "Floor mengikat: Pmin = " + nice(Pmin),
            lines: [
              "Qd = " + nice(qdF2),
              "Qs = " + nice(qsF2),
              excess >= 0 ? "Kelebihan penawaran = " + nice(excess) : "Kelangkaan = " + nice(Math.abs(excess))
            ],
            result: "Pb = " + nice(pbFl) + " · Ps = " + nice(Pmin)
          });
        }
      }

      if (onCeil) {
        ceilBind = Pmax < Pb - 1e-9;
        if (ceilBind) {
          var pc = Pmax;
          var qdC2 = a - b * pc;
          var psC2 = (pc - w) / m;
          var qsC2 = c + d * psC2;
          Qt = Math.min(qdC2, qsC2); Qprod = Qt;
          Pb = pc; Ps = psC2;
          excess = qdC2 - qsC2; excessType = "demand";
          steps.push({
            label: "Ceiling mengikat: Pmax = " + nice(pc),
            lines: ["Qd = " + nice(qdC2), "Qs = " + nice(qsC2), "Kelangkaan = " + nice(Math.max(0, qdC2 - qsC2))],
            result: "Pb = " + nice(pc) + " · Ps = " + nice(psC2)
          });
        }
      }

      if (onKuota) {
        if (Qbar < Qt - 1e-9) {
          var pq2 = Qbar;
          var pbQ2 = (a - pq2) / b;
          var psQ2 = (pq2 - c) / d;
          Qt = pq2; Qprod = pq2; Pb = pbQ2; Ps = psQ2;
          kuotaBind = true;
          steps.push({
            label: "Kuota mengikat: Q̄ = " + nice(pq2),
            lines: ["Pb = " + nice(pbQ2), "Ps = " + nice(psQ2)],
            result: "Q = " + nice(pq2)
          });
        }
      }

      var Qcs2 = Math.max(Math.min(Qt, a - b * Pb), 0);
      var Qps2 = Qprod;
      function csv2(Q) { return Q <= 0 ? 0 : (a * Q - (Q * Q) / 2) / b - Pb * Q; }
      function psv2(Q) { return Q <= 0 ? 0 : Ps * Q - ((Q * Q) / 2 - c * Q) / d; }
      var CS2 = csv2(Qcs2), PS2 = psv2(Qps2);
      var DWL2 = 0;
      if (Qt < Qe && Pb >= Ps) {
        var pdQ2 = (a - Qt) / b, psQd2 = (Qt - c) / d;
        DWL2 = 0.5 * (pdQ2 - psQd2) * (Qe - Qt);
        if (DWL2 < 0) DWL2 = 0;
      }

      steps.push({
        label: "Surplus",
        lines: ["CS = " + nice(CS2), "PS = " + nice(PS2), "DWL = " + nice(DWL2)],
        result: "CS+PS = " + nice(CS2 + PS2)
      });

      var results = [
        { label: "P*", value: nice(Pe), hero: true },
        { label: "Q*", value: nice(Qe), hero: true },
        { label: "Pb", value: nice(Pb) },
        { label: "Ps", value: nice(Ps) },
        { label: "Q", value: nice(Qt) },
        { label: "CS", value: nice(CS2) },
        { label: "PS", value: nice(PS2) },
        { label: "DWL", value: nice(DWL2) }
      ];

      var yTop2 = Math.max(choke, Pb, Ps, 1) * 1.1;
      var xTop2 = Math.max(a, Qt * 1.2, 1) * 1.05;
      var charts = [{
        title: "Keseimbangan pasar",
        sub: "E = keseimbangan murni",
        xLabel: "Kuantitas (Q)", yLabel: "Harga (P)",
        xDomain: [0, xTop2], yDomain: [0, yTop2],
        series: [
          { label: "Qd", color: "demand", pts: [[0, choke], [a, 0]] },
          { label: "Qs", color: "supply", pts: [[c, 0], [c + d * yTop2, yTop2]] }
        ],
        points: [
          { x: Qe, y: Pe, color: "ink", label: "E" },
          { x: Qt, y: Pb, color: "blue", label: "Q'" }
        ]
      }];

      return { steps: steps, results: results, notes: notes, status: policies.length ? "Kebijakan: " + policies.join(" + ") : "Tanpa kebijakan", charts: charts };
    }
  };

  /* Simple other modes placeholder minimal */
  MODES.elastisitas = { label: "Elastisitas", title: "Elastisitas", desc: "", fields: [], compute: function(){ return {steps:[], results:[], notes:[], status:"", charts:[]}; } };
  MODES.surplus = { label: "Surplus Ekonomi", title: "Surplus", desc: "", fields: [], compute: function(){ return {steps:[], results:[], notes:[], status:"", charts:[]}; } };
  MODES.utilitas = { label: "Utilitas Konsumen", title: "Utilitas", desc: "", fields: [], compute: function(){ return {steps:[], results:[], notes:[], status:"", charts:[]}; } };
  MODES.produksi = { label: "Produksi (TP/MP/AP)", title: "Produksi", desc: "", fields: [], compute: function(){ return {steps:[], results:[], notes:[], status:"", charts:[]}; } };
  MODES.biaya = { label: "Biaya Produksi", title: "Biaya", desc: "", fields: [], compute: function(){ return {steps:[], results:[], notes:[], status:"", charts:[]}; } };
  MODES.laba = { label: "Laba Maksimum", title: "Laba", desc: "", fields: [], compute: function(){ return {steps:[], results:[], notes:[], status:"", charts:[]}; } };
  MODES.diskriminasi = { label: "Diskriminasi Harga", title: "Diskriminasi", desc: "", fields: [], compute: function(){ return {steps:[], results:[], notes:[], status:"", charts:[]}; } };

  function $(id) { return document.getElementById(id); }
  function clearOutput() {
    ["calc-results", "calc-steps", "calc-notes", "calc-charts"].forEach(function (id) {
      var el = $(id); if (el) el.innerHTML = "";
    });
    var st = $("calc-status"); if (st) st.innerHTML = "";
  }
  function renderResults(results) {
    var el = $("calc-results"); if (!el) return; el.innerHTML = "";
    (results || []).forEach(function (r) {
      var d = document.createElement("div");
      d.className = "result" + (r.hero ? " hero-result" : "");
      d.innerHTML = '<span class="rlabel">' + (r.label||"") + '</span><span class="rvalue">' + (r.value||"") + (r.sub?'<small class="rsub">'+r.sub+'</small>':'') + '</span>';
      el.appendChild(d);
    });
  }
  function renderSteps(steps) {
    var el = $("calc-steps"); if (!el) return; el.innerHTML = "";
    (steps || []).forEach(function (st) {
      var li = document.createElement("li");
      var html = "";
      var tag = typeof st.result === "string" && st.result ? st.result : "";
      if (st.label || tag) {
        html += '<div class="st-head"><span class="st-label">' + (st.label||"") + '</span>' + (tag?'<span class="st-tag">'+tag+'</span>':'') + '</div>';
      }
      if (st.lines && st.lines.length) {
        html += '<div class="st-lines">' + st.lines.map(function (ln) {
          if (ln && typeof ln === "object") return '<span class="st-line">'+(ln.left||'')+'</span>' + (ln.note?'<span class="st-note">'+ln.note+'</span>':'');
          return '<span class="st-line">'+ln+'</span>';
        }).join(" ") + '</div>';
      }
      if (st.why) html += '<p class="st-why">'+st.why+'</p>';
      li.innerHTML = html; el.appendChild(li);
    });
  }
  function renderNotes(notes) {
    var el = $("calc-notes"); if (!el) return; el.innerHTML = "";
    (notes||[]).forEach(function(n){ var d=document.createElement("div"); d.className="note"; d.innerHTML=n; el.appendChild(d); });
  }
  function renderStatus(s){ var el=$("calc-status")||$("calc-desc"); if(el) el.innerHTML=s||""; }
  function showError(m){ var el=$("calc-error"); if(!el)return; el.hidden=false; el.textContent=m; }
  function hideError(){ var el=$("calc-error"); if(!el)return; el.hidden=true; el.textContent=""; }

  var boundMode=null, recomputeTimer=null;
  function currentValues(id){
    var m=MODES[id], out={}; if(!m)return out;
    m.fields.forEach(function(f){
      var el=$("f-"+id+"-"+f.id); if(!el)return;
      if(f.type==="check") out[f.id]=el.checked;
      else if(f.type==="select") out[f.id]=el.value;
      else out[f.id]=parseVal(el.value);
    });
    return out;
  }
  function updateFieldVisibility(id){
    var m=MODES[id]; if(!m)return;
    var vals=currentValues(id);
    m.fields.forEach(function(f){
      var wrap=$("w-"+id+"-"+f.id); if(!wrap)return;
      var show=true;
      if(typeof f.when==="function"){ try{ show=!!f.when(vals);}catch(e){show=true;}}
      wrap.classList.toggle("hidden",!show);
      var el=$("f-"+id+"-"+f.id); if(el) el.disabled=!show;
    });
  }
  function buildForm(id){
    var m=MODES[id], form=$("calc-form"); if(!m||!form)return;
    boundMode=id;
    var title=$("calc-title"), desc=$("calc-desc");
    if(title) title.textContent=m.title||m.label;
    if(desc) desc.textContent=m.desc||"";
    form.innerHTML="";
    form.setAttribute("data-mode",id);
    var legend=document.createElement("p"); legend.className="form-legend"; legend.textContent="Isi angka di bawah."; form.appendChild(legend);
    m.fields.forEach(function(f){
      if(f.heading){ var gh=document.createElement("p"); gh.className="form-group"; gh.textContent=f.heading; form.appendChild(gh); return; }
      var wrap=document.createElement("div"); wrap.className="field"+(f.dep?" dep":""); wrap.id="w-"+id+"-"+f.id;
      if(f.type==="check"){
        wrap.classList.add("check");
        var cb=document.createElement("input"); cb.type="checkbox"; cb.id="f-"+id+"-"+f.id; cb.checked=!!f.def;
        var cl=document.createElement("label"); cl.setAttribute("for",cb.id); cl.innerHTML=f.label;
        wrap.appendChild(cb); wrap.appendChild(cl); form.appendChild(wrap); return;
      }
      var label=document.createElement("label"); label.setAttribute("for","f-"+id+"-"+f.id); label.innerHTML=f.label; wrap.appendChild(label);
      if(f.type==="select"){
        var sel=document.createElement("select"); sel.id="f-"+id+"-"+f.id;
        (f.options||[]).forEach(function(o){ var opt=document.createElement("option"); opt.value=o[0]; opt.textContent=o[1]; sel.appendChild(opt); });
        if(f.def!==undefined) sel.value=String(f.def);
        wrap.appendChild(sel);
      }else{
        var inp=document.createElement("input"); inp.type="text"; inp.setAttribute("inputmode","decimal"); inp.id="f-"+id+"-"+f.id; inp.value=f.def===undefined?"":String(f.def);
        wrap.appendChild(inp);
      }
      form.appendChild(wrap);
    });
    var act=document.createElement("div"); act.className="form-actions";
    var btnCalc=document.createElement("button"); btnCalc.className="btn"; btnCalc.type="button"; btnCalc.textContent="Hitung"; btnCalc.addEventListener("click",function(){computeAndRender(true);});
    var btnReset=document.createElement("button"); btnReset.className="btn btn-line"; btnReset.type="button"; btnReset.textContent="Reset"; btnReset.addEventListener("click",function(){clearOutput();buildForm(boundMode);computeAndRender(true);});
    act.appendChild(btnCalc); act.appendChild(btnReset); form.appendChild(act);
    if(!form.dataset.bound){ form.dataset.bound="1"; form.addEventListener("input",function(){if(!boundMode)return;updateFieldVisibility(boundMode);clearTimeout(recomputeTimer);recomputeTimer=setTimeout(function(){computeAndRender(false);},200);}); form.addEventListener("change",function(){if(!boundMode)return;updateFieldVisibility(boundMode);computeAndRender(false);}); }
    updateFieldVisibility(id);
  }
  function computeAndRender(force){
    var id=boundMode, m=MODES[id], form=$("calc-form"); if(!m||!m.compute||!form)return;
    hideError(); updateFieldVisibility(id); var vals=currentValues(id);
    try{
      var out=m.compute(vals);
      renderResults(out.results); renderSteps(out.steps); renderNotes(out.notes||[]); renderStatus(out.status||"");
      var charts=$("calc-charts"); if(charts){ charts.innerHTML=""; if(out.charts&&out.charts.length){ window.Charts.render(charts,out.charts); } }
    }catch(e){ showError(e&&e.message?e.message:String(e)); if(force){ renderResults([]); renderSteps([]); renderNotes([]); renderStatus(""); var c=$("calc-charts"); if(c)c.innerHTML=""; } }
  }
  function buildTabs(active){
    var tabs=$("mode-tabs"); if(!tabs)return; tabs.innerHTML="";
    var keys=Object.keys(MODES);
    keys.forEach(function(key,i){
      var btn=document.createElement("button"); btn.className="mode-tab"; btn.type="button"; btn.dataset.mode=key; btn.setAttribute("aria-selected",key===active?"true":"false");
      btn.textContent=("0"+(i+1)).slice(-2)+"  "+MODES[key].label;
      btn.addEventListener("click",function(){ Array.prototype.forEach.call(tabs.querySelectorAll(".mode-tab"),function(b){b.setAttribute("aria-selected",b===btn?"true":"false");}); clearOutput(); hideError(); buildForm(key); computeAndRender(true); });
      tabs.appendChild(btn);
    });
  }
  function init(){
    var tabs=$("mode-tabs"); if(!tabs)return;
    var mode="keseimbangan";
    buildTabs(mode); buildForm(mode); hideError(); computeAndRender(true);
  }
  window.EKONOMI={MODES:MODES};
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();
