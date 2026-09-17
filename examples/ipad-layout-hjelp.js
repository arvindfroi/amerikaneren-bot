// Hjelper for examples/ipad-layout.mjs: sprøytes inn i spillsiden (maal, tilSpill, tilVrak, maalVrak).
const vent = (ms) => new Promise((r) => setTimeout(r, ms));
export function maal() {
  const hj = document.querySelector(".hjul"); const hr = hj.getBoundingClientRect();
  const kort = [...hj.querySelectorAll(".kort")];
  // Ulovlige kort har `pointer-events: none` i et stikk der man må følge farge. Synligheten og
  // trykkstripa skal måles for HVERT kort, så det slås av mens målingen tas.
  const stil = document.createElement("style");
  stil.textContent = ".hjul .kort { pointer-events: auto !important; }";
  document.head.appendChild(stil);
  const res = kort.map((k) => {
    const r = k.getBoundingClientRect(); const op = +getComputedStyle(k).opacity; let px = 0;
    for (let x = Math.max(r.left, 0); x < Math.min(r.right, innerWidth); x += 2) {
      const e = document.elementFromPoint(x, r.top + 0.45 * r.height); if (e !== null && e.closest(".kort") === k) px += 2;
    }
    return { id: k.id.slice(5), l: Math.round(r.left), rr: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), op: +op.toFixed(2), px };
  });
  stil.remove();
  const helt = res.filter((x) => x.op > 0.95 && x.l >= 0 && x.rr <= innerWidth && x.t >= 0 && x.b <= innerHeight && x.px >= 44);
  return { vw: innerWidth, vh: innerHeight, scrollH: document.scrollingElement.scrollHeight, kanScrolle: document.scrollingElement.scrollHeight > innerHeight + 1 && getComputedStyle(document.body).overflowY !== "hidden",
    hjul: [hr.left, hr.right, hr.top, hr.bottom].map(Math.round), låst: !!document.getElementById("bla-venstre")?.disabled, kb: kort[0]?.offsetWidth, n: kort.length,
    minStripe: Math.min(...res.map((x) => x.px)), heltSynlige: helt.length, res: res.map((x) => `${x.id}:${x.l}-${x.rr}/${x.t}-${x.b} o${x.op} p${x.px}`).join(" ") };
}
export async function tilSpill(navn = "layoutprove") {
  document.getElementById("navn").value = navn; document.getElementById("start-knapp").click();
  for (let i = 0; i < 90; i++) {
    await vent(600);
    const ov = document.querySelector(".overlegg");
    if (!ov && document.querySelectorAll(".hjul .kort").length === 12 && document.querySelectorAll(".hjul .kort:not([disabled])").length > 0) { await vent(1500); return "spill"; }
    const bud = [...document.querySelectorAll("button.tallbud:not([disabled])")]; if (bud.length) { bud[bud.length - 1].click(); continue; }
    if (ov) {
      const vk = [...ov.querySelectorAll("button.kort")];
      if (vk.length >= 16) {
        if (/4 av 4/.test(ov.innerText)) [...ov.querySelectorAll("button")].find((b) => /legg bort valgte/i.test(b.textContent))?.click();
        else vk.find((b) => b.getAttribute("aria-pressed") !== "true" && !b.classList.contains("valgt"))?.click();
        continue;
      }
      const t = ov.querySelector("button:not(.kort):not([disabled])"); if (t) t.click();
    }
  }
  return "tidsavbrudd";
}
export async function tilVrak(navn = "layoutprove") {
  document.getElementById("navn").value = navn; document.getElementById("start-knapp").click();
  for (let i = 0; i < 60; i++) {
    await vent(600);
    const ov = document.querySelector(".overlegg");
    if (ov && ov.querySelectorAll("button.kort").length >= 16) { await vent(800); return "vrak"; }
    const bud = [...document.querySelectorAll("button.tallbud:not([disabled])")]; if (bud.length) { bud[bud.length - 1].click(); continue; }
    const n = document.getElementById("neste"); if (n) n.click();
  }
  return "tidsavbrudd";
}
export function maalVrak() {
  const ov = document.querySelector(".overlegg"); const k = [...ov.querySelectorAll("button.kort")].map((b) => b.getBoundingClientRect());
  let px = Infinity;
  for (const b of ov.querySelectorAll("button.kort")) { const r = b.getBoundingClientRect(); const e = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); if (e?.closest("button.kort") !== b) px = 0; }
  return { n: k.length, utenfor: k.filter((r) => r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight).length, minBredde: Math.round(Math.min(...k.map((r) => r.width))), minHøyde: Math.round(Math.min(...k.map((r) => r.height))), senterTreff: px !== 0 };
}
