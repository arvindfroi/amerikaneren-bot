/**
 * Live fremgangsside – leser rett fra filene på disk, ingen publisering.
 *
 *   node examples/live.ts [--port 8790]
 *   → http://localhost:8790
 *
 * Fremgangsgrafen på GitHub Pages er to minutter forsinket (den må gjennom
 * en git-push og et Pages-bygg). Denne er for å SE at det lever: den leser
 * status.json, loggene og e1-data hver gang du spør, og siden henter nye
 * tall hvert 3. sekund.
 *
 * Bevisst enkel: ingen avhengigheter, ingen historikk, ingen kurver – bare
 * tallene som endrer seg mens man ser på.
 */

import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const port = Number(process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : 8790);

interface LinjeStatus {
  navn: string;
  generasjon: number | null;
  hjerteslagSek: number | null;
  gull: number | null;
  gullMot: string | null;
  sisteBenkGrådig: number | null;
  sisteBenkNevro: number | null;
}

/** Siste benk-differanse per motstander fra en treningslogg. */
function sisteBenk(fil: string): { grådig: number | null; nevro: number | null } {
  const ut: { grådig: number | null; nevro: number | null } = { grådig: null, nevro: null };
  if (!existsSync(fil)) return ut;
  // Loggene blir store – les bare halen.
  const størrelse = statSync(fil).size;
  const fra = Math.max(0, størrelse - 200_000);
  const tekst = readFileSync(fil, "utf8").slice(fra);
  for (const linje of tekst.split("\n")) {
    const m = linje.match(/benk vs (grådig bot|nevro): mester (-?[\d.]+) poeng\/kamp, (?:grådig|nevro) (-?[\d.]+)/);
    if (!m) continue;
    const diff = Math.round((Number(m[2]) - Number(m[3])) * 10) / 10;
    if (m[1] === "nevro") ut.nevro = diff;
    else ut.grådig = diff;
  }
  return ut;
}

function linje(navn: string, dir: string, logg: string): LinjeStatus {
  let generasjon: number | null = null;
  let hjerteslagSek: number | null = null;
  try {
    const s = JSON.parse(readFileSync(`${REPO}/${dir}/status.json`, "utf8")) as {
      generasjon: number;
      tidsstempel: number;
    };
    generasjon = s.generasjon;
    hjerteslagSek = Math.round((Date.now() - s.tidsstempel) / 1000);
  } catch {
    /* linjen har ikke startet */
  }
  let gull: number | null = null;
  let gullMot: string | null = null;
  try {
    const g = JSON.parse(readFileSync(`${REPO}/${dir}/gull.json`, "utf8")) as {
      diff: number;
      motstander?: string;
    };
    gull = Math.round(g.diff * 10) / 10;
    gullMot = g.motstander ?? "grådig";
  } catch {
    /* ingen gullstandard ennå */
  }
  const benk = sisteBenk(`${REPO}/${logg}`);
  return { navn, generasjon, hjerteslagSek, gull, gullMot, sisteBenkGrådig: benk.grådig, sisteBenkNevro: benk.nevro };
}

/** Orakelets datamengde. Farten regnes ut av klienten mellom to spørringer. */
function e1Data(): { bytes: number; skard: number; stillinger: number } {
  let bytes = 0;
  let skard = 0;
  try {
    for (const f of readdirSync(`${REPO}/e1-data`)) {
      if (!f.endsWith(".jsonl")) continue;
      skard++;
      bytes += statSync(`${REPO}/e1-data/${f}`).size;
    }
  } catch {
    /* ingen data ennå */
  }
  return { bytes, skard, stillinger: Math.round(bytes / 736) };
}

function e1Målinger(): { kandidat: string; motNevro: number; se: number; merke: string }[] {
  try {
    return readFileSync(`${REPO}/e1-maalinger.jsonl`, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as { kandidat: string; motNevro?: number; motNevroSe?: number; merke: string })
      .filter((m) => m.kandidat.startsWith("e1:") && m.motNevro !== undefined)
      .map((m) => ({ kandidat: m.kandidat, motNevro: m.motNevro!, se: m.motNevroSe ?? 0, merke: m.merke }))
      .slice(-6);
  } catch {
    return [];
  }
}

/** Linjene finnes ved å se på disk – et nytt løp dukker opp uten kodeendring. */
function alleLinjer(): LinjeStatus[] {
  let dirs: string[];
  try {
    dirs = readdirSync(REPO).filter((f) => /^trening-[a-z0-9]+$/.test(f) && existsSync(`${REPO}/${f}/status.json`));
  } catch {
    return [];
  }
  return dirs
    .sort()
    .map((d) => linje(d.replace("trening-", "").toUpperCase(), d, `${d}.log`));
}

function tilstand(): unknown {
  return {
    tid: new Date().toISOString(),
    linjer: alleLinjer(),
    e1: { ...e1Data(), målinger: e1Målinger() },
  };
}

const SIDE = `<!doctype html><html lang="no"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amerikaneren – live</title>
<style>
 :root{color-scheme:light dark}
 body{margin:0;background:#111;color:#eee;font:15px/1.5 system-ui,sans-serif}
 .rot{max-width:760px;margin:0 auto;padding:22px}
 h1{font-size:18px;margin:0 0 2px} .sub{color:#999;font-size:13px;margin:0 0 18px}
 .kort{border:1px solid #333;border-radius:10px;padding:14px 16px;margin:0 0 12px;background:#181818}
 .kort h2{font-size:15px;margin:0 0 8px}
 .rad{display:flex;flex-wrap:wrap;gap:20px}
 .felt{min-width:110px} .felt .navn{color:#999;font-size:12px} .felt .verdi{font-size:20px;font-variant-numeric:tabular-nums}
 .god{color:#4ade80} .darlig{color:#f87171} .rolig{color:#fbbf24}
 .stolpe{height:8px;background:#262626;border-radius:4px;overflow:hidden;margin-top:8px}
 .stolpe i{display:block;height:100%;background:#7048e8}
 table{border-collapse:collapse;font-size:13px;margin-top:8px;width:100%}
 td,th{padding:3px 10px 3px 0;text-align:left;color:#bbb} th{color:#888;font-weight:600}
 .puls{display:inline-block;width:8px;height:8px;border-radius:50%;background:#4ade80;margin-right:6px}
 .puls.av{background:#f87171}
</style></head><body><div class="rot">
<h1>Amerikaneren – live</h1>
<p class="sub">Leser rett fra filene på maskinen. Oppdateres hvert 3. sekund. <span id="tid"></span></p>
<div id="innhold">laster …</div>
</div>
<script>
let forrige=null, forrigeTid=null;
function felt(navn,verdi,klasse){return '<div class="felt"><div class="navn">'+navn+'</div><div class="verdi '+(klasse||'')+'">'+verdi+'</div></div>';}
async function last(){
 let d; try{ d=await (await fetch('/tilstand',{cache:'no-store'})).json(); }catch(e){ return; }
 let h='';
 for(const l of d.linjer){
  const lever = l.hjerteslagSek!==null && l.hjerteslagSek<180;
  h+='<div class="kort"><h2><span class="puls'+(lever?'':' av')+'"></span>'+l.navn+(lever?'':' – står stille')+'</h2><div class="rad">';
  h+=felt('generasjon', l.generasjon??'–');
  h+=felt('hjerteslag', l.hjerteslagSek!==null?l.hjerteslagSek+' s siden':'–', lever?'':'rolig');
  h+=felt('gull ('+(l.gullMot??'–')+')', l.gull!==null?(l.gull>0?'+':'')+l.gull:'–', l.gull!==null&&l.gull>0?'god':'darlig');
  if(l.sisteBenkNevro!==null) h+=felt('siste benk mot nevro',(l.sisteBenkNevro>0?'+':'')+l.sisteBenkNevro, l.sisteBenkNevro>0?'god':'darlig');
  if(l.sisteBenkGrådig!==null) h+=felt('siste benk mot grådig',(l.sisteBenkGrådig>0?'+':'')+l.sisteBenkGrådig);
  h+='</div></div>';
 }
 const e=d.e1;
 let fart='–';
 if(forrige!==null){
  const dt=(new Date(d.tid)-forrigeTid)/1000;
  if(dt>0.5){ const db=(e.bytes-forrige)/736/dt; if(db>=0) fart=Math.round(db*60)+' /min'; }
 }
 forrige=e.bytes; forrigeTid=new Date(d.tid);
 const mal=300000, andel=Math.min(100, 100*e.stillinger/mal);
 h+='<div class="kort"><h2>E1 – orakel-data</h2><div class="rad">';
 h+=felt('stillinger', e.stillinger.toLocaleString('nb-NO'));
 h+=felt('fart', fart);
 h+=felt('skard', e.skard);
 h+=felt('størrelse', Math.round(e.bytes/1048576)+' MB');
 h+='</div><div class="stolpe"><i style="width:'+andel.toFixed(1)+'%"></i></div>';
 h+='<div class="navn" style="color:#999;font-size:12px;margin-top:4px">'+andel.toFixed(0)+' % av 300 000 – da starter GPU-treningen</div>';
 if(e.målinger.length){
  h+='<table><tr><th>modell</th><th>mot NevroHjerne</th><th>merke</th></tr>';
  for(const m of e.målinger){
   const g=m.motNevro>0;
   h+='<tr><td>'+m.kandidat.replace('e1:e1-modell/','')+'</td><td class="'+(g?'god':'darlig')+'">'+(g?'+':'')+m.motNevro.toFixed(1)+' ± '+m.se.toFixed(1)+'</td><td>'+m.merke+'</td></tr>';
  }
  h+='</table>';
 }
 h+='</div>';
 document.getElementById('innhold').innerHTML=h;
 document.getElementById('tid').textContent='Sist lest '+new Date(d.tid).toLocaleTimeString('nb-NO');
}
last(); setInterval(last,3000);
</script></body></html>`;

createServer((req, res) => {
  if (req.url?.startsWith("/tilstand")) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(tilstand()));
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(SIDE);
}).listen(port, () => console.log(`Live fremgang: http://localhost:${port}`));
