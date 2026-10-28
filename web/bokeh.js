// Trial: candlelight bokeh orbs. Switch: open the page with ?bokeh=off or ?bokeh=on (remembered).
// Kill it for good by deleting the <script src="bokeh.js"> line in index.html.
(() => {
  const q = new URLSearchParams(location.search).get("bokeh");
  if (q === "on" || q === "off") localStorage.setItem("seance.bokeh", q);
  if (localStorage.getItem("seance.bokeh") === "off") return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const layer = document.createElement("div");
  layer.id = "bokeh";
  layer.setAttribute("aria-hidden", "true");
  // Orbs live in the side margins so the chat column stays clear.
  const N = 12;
  for (let i = 0; i < N; i++) {
    const o = document.createElement("i");
    const left = i % 2 === 0;
    const x = left ? 1 + ((i * 7) % 16) : 83 + ((i * 5) % 15);
    const size = 40 + ((i * 37) % 70);
    const dur = 36 + ((i * 11) % 25);
    o.style.cssText =
      `left:${x}%;top:${8 + ((i * 29) % 80)}%;width:${size}px;height:${size}px;` +
      `--o:${(0.06 + (i % 4) * 0.015).toFixed(3)};--dx:${(i % 3 - 1) * 26 + 18}px;--dy:${-30 - (i % 4) * 14}px;` +
      `animation-duration:${dur}s;animation-delay:-${(i * 9) % dur}s`;
    layer.appendChild(o);
  }
  document.body.prepend(layer);
  document.addEventListener("visibilitychange", () =>
    layer.classList.toggle("paused", document.hidden));
})();
