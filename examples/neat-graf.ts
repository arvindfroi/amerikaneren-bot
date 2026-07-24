/**
 * Genererer fremgangsgrafen for GitHub Pages og publiserer den.
 *
 *   node examples/neat-graf.ts --pages          # oppdater + push gh-pages
 *   node examples/neat-graf.ts <utmappe>        # bare skriv filene
 *
 * Leser alle trening*-loggene (benk-målingene), beregner glidende snitt og
 * en recency-vektet forventet utvikling per fokuslinje, og skriver
 * index.html + data.json. Med --pages vedlikeholdes en git-worktree på
 * grenen gh-pages (/home/user/amerikaneren-pages) og endringer pushes –
 * siden på GitHub Pages oppdaterer seg selv (henter data.json hvert
 * minutt). Kjørres fra overvåkingskjeden hvert 10. minutt.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const REPO = "/home/user/amerikaneren-bot";
const PAGES = "/home/user/amerikaneren-pages";
const medPages = process.argv.includes("--pages");
const utMappe = medPages ? PAGES : (process.argv[2] ?? "trening-graf");

// --- Parse benk-serier fra loggene -----------------------------------------
interface Punkt { g: number; v: number }
interface Serie { navn: string; rå: Punkt[]; glatt: Punkt[] }

function lesSerie(fil: string): Punkt[] {
  const punkter: Punkt[] = [];
  let gen: number | null = null;
  for (const linje of readFileSync(fil, "utf8").split("\n")) {
    const g = linje.match(/^gen\s+(\d+):/);
    if (g) {
      gen = Number(g[1]);
      continue;
    }
    const b = linje.match(/benk vs grådig bot: mester (-?[\d.]+) poeng\/kamp, grådig (-?[\d.]+)/);
    if (b && gen !== null) {
      punkter.push({ g: gen, v: Math.round((Number(b[1]) - Number(b[2])) * 10) / 10 });
    }
  }
  return punkter;
}

function glatt(s: Punkt[], vindu = 5): Punkt[] {
  return s.map((p, i) => {
    const del = s.slice(Math.max(0, i - vindu + 1), i + 1);
    return { g: p.g, v: Math.round((del.reduce((a, q) => a + q.v, 0) / del.length) * 10) / 10 };
  });
}

const navnFor = (fil: string): string =>
  fil === "trening.log" ? "A" : fil.replace("trening-", "").replace(".log", "").toUpperCase();

const loggfiler = readdirSync(REPO)
  .filter((f) => /^trening(-[a-z0-9]+)?\.log$/.test(f))
  .sort();
const serier: Serie[] = [];
for (const fil of loggfiler) {
  const rå = lesSerie(`${REPO}/${fil}`);
  if (rå.length > 0) serier.push({ navn: navnFor(fil), rå, glatt: glatt(rå) });
}

// --- Forventet utvikling: recency-vektet trend PER fokuslinje --------------
// Oppdateres AKTIVT hver ny generasjon: bare et glidende siste-vindu teller,
// og nyere målinger veier eksponentielt tyngre. Slik sporer prognosen farten
// NÅ – ikke den historiske snittstigningen over hele arven (som ble dominert
// av tidlig, rask vekst og aldri endret seg). Én prognose per fokuslinje
// (C4, D1) i linjens egen farge.
interface Projeksjon {
  navn: string;
  proj: Punkt[];
  band: { g: number; lo: number; hi: number }[];
}
function projiser(rå: Punkt[]): Omit<Projeksjon, "navn"> {
  const K = 24; //          vindusstørrelse (siste K benk-målinger)
  const forfall = 0.88; //  nyere punkt veier mer (eksponentiell nedvekting)
  const vindu = rå.slice(-K);
  if (vindu.length < 4) return { proj: [], band: [] };
  const vekt = (i: number): number => forfall ** (vindu.length - 1 - i);
  let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
  vindu.forEach((p, i) => {
    const w = vekt(i);
    sw += w; swx += w * p.g; swy += w * p.v; swxx += w * p.g * p.g; swxy += w * p.g * p.v;
  });
  const stign = (sw * swxy - swx * swy) / (sw * swxx - swx * swx || 1);
  const skjær = (swy - stign * swx) / sw;
  let sws = 0;
  vindu.forEach((p, i) => { sws += vekt(i) * (p.v - (skjær + stign * p.g)) ** 2; });
  const sigma = Math.sqrt(sws / (sw || 1));
  const proj: Punkt[] = [];
  const band: { g: number; lo: number; hi: number }[] = [];
  const nyeste = vindu[vindu.length - 1]!.g;
  const HORISONT = 250, STEG = 25; // kortsiktig – prognosen fornyes fortløpende
  for (let t = 0; t <= HORISONT; t += STEG) {
    const g = nyeste + t;
    const v = Math.round((skjær + stign * g) * 10) / 10;
    proj.push({ g, v });
    const b = sigma * (0.5 + t / HORISONT); // usikkerheten vokser med horisonten
    band.push({ g, lo: Math.round((v - b) * 10) / 10, hi: Math.round((v + b) * 10) / 10 });
  }
  return { proj, band };
}
const projeksjoner: Projeksjon[] = serier
  .filter((s) => s.navn === "C4" || s.navn === "D1")
  .map((s) => ({ navn: s.navn, ...projiser(s.rå) }))
  .filter((p) => p.proj.length > 0);

const kjør = (cmd: string, cwd: string): string =>
  execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// Worktree på gh-pages må finnes FØR filene skrives (selvhelende etter restart).
if (medPages && !existsSync(`${PAGES}/.git`)) {
  kjør("git worktree prune", REPO);
  const finnes = execSync("git branch --list gh-pages", { cwd: REPO, encoding: "utf8" }).trim();
  if (finnes === "") {
    const tomTre = kjør("git hash-object -t tree /dev/null", REPO).trim();
    const rot = kjør(`git commit-tree ${tomTre} -m "gh-pages: fremgangsgraf"`, REPO).trim();
    kjør(`git branch gh-pages ${rot}`, REPO);
  }
  kjør(`rm -rf ${PAGES}`, REPO); // evt. halvskrevne rester uten .git
  kjør(`git worktree add ${PAGES} gh-pages`, REPO);
}

// PIMC-referansen (målt av neat-pimc-referanse.ts) – tegnes som nivålinje.
let pimcRef: { diff: number; kamper: number } | null = null;
if (existsSync(`${REPO}/trening-felles/pimc-referanse.json`)) {
  pimcRef = JSON.parse(readFileSync(`${REPO}/trening-felles/pimc-referanse.json`, "utf8"));
}

mkdirSync(utMappe, { recursive: true });
writeFileSync(
  `${utMappe}/data.json`,
  JSON.stringify({ oppdatert: new Date().toISOString(), serier, projeksjoner, pimcRef }),
);
writeFileSync(`${utMappe}/index.html`, MAL());
console.log(`Skrev ${utMappe}/data.json (${serier.length} serier) + index.html`);

// --- Publiser til gh-pages --------------------------------------------------
if (medPages) {
  const status = kjør("git status --porcelain", PAGES).trim();
  if (status.length > 0) {
    kjør("git add -A", PAGES);
    kjør('git commit -m "Oppdater fremgangsgraf"', PAGES);
    kjør("git push origin gh-pages", PAGES);
    console.log("Publiserte til gh-pages");
  } else {
    console.log("Ingen endringer å publisere");
  }
}

// --- Sidemal (selvoppdaterende klient) --------------------------------------
function MAL(): string {
  return `<!doctype html><html lang="no"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amerikaneren-NEAT: fremgang</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; background:#fcfcfb; color:#0b0b0b; font:14px/1.45 system-ui,sans-serif; }
  @media (prefers-color-scheme: dark) { body { background:#1a1a19; color:#fff; } }
  .rot { max-width:1000px; margin:0 auto; padding:20px;
    --tx2:#52514e; --grid:#e8e7e3;
    --fokusC4:#2a78d6; --fokusD1:#d92b2b; --retirert:#a5a39c; }
  @media (prefers-color-scheme: dark) { .rot { --tx2:#c3c2b7; --grid:#33322f;
    --fokusC4:#4593f0; --fokusD1:#f0524a; --retirert:#6e6d67; } }
  h1 { font-size:19px; margin:0 0 2px; } .sub { color:var(--tx2); margin:0 0 12px; font-size:13px; }
  .akse { font-size:11px; fill:var(--tx2); } .merk { font-size:12px; font-weight:600; }
  .lgr { display:flex; flex-wrap:wrap; gap:14px; margin:0 0 6px; font-size:12.5px; color:var(--tx2); }
  .lg i { display:inline-block; width:14px; height:3px; border-radius:2px; margin-right:5px; vertical-align:middle; }
  .lg i.strek { background:repeating-linear-gradient(90deg,var(--tx2) 0 5px,transparent 5px 9px); }
  svg { width:100%; height:auto; display:block; }
  #tt { position:fixed; pointer-events:none; background:#fcfcfb; border:1px solid var(--grid);
    border-radius:6px; padding:6px 9px; font-size:12px; display:none; box-shadow:0 2px 8px rgb(0 0 0 / .2); color:#0b0b0b; }
  @media (prefers-color-scheme: dark) { #tt { background:#1a1a19; color:#fff; } }
  table { border-collapse:collapse; margin-top:8px; font-size:13px; color:var(--tx2); }
  td,th { padding:3px 12px 3px 0; text-align:left; } th { font-weight:600; }
</style></head><body><div class="rot">
<h1>Amerikaneren-NEAT: kvalitet per modell</h1>
<p class="sub">Poengdifferanse per kamp mot grådig-benken (glidende snitt over 5 målinger; prikker = enkeltmålinger).
0-linjen = jevnt med heuristikk-boten. Stiplet = forventet videre utvikling (recency-vektet trend per fokuslinje, oppdateres hver generasjon).
<b id="stempel"></b> · siden henter nye tall hvert minutt.</p>
<div class="lgr" id="legend"></div>
<div id="graf"></div><div id="tt"></div>
<table id="tabell"></table>
<script>
const W=960,H=560,ML=56,MR=150,MT=30,MB=46,PW=W-ML-MR,PH=H-MT-MB;
let DATA=null;
// C4 (blå) og D1 (rød) er i fokus; pensjonerte linjer (A, B, C, C2, C3) gråes ut.
function farge(n){return n==="C4"?"var(--fokusC4)":n==="D1"?"var(--fokusD1)":"var(--retirert)";}
function fokus(n){return n==="C4"||n==="D1";}
async function last(){
  try{
    const r=await fetch("data.json?ts="+Date.now(),{cache:"no-store"});
    DATA=await r.json(); tegn();
  }catch(e){/* prøver igjen */}
}
function tegn(){
  const d=DATA; if(!d) return;
  const projs=d.projeksjoner||[];
  const alle=[...d.serier.flatMap(s=>s.glatt.map(p=>p.v)), ...projs.flatMap(p=>p.band.flatMap(b=>[b.lo,b.hi])), ...(d.pimcRef?[d.pimcRef.diff]:[])];
  const YMAX=Math.min(120,Math.max(60,Math.ceil(Math.max(...alle)/10)*10+10));
  const YMIN=Math.max(-200,Math.min(-100,Math.floor(Math.min(...d.serier.flatMap(s=>s.glatt.map(p=>p.v)))/10)*10-10));
  const XMAX=Math.max(...d.serier.map(s=>s.rå[s.rå.length-1].g), ...projs.flatMap(p=>p.proj.length?[p.proj[p.proj.length-1].g]:[0]))*1.02;
  const X=g=>ML+PW*g/XMAX, Y=v=>MT+PH*(YMAX-v)/(YMAX-YMIN);
  const sti=p=>"M"+p.map(q=>X(q.g).toFixed(1)+" "+Y(q.v).toFixed(1)).join(" L");
  let s='';
  for(let v=Math.ceil(YMIN/50)*50; v<=YMAX; v+=50){
    const y=Y(v), tykk=v===0?'stroke="var(--tx2)" stroke-width="1.5"':'stroke="var(--grid)"';
    s+='<line x1="'+ML+'" y1="'+y+'" x2="'+(ML+PW)+'" y2="'+y+'" '+tykk+'/>';
    s+='<text x="'+(ML-8)+'" y="'+(y+4)+'" text-anchor="end" class="akse">'+(v>0?"+":"")+v+'</text>';
  }
  s+='<text x="'+(ML+PW-6)+'" y="'+(Y(0)-7)+'" text-anchor="end" class="akse">jevnt med grådig-boten</text>';
  if(d.pimcRef){
    const yp=Y(d.pimcRef.diff);
    s+='<line x1="'+ML+'" y1="'+yp+'" x2="'+(ML+PW)+'" y2="'+yp+'" stroke="var(--tx2)" stroke-width="1.5" stroke-dasharray="2 3"/>';
    s+='<text x="'+(ML+PW-6)+'" y="'+(yp-7)+'" text-anchor="end" class="merk" fill="var(--tx2)">PIMC-solveren (+'+d.pimcRef.diff+')</text>';
  }
  const steg=XMAX>4000?1000:XMAX>1500?500:200;
  for(let g=0;g<=XMAX;g+=steg) s+='<text x="'+X(g)+'" y="'+(MT+PH+22)+'" text-anchor="middle" class="akse">'+g+'</text>';
  for(const pr of projs){
    if(!pr.proj.length) continue;
    const col=farge(pr.navn);
    const poly=pr.band.map(b=>X(b.g).toFixed(1)+","+Y(b.hi).toFixed(1)).join(" ")+" "+
      [...pr.band].reverse().map(b=>X(b.g).toFixed(1)+","+Y(b.lo).toFixed(1)).join(" ");
    s+='<polygon points="'+poly+'" fill="'+col+'" opacity="0.08"/>';
    s+='<path d="'+sti(pr.proj)+'" fill="none" stroke="'+col+'" stroke-width="1.8" stroke-dasharray="7 5" opacity="0.85"/>';
    const pp=pr.proj[pr.proj.length-1];
    s+='<text x="'+(X(pp.g)+6)+'" y="'+(Y(pp.v)+4)+'" class="merk" fill="'+col+'">'+pr.navn+' forventet</text>';
  }
  // Pensjonerte serier tegnes først (bakgrunn), fokusseriene (C4/D1) sist og tykkere.
  const rekkefølge=[...d.serier].sort((a,b)=>(fokus(a.navn)?1:0)-(fokus(b.navn)?1:0));
  for(const serie of rekkefølge){
    const f=fokus(serie.navn);
    if(f) for(const p of serie.rå) if(p.v>=YMIN&&p.v<=YMAX)
      s+='<circle cx="'+X(p.g).toFixed(1)+'" cy="'+Y(p.v).toFixed(1)+'" r="2" fill="'+farge(serie.navn)+'" opacity="0.22"/>';
    s+='<path d="'+sti(serie.glatt)+'" fill="none" stroke="'+farge(serie.navn)+'" stroke-width="'+(f?2.6:1.4)+'"'+(f?'':' opacity="0.55"')+' stroke-linejoin="round"/>';
    const sp=serie.glatt[serie.glatt.length-1];
    s+='<text x="'+(X(sp.g)+7)+'" y="'+(Y(sp.v)+4)+'" class="merk"'+(f?'':' opacity="0.6" font-size="10"')+' fill="'+farge(serie.navn)+'">'+serie.navn+'</text>';
  }
  s+='<line id="kryss" y1="'+MT+'" y2="'+(MT+PH)+'" stroke="var(--tx2)" opacity="0" stroke-dasharray="3 3"/>';
  document.getElementById("graf").innerHTML=
    '<svg viewBox="0 0 '+W+' '+H+'" id="plot" role="img" aria-label="Fremgangsgraf">'+
    '<line x1="'+ML+'" y1="'+MT+'" x2="'+ML+'" y2="'+(MT+PH)+'" stroke="var(--grid)"/>'+
    '<line x1="'+ML+'" y1="'+(MT+PH)+'" x2="'+(ML+PW)+'" y2="'+(MT+PH)+'" stroke="var(--grid)"/>'+
    '<text x="'+(ML+PW/2)+'" y="'+(H-8)+'" text-anchor="middle" class="akse">generasjon (per modell)</text>'+s+'</svg>';
  const lgOrd=[...d.serier].sort((a,b)=>(fokus(b.navn)?1:0)-(fokus(a.navn)?1:0));
  document.getElementById("legend").innerHTML=
    lgOrd.map(x=>'<span class="lg"'+(fokus(x.navn)?' style="font-weight:600"':' style="opacity:.65"')+'><i style="background:'+farge(x.navn)+'"></i>'+x.navn+(fokus(x.navn)?'':' (pensjonert)')+'</span>').join("")+
    '<span class="lg"><i class="strek"></i>Forventet (recency-vektet trend, siste 24 målinger)</span>';
  document.getElementById("tabell").innerHTML=
    '<tr><th>Modell</th><th>Siste gen</th><th>Beste (glattet)</th><th>Nå (glattet)</th></tr>'+
    d.serier.map(x=>{
      const beste=Math.max(...x.glatt.map(p=>p.v)), nå=x.glatt[x.glatt.length-1].v;
      return '<tr><td>'+x.navn+'</td><td>'+x.rå[x.rå.length-1].g+'</td><td>'+(beste>0?"+":"")+beste.toFixed(0)+'</td><td>'+(nå>0?"+":"")+nå.toFixed(0)+'</td></tr>';
    }).join("");
  document.getElementById("stempel").textContent="Sist oppdatert "+new Date(d.oppdatert).toLocaleTimeString("nb-NO");
  kobleHover(XMAX);
}
function kobleHover(XMAX){
  const svg=document.getElementById("plot"),tt=document.getElementById("tt"),kr=document.getElementById("kryss");
  svg.onmousemove=(e)=>{
    const r=svg.getBoundingClientRect(),sk=r.width/W,gx=((e.clientX-r.left)/sk-ML)/PW*XMAX;
    if(gx<0||gx>XMAX){tt.style.display="none";kr.setAttribute("opacity",0);return;}
    const px=ML+PW*gx/XMAX; kr.setAttribute("x1",px);kr.setAttribute("x2",px);kr.setAttribute("opacity",.5);
    let rader="";
    for(const s of DATA.serier){
      if(gx>s.glatt[s.glatt.length-1].g+XMAX*0.03) continue;
      let n=s.glatt[0]; for(const p of s.glatt) if(Math.abs(p.g-gx)<Math.abs(n.g-gx)) n=p;
      if(Math.abs(n.g-gx)<=XMAX*0.04) rader+="<div><b>"+s.navn+"</b> gen "+n.g+": "+(n.v>0?"+":"")+n.v+"</div>";
    }
    if(!rader){tt.style.display="none";return;}
    tt.innerHTML="<div><b>gen ≈ "+Math.round(gx)+"</b></div>"+rader;
    tt.style.display="block";tt.style.left=(e.clientX+14)+"px";tt.style.top=(e.clientY+10)+"px";
  };
  svg.onmouseleave=()=>{tt.style.display="none";kr.setAttribute("opacity",0);};
}
last(); setInterval(last, 60_000);
</script></div></body></html>`;
}
