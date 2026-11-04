// Mini analytics da seletiva. O site manda um "beacon" (sem esperar resposta) e a função
// grava uma linha com o acontecimento. Nunca devolve erro para o site: no pior caso o evento se perde.
// POST /api/evento  { v, s, lote: [{ e, a, ...dados }] }  (ou o antigo { e, v, s, ...dados })  ->  204
// Não guarda IP nem nada pessoal: só um código aleatório do aparelho (v) e da visita (s).
import { anotar, configurado, emMemoria } from "./_banco.js";

const TIPOS = new Set(["entrada", "inicio", "rodada", "salvou", "story", "grid", "tempo"]);
const ID = /^[a-z0-9]{8,16}$/;
const vazio = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

// freio barato contra spam (memória da instância, não gasta o banco)
const porIp = new Map();
function demais(ip) {
  const agora = Date.now(), x = porIp.get(ip);
  if (!x || agora - x.t > 60_000) { porIp.set(ip, { t: agora, n: 1 }); if (porIp.size > 5000) porIp.clear(); return false; }
  return ++x.n > 300; // folga: no 4G muita gente sai pelo mesmo IP
}

const num = (x, min, max) => (Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : null);
const texto = (x, max) => (typeof x === "string" ? x.slice(0, max) : "");
function cabecalho(request, nome) {
  try { return decodeURIComponent(request.headers.get(nome) || ""); } catch { return ""; }
}

function aparelho(ua) {
  const so = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux|CrOS/.test(ua) ? "Linux" : "outro";
  const tipo = /iPad|Tablet/.test(ua) ? "tablet" : /Mobi|iPhone|Android/.test(ua) ? "celular" : "computador";
  const app = /Instagram/.test(ua) ? "Instagram" : /FBAN|FBAV|FB_IAB/.test(ua) ? "Facebook" : /TikTok|musical_ly|BytedanceWebview/.test(ua) ? "TikTok" : /WhatsApp/.test(ua) ? "WhatsApp" : /Twitter/.test(ua) ? "X" : "navegador";
  return { tipo, so, app };
}

// monta a linha de um evento (null = descarta). "a" = há quantos ms aconteceu (eventos que vêm em lote)
function montar(d, v, s, ua, request, agora) {
  if (!TIPOS.has(d?.e)) return null;
  const a = num(d.a, 0, 3 * 3600 * 1000) || 0;
  const r = { e: d.e, ts: agora - a, v, s };
  if (d.e === "entrada") {
    const ap = aparelho(ua);
    Object.assign(r, {
      n: d.n ? 1 : 0, // primeira vez neste aparelho
      pa: cabecalho(request, "x-vercel-ip-country").slice(0, 2) || "?",
      uf: cabecalho(request, "x-vercel-ip-country-region").slice(0, 3),
      ci: cabecalho(request, "x-vercel-ip-city").slice(0, 40),
      ap: ap.tipo, so: ap.so, app: ap.app,
      ref: texto(d.ref, 60),
    });
  } else if (d.e === "rodada") {
    const t = Array.isArray(d.t) ? d.t.slice(0, 5).map((x) => num(x, 0, 60_000)) : []; // 0 = queimou
    if (t.length !== 5 || t.includes(null)) return null;
    Object.assign(r, { t, m: Math.round(t.reduce((x, y) => x + (y || 1000), 0) / 5), q: t.filter((x) => x === 0).length });
  } else if (d.e === "salvou") {
    r.p = num(d.p, 1, 1e6);
  } else if (d.e === "story") {
    r.k = d.k === "imagem" ? "imagem" : "share";
  } else if (d.e === "tempo") {
    r.seg = num(d.seg, 0, 3 * 3600);
    if (r.seg === null) return null;
  }
  return r;
}

export async function POST(request) {
  if (!configurado && !emMemoria) return vazio();
  try {
    const ua = request.headers.get("user-agent") || "";
    if (/bot|crawl|spider|preview|facebookexternalhit|headless/i.test(ua)) return vazio();
    const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
    if (demais(ip)) return vazio();
    const bruto = await request.text();
    if (bruto.length > 6000) return vazio();
    const d = JSON.parse(bruto);
    if (!ID.test(d?.v) || !ID.test(d?.s)) return vazio();
    const agora = Date.now();
    // lote (vários eventos num envio só) ou o formato antigo, de um evento por envio
    const lista = Array.isArray(d.lote) ? d.lote.slice(0, 20) : [d];
    const registros = lista.map((x) => montar(x, d.v, d.s, ua, request, agora)).filter(Boolean);
    await anotar(registros);
  } catch (e) {
    if (!(e instanceof SyntaxError)) console.error("evento", e); // JSON ruim: só ignora
  }
  return vazio();
}
