// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://ekonomi-mikro-fawn.vercel.app",
  // pertahankan URL lama: /kalkulator.html, /materi.html, dst.
  build: { format: "file" },
  devToolbar: { enabled: false },
});
