/* =========================================================================
   charts.js — mesin grafik SVG sederhana, tanpa pustaka eksternal.
   Dipakai oleh app.js: Charts.render(elemen, [spec, spec, ...])
   spec = {
     title, sub, xLabel, yLabel, yLabel2,
     xDomain:[min,max], yDomain:[min,max], yDomain2:[min,max],
     series:[{label, pts:[[x,y],...] | fn, xRange:[a,b], n, color, dash, width, axis:1|2}],
     regions:[{pts:[[x,y],...], color, opacity, label}],
     points:[{x,y,label,color,dx,dy}],
     hlines:[{y,label,color,dash}],
     vlines:[{x,label,color,dash}]
   }
   ========================================================================= */
(function () {
  "use strict";

  var FALLBACK = {
    demand: "#b4432e",
    supply: "#1e5f45",
    accent: "#1e5f45",
    blue: "#2a4b7c",
    amber: "#9a6a12",
    ink: "#17140f",
    muted: "#8b857c"
  };

  var MONO = "Consolas, 'Cascadia Mono', 'Courier New', monospace";

  /* warna diambil dari token CSS saat grafik digambar — otomatis mengikuti
     mode terang/gelap (js/theme.js), dan tetap jalan tanpa token (fallback) */
  function cssVar(name, fb) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      v = v && v.replace(/^\s+|\s+$/g, "");
      return v || fb;
    } catch (e) { return fb; }
  }

  var VAR_OF = {
    demand: "--demand", supply: "--accent", accent: "--accent",
    blue: "--blue", amber: "--amber", ink: "--ink", muted: "--ink-3"
  };

  function col(c) {
    var key = c || "ink";
    if (VAR_OF[key]) return cssVar(VAR_OF[key], FALLBACK[key]);
    return key;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  /* angka gaya Indonesia: 1.234,56 */
  function fmt(v, dec) {
    if (v === null || v === undefined || !isFinite(v)) return "—";
    if (dec === undefined) {
      var a = Math.abs(v);
      dec = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 4;
    }
    try {
      return Number(v).toLocaleString("id-ID", { maximumFractionDigits: dec, minimumFractionDigits: 0 });
    } catch (e) {
      return String(Math.round(v * 1e4) / 1e4);
    }
  }

  function niceTicks(min, max, count) {
    var span = max - min;
    if (!(span > 0) || !isFinite(span)) return [min];
    var raw = span / (count || 6);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    step *= mag;
    var out = [];
    var v = Math.ceil(min / step) * step;
    for (var i = 0; v <= max + step * 1e-6 && out.length < 40; i++, v += step) {
      out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    }
    return out;
  }

  var uid = 0;

  function resolvePts(s) {
    if (s.pts) return s.pts;
    if (typeof s.fn !== "function") return [];
    var r = s.xRange || [0, 1];
    var n = s.n || 90;
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var x = r[0] + (r[1] - r[0]) * (i / n);
      var y = s.fn(x);
      if (isFinite(y)) pts.push([x, y]);
    }
    return pts;
  }

  function bounds(spec) {
    var xs = [], ys = [], ys2 = [];
    (spec.series || []).forEach(function (s) {
      resolvePts(s).forEach(function (p) {
        xs.push(p[0]);
        (s.axis === 2 ? ys2 : ys).push(p[1]);
      });
    });
    (spec.regions || []).forEach(function (r) {
      (r.pts || []).forEach(function (p) { xs.push(p[0]); ys.push(p[1]); });
    });
    (spec.points || []).forEach(function (p) { xs.push(p.x); ys.push(p.y); });
    (spec.hlines || []).forEach(function (l) { ys.push(l.y); });
    (spec.vlines || []).forEach(function (l) { xs.push(l.x); });

    function pad(arr, fallback) {
      var ok = arr.filter(function (v) { return isFinite(v); });
      if (!ok.length) return fallback;
      return [Math.min.apply(null, ok), Math.max.apply(null, ok)];
    }
    function round(v, up) {
      if (!isFinite(v)) return up ? 1 : 0;
      var a = Math.abs(v);
      if (a === 0) return 0;
      var mag = Math.pow(10, Math.floor(Math.log(a) / Math.LN10));
      var n = v / mag;
      var k = up ? (n <= 1 ? 1 : n <= 1.2 ? 1.2 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10)
                 : (n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10);
      return k * mag;
    }

    var xb = pad(xs, [0, 1]), yb = pad(ys, [0, 1]);
    var xd = spec.xDomain || [Math.min(0, xb[0]), round(xb[1] * 1.08, true)];
    var yd = spec.yDomain || [Math.min(0, yb[0]), round(yb[1] * 1.08, true)];
    var yd2 = spec.yDomain2 || null;
    if (!yd2 && ys2.length) yd2 = [0, round(Math.max.apply(null, ys2) * 1.08, true)];
    /* jaga-jaga: domain tidak valid → jangan pernah hasilkan NaN di SVG */
    if (!isFinite(xd[0]) || !isFinite(xd[1]) || xd[1] <= xd[0]) xd = [0, 1];
    if (!isFinite(yd[0]) || !isFinite(yd[1]) || yd[1] <= yd[0]) yd = [0, 1];
    if (yd2 && (!isFinite(yd2[0]) || !isFinite(yd2[1]) || yd2[1] <= yd2[0])) yd2 = [0, 1];
    return { x: xd, y: yd, y2: yd2 };
  }

  function linePath(pts, sx, sy) {
    var d = "";
    for (var i = 0; i < pts.length; i++) {
      var X = sx(pts[i][0]), Y = sy(pts[i][1]);
      if (!isFinite(X) || !isFinite(Y)) continue;
      d += (d ? " L" : "M") + X.toFixed(2) + " " + Y.toFixed(2);
    }
    return d;
  }

  function desc(v) { return { label: v, x: 0, y: 0 }; }

  function label(anchors) {
    return function (x, y, text, color, size, weight) {
      return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
        '" font-family="' + MONO + '" font-size="' + (size || 11) + '" fill="' + col(color) +
        '"' + (weight ? ' font-weight="700"' : "") + '>' + esc(text) + "</text>";
    };
  }

  function render(container, specs) {
    container.innerHTML = "";
    (specs || []).forEach(function (spec) {
      container.appendChild(buildFigure(spec));
    });
  }

  function buildFigure(spec) {
    var W = 760, H = 440;
    var m = { l: 66, r: spec.yLabel2 ? 62 : 20, t: 30, b: 54 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var clipId = "clip" + ++uid;

    var b = bounds(spec);
    var xd = b.x, yd = b.y, yd2 = b.y2;

    function sx(v) {
      if (!isFinite(xd[0]) || !isFinite(xd[1]) || xd[1] === xd[0] || !isFinite(v)) return m.l;
      return m.l + ((v - xd[0]) / (xd[1] - xd[0])) * pw;
    }
    function sy(v) {
      if (!isFinite(yd[0]) || !isFinite(yd[1]) || yd[1] === yd[0] || !isFinite(v)) return m.t + ph / 2;
      return m.t + ph - ((v - yd[0]) / (yd[1] - yd[0])) * ph;
    }
    function sy2(v) {
      if (!yd2 || !isFinite(yd2[0]) || !isFinite(yd2[1]) || yd2[1] === yd2[0] || !isFinite(v)) return m.t + ph / 2;
      return m.t + ph - ((v - yd2[0]) / (yd2[1] - yd2[0])) * ph;
    }

    var out = [];
    out.push('<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' +
      esc(spec.title || "Grafik") + '">');
    out.push('<defs><clipPath id="' + clipId + '"><rect x="' + m.l + '" y="' + m.t + '" width="' + pw + '" height="' + ph + '"/></clipPath></defs>');

    /* bidang gambar */
    out.push('<rect x="' + m.l + '" y="' + m.t + '" width="' + pw + '" height="' + ph + '" fill="' + cssVar("--surface", "#fffdf8") + '" stroke="' + cssVar("--line", "#ded6c6") + '"/>');

    var xt = niceTicks(xd[0], xd[1], 7), yt = niceTicks(yd[0], yd[1], 6);
    var yt2 = yd2 ? niceTicks(yd2[0], yd2[1], 6) : [];

    /* grid */
    xt.forEach(function (v) {
      var X = sx(v);
      if (!isFinite(X) || X < m.l - 1 || X > m.l + pw + 1) return;
      out.push('<line x1="' + X.toFixed(1) + '" y1="' + m.t + '" x2="' + X.toFixed(1) + '" y2="' + (m.t + ph) + '" stroke="' + cssVar("--grid", "#eee7d8") + '"/>');
    });
    yt.forEach(function (v) {
      var Y = sy(v);
      if (!isFinite(Y) || Y < m.t - 1 || Y > m.t + ph + 1) return;
      out.push('<line x1="' + m.l + '" y1="' + Y.toFixed(1) + '" x2="' + (m.l + pw) + '" y2="' + Y.toFixed(1) + '" stroke="' + cssVar("--grid", "#eee7d8") + '"/>');
    });

    /* daerah (surplus, dwl, dll) */
    out.push('<g clip-path="url(#' + clipId + ')">');
    (spec.regions || []).forEach(function (r) {
      if (!r.pts || r.pts.length < 3) return;
      var d = "";
      r.pts.forEach(function (p) {
        var X = sx(p[0]), Y = sy(p[1]);
        if (!isFinite(X) || !isFinite(Y)) return;
        d += (d ? " L" : "M") + X.toFixed(1) + " " + Y.toFixed(1);
      });
      if (d) out.push('<path d="' + d + ' Z" fill="' + col(r.color) + '" opacity="' + (r.opacity || 0.16) + '"/>');
    });
    out.push("</g>");

    /* sumbu — berpotongan di 0 bila domain memuat nilai negatif,
       supaya kurva bisa diteruskan ke daerah Q/P di bawah nol */
    var EPS = 1e-9;
    var xAxisInside = yd[0] < -EPS && yd[1] > EPS;
    var yAxisInside = xd[0] < -EPS && xd[1] > EPS;
    var xAxisY = xAxisInside ? sy(0) : m.t + ph;
    var yAxisX = yAxisInside ? sx(0) : m.l;

    out.push('<line x1="' + m.l + '" y1="' + xAxisY.toFixed(1) + '" x2="' + (m.l + pw) + '" y2="' + xAxisY.toFixed(1) + '" stroke="' + cssVar("--ink", "#17140f") + '" stroke-width="1.5"/>');
    out.push('<line x1="' + yAxisX.toFixed(1) + '" y1="' + m.t + '" x2="' + yAxisX.toFixed(1) + '" y2="' + (m.t + ph) + '" stroke="' + cssVar("--ink", "#17140f") + '" stroke-width="1.5"/>');

    /* panah kecil di ujung sumbu */
    out.push('<path d="M' + (m.l + pw - 7) + ' ' + (xAxisY - 4).toFixed(1) + ' L' + (m.l + pw) + ' ' + xAxisY.toFixed(1) +
      ' L' + (m.l + pw - 7) + ' ' + (xAxisY + 4).toFixed(1) + '" fill="none" stroke="' + cssVar("--ink", "#17140f") + '" stroke-width="1.5"/>');
    out.push('<path d="M' + (yAxisX - 4).toFixed(1) + ' ' + (m.t + 7) + ' L' + yAxisX.toFixed(1) + ' ' + m.t +
      ' L' + (yAxisX + 4).toFixed(1) + ' ' + (m.t + 7) + '" fill="none" stroke="' + cssVar("--ink", "#17140f") + '" stroke-width="1.5"/>');

    xt.forEach(function (v) {
      var X = sx(v);
      if (!isFinite(X) || X < m.l - 1 || X > m.l + pw + 1) return;
      out.push('<line x1="' + X.toFixed(1) + '" y1="' + (xAxisY - 3).toFixed(1) + '" x2="' + X.toFixed(1) + '" y2="' + (xAxisY + 4).toFixed(1) + '" stroke="' + cssVar("--ink", "#17140f") + '"/>');
      out.push('<text x="' + X.toFixed(1) + '" y="' + (xAxisY + 17).toFixed(1) + '" font-family="' + MONO +
        '" font-size="10.5" fill="' + cssVar("--ink-2", "#55504a") + '" text-anchor="middle">' + esc(fmt(v)) + "</text>");
    });
    yt.forEach(function (v) {
      var Y = sy(v);
      if (!isFinite(Y) || Y < m.t - 1 || Y > m.t + ph + 1) return;
      /* angka 0 cukup sekali: ikut label sumbu-x bila 0 ada di domain-x */
      if (Math.abs(v) < EPS && xd[0] <= 0 && xd[1] >= 0) return;
      out.push('<line x1="' + (yAxisX - 4).toFixed(1) + '" y1="' + Y.toFixed(1) + '" x2="' + (yAxisX + 1).toFixed(1) + '" y2="' + Y.toFixed(1) + '" stroke="' + cssVar("--ink", "#17140f") + '"/>');
      out.push('<text x="' + (yAxisX - 7).toFixed(1) + '" y="' + (Y + 3.5).toFixed(1) + '" font-family="' + MONO +
        '" font-size="10.5" fill="' + cssVar("--ink-2", "#55504a") + '" text-anchor="end">' + esc(fmt(v)) + "</text>");
    });
    if (yd2) {
      yt2.forEach(function (v) {
        var Y = sy2(v);
        if (!isFinite(Y) || Y < m.t - 1 || Y > m.t + ph + 1) return;
        out.push('<text x="' + (m.l + pw + 7) + '" y="' + (Y + 3.5).toFixed(1) + '" font-family="' + MONO +
          '" font-size="10.5" fill="' + cssVar("--ink-2", "#55504a") + '" text-anchor="start">' + esc(fmt(v)) + "</text>");
      });
    }

    /* label sumbu */
    var xLabY = xAxisInside ? xAxisY + 34 : m.t + ph + 38;
    out.push('<text x="' + (m.l + pw) + '" y="' + xLabY.toFixed(1) + '" font-family="' + MONO +
      '" font-size="11.5" fill="' + cssVar("--ink", "#17140f") + '" text-anchor="end">' + esc(spec.xLabel || "Kuantitas (Q)") + "</text>");
    var yLabX = yAxisInside ? Math.max(m.l + 6, yAxisX - 38) : m.l - 48;
    out.push('<text transform="translate(' + yLabX + ',' + m.t + ') rotate(-90)" font-family="' + MONO +
      '" font-size="11.5" fill="' + cssVar("--ink", "#17140f") + '" text-anchor="end">' + esc(spec.yLabel || "Harga (P)") + "</text>");
    if (yd2) {
      out.push('<text transform="translate(' + (m.l + pw + 56) + ',' + m.t + ') rotate(-90)" font-family="' + MONO +
        '" font-size="11.5" fill="' + cssVar("--ink", "#17140f") + '" text-anchor="end">' + esc(spec.yLabel2) + "</text>");
    }

    /* garis bantu kebijakan */
    (spec.hlines || []).forEach(function (l) {
      var Y = sy(l.y);
      if (!isFinite(Y) || Y < m.t - 2 || Y > m.t + ph + 2) return;
      out.push('<line x1="' + m.l + '" y1="' + Y.toFixed(1) + '" x2="' + (m.l + pw) + '" y2="' + Y.toFixed(1) +
        '" stroke="' + col(l.color || "blue") + '" stroke-width="1.4" stroke-dasharray="' + (l.dash === false ? "0" : "7 4") + '"/>');
      if (l.label) {
        out.push('<text x="' + (m.l + 6) + '" y="' + (Y - 5).toFixed(1) + '" font-family="' + MONO +
          '" font-size="10.5" fill="' + col(l.color || "blue") + '">' + esc(l.label) + "</text>");
      }
    });
    (spec.vlines || []).forEach(function (l, li) {
      var X = sx(l.x);
      if (!isFinite(X) || X < m.l - 2 || X > m.l + pw + 2) return;
      out.push('<line x1="' + X.toFixed(1) + '" y1="' + m.t + '" x2="' + X.toFixed(1) + '" y2="' + (m.t + ph) +
        '" stroke="' + col(l.color || "ink") + '" stroke-width="1.2" stroke-dasharray="' + (l.dash === false ? "0" : "5 4") + '"/>');
      if (l.label) {
        /* label digeser bertingkat supaya garis Q*, Q′, Qd, Qs tidak saling menimpa */
        var ly = m.t + 12 + (li % 5) * 13;
        out.push('<text x="' + (X + 5).toFixed(1) + '" y="' + ly + '" font-family="' + MONO +
          '" font-size="10.5" fill="' + col(l.color || "ink") + '">' + esc(l.label) + "</text>");
      }
    });

    /* kurva */
    out.push('<g clip-path="url(#' + clipId + ')">');
    (spec.series || []).forEach(function (s) {
      var pts = resolvePts(s);
      if (!pts.length) return;
      var ymap = s.axis === 2 && yd2 ? sy2 : sy;
      var dash = s.dash ? ' stroke-dasharray="7 5"' : "";
      out.push('<path d="' + linePath(pts, sx, ymap) + '" fill="none" stroke="' + col(s.color) +
        '" stroke-width="' + (s.width || 2.2) + '"' + dash + ' stroke-linejoin="round"/>');
    });
    out.push("</g>");

    /* titik penanda */
    (spec.points || []).forEach(function (p) {
      var X = sx(p.x), Y = sy(p.y);
      if (!isFinite(X) || !isFinite(Y)) return;
      out.push('<circle cx="' + X.toFixed(1) + '" cy="' + Y.toFixed(1) + '" r="4.5" fill="' + col(p.color || "ink") +
        '" stroke="' + cssVar("--surface", "#fffdf8") + '" stroke-width="1.6"/>');
      if (p.label) {
        var tx = X + (p.dx === undefined ? 9 : p.dx);
        var ty = Y + (p.dy === undefined ? -9 : p.dy);
        var anchor = "start";
        if (tx > m.l + pw - 8) { anchor = "end"; tx = X - 9; }
        out.push('<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" font-family="' + MONO +
          '" font-size="11" font-weight="700" fill="' + col(p.color || "ink") + '" text-anchor="' + anchor +
          '" stroke="' + cssVar("--surface", "#fffdf8") + '" stroke-width="3" paint-order="stroke">' + esc(p.label) + "</text>");
      }
    });

    out.push("</svg>");

    /* legend */
    var legend = (spec.series || []).filter(function (s) { return s.label; });
    var legendHtml = "";
    if (legend.length) {
      legendHtml = '<div class="chart-legend">' + legend.map(function (s) {
        return '<span class="lg"><span class="sw" style="background:' + col(s.color) + ';' +
          (s.dash ? "opacity:.55" : "") + '"></span>' + esc(s.label) + "</span>";
      }).join("") + "</div>";
    }

    var fig = document.createElement("figure");
    fig.className = "chart-card";
    fig.innerHTML =
      '<figcaption><span class="ct">' + esc(spec.title || "Grafik") + "</span>" +
      (spec.sub ? "<span>" + esc(spec.sub) + "</span>" : "") + "</figcaption>" +
      out.join("") + legendHtml;
    return fig;
  }

  window.Charts = { render: render, fmt: fmt };
})();
