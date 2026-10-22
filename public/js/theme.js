/* =========================================================================
   theme.js — sakelar mode terang / gelap untuk seluruh halaman.
   - Elemen boot di <head> setiap halaman menerapkan tema tersimpan sebelum
     halaman dicat (menghindari kedip putih), lalu berkas ini mengaktifkan
     tombolnya.
   - Tema disimpan di localStorage ("ek-theme"); tanpa penyimpanan (mode
     privat) tetap jalan, hanya tidak diingat.
   - app.js mendengarkan event "ek:themechange" untuk menggambar ulang
     grafik dengan warna tema yang baru.
   ========================================================================= */
(function () {
  "use strict";

  var root = document.documentElement;
  var KEY = "ek-theme";

  function get() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function apply(t) {
    if (t === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    try { localStorage.setItem(KEY, t); } catch (e) { /* mode privat: abaikan */ }
    sync();
    try {
      document.dispatchEvent(new CustomEvent("ek:themechange", { detail: { theme: t } }));
    } catch (e) { /* peramban sangat lama: abaikan */ }
  }

  function sync() {
    var t = get();
    var btns = document.querySelectorAll("[data-theme-toggle]");
    Array.prototype.forEach.call(btns, function (b) {
      b.setAttribute("aria-pressed", t === "dark" ? "true" : "false");
      var txt = b.querySelector(".theme-btn-txt");
      if (txt) txt.textContent = t === "dark" ? "Terang" : "Gelap";
    });
  }

  function init() {
    document.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest("[data-theme-toggle]") : null;
      if (!b) return;
      apply(get() === "dark" ? "light" : "dark");
    });
    sync();
  }

  window.EK_THEME = { get: get, apply: apply };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
