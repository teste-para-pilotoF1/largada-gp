// Auditoria: rodadas rápidas demais para um humano, com os 5 tempos de cada uma.
// GET /api/suspeitos[?abaixo=160]  -> por aparelho (código aleatório, sem @ nem IP)
// Só lê os eventos do analytics; não mexe no grid nem em nada do jogo.
import { configurado, emMemoria, eventos } from "./_banco.js";

const BRT = -3 * 3600 * 1000;
const hora = (ts) => new Date(ts + BRT).toISOString().slice(11, 19);
const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": status === 200 && !emMemoria ? "public, max-age=0, s-maxage=60" : "no-store", "X-Robots-Tag": "noindex" } });
const mediana = (v) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2); };

export async function GET(request) {
  if (!configurado && !emMemoria) return json({ erro: "Banco não ligado." }, 503);
  const abaixo = Math.min(300, Math.max(100, Number(new URL(request.url).searchParams.get("abaixo")) || 160));
  try {
    const ev = (await eventos()).sort((a, b) => a.ts - b.ts);
    const porV = new Map();
    const de = (v) => { if (!porV.has(v)) porV.set(v, { entrada: null, rodadas: [], salvos: [], inicios: [] }); return porV.get(v); };
    for (const x of ev) {
      const d = de(x.v);
      if (x.e === "entrada" && !d.entrada) d.entrada = x;
      else if (x.e === "rodada") d.rodadas.push(x);
      else if (x.e === "salvou") d.salvos.push(x);
      else if (x.e === "inicio") d.inicios.push(x);
    }
    const out = [];
    for (const [v, d] of porV) {
      const rapidas = d.rodadas.filter((r) => r.q === 0 && r.m < abaixo);
      if (!rapidas.length) continue;
      const normais = d.rodadas.filter((r) => !rapidas.includes(r)).flatMap((r) => r.t.filter((t) => t > 0));
      out.push({
        aparelho: v.slice(0, 6),
        de: d.entrada ? [d.entrada.ap, d.entrada.so, d.entrada.app, d.entrada.uf || d.entrada.pa].filter(Boolean).join(" · ") : "?",
        rodadas: d.rodadas.length,
        queimadas: d.rodadas.reduce((s, r) => s + r.q, 0),
        reacaoNormalMediana: mediana(normais), // como esse aparelho reage nas outras rodadas
        rapidas: rapidas.map((r) => {
          const ini = d.inicios.filter((i) => i.s === r.s && i.ts <= r.ts).pop();
          const salvo = d.salvos.find((x) => x.s === r.s && x.ts >= r.ts && x.ts - r.ts < 2 * 3600 * 1000);
          const limpos = r.t;
          const media = limpos.reduce((a, b) => a + b, 0) / 5;
          return {
            hora: hora(r.ts), t: r.t, media: r.m,
            espalhamento: Math.max(...limpos) - Math.min(...limpos), // maior - menor (ms)
            desvio: Math.round(Math.sqrt(limpos.reduce((s, x) => s + (x - media) ** 2, 0) / 5) * 10) / 10,
            duracaoSeg: ini ? Math.round((r.ts - ini.ts) / 1000) : null, // do 1º toque ao fim das 5 largadas
            salvouNaPosicao: salvo ? salvo.p : null,
          };
        }),
      });
    }
    out.sort((a, b) => Math.min(...a.rapidas.map((r) => r.media)) - Math.min(...b.rapidas.map((r) => r.media)));
    return json({ abaixo, aparelhos: out.length, lista: out });
  } catch (e) {
    console.error(e);
    return json({ erro: "Não deu para montar agora." }, 502);
  }
}
