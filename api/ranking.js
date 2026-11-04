// GET  /api/ranking  -> { top: [{ apelido, ms }] }  (as 20 melhores médias)
// POST /api/ranking  { apelido, tempos: [5 números em ms] } -> { ms, posicao, top }
import { configurado, emMemoria, podeEnviar, salvar, top } from "./_banco.js";

const TOP = 20;
const LARGADAS = 5;
const PENALIDADE = 1000; // largada queimada vale 1 s
const MINIMO = 100; // abaixo disso ninguém reage, chutou

const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const indisponivel = () => json({ erro: "O ranking ainda não foi ligado (falta o banco Upstash na Vercel)." }, 503);

// palavrões e ofensas comuns: o apelido aparece para todo mundo
// (palavras curtas só inteiras, para não barrar "Computador" ou "Pintor")
const PROIBIDOS = /(porra|caralh|buceta|merda|cuzao|viado|arrombad|piroca|xoxota|vagabund|nazi|hitler|\bputa\b|\bfdp\b|\bpinto\b|\bcu\b)/i;

function limparApelido(bruto) {
  if (typeof bruto !== "string") return null;
  const a = bruto.normalize("NFC").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
  if (a.length < 2 || a.length > 16) return null;
  if (PROIBIDOS.test(a.normalize("NFD").replace(/[̀-ͯ]/g, ""))) return null;
  return a;
}

export async function GET() {
  if (!configurado && !emMemoria) return indisponivel();
  try {
    return json({ top: await top(TOP) });
  } catch (e) {
    console.error(e);
    return json({ erro: "O ranking não está disponível agora." }, 502);
  }
}

export async function POST(request) {
  if (!configurado && !emMemoria) return indisponivel();
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: "Pedido inválido." }, 400);
  }
  const apelido = limparApelido(corpo?.apelido);
  if (!apelido) return json({ erro: "Escolha um apelido de 2 a 16 letras, sem palavrão." }, 400);

  const t = corpo?.tempos;
  const valido =
    Array.isArray(t) &&
    t.length === LARGADAS &&
    t.every((ms) => Number.isFinite(ms) && (ms === PENALIDADE || (ms >= MINIMO && ms < PENALIDADE)));
  if (!valido) return json({ erro: "Esses tempos não batem com uma rodada de verdade." }, 400);

  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  try {
    if (!(await podeEnviar(ip))) return json({ erro: "Calma, piloto: muitas tentativas. Espera um minuto." }, 429);
    const ms = Math.round(t.reduce((s, x) => s + x, 0) / LARGADAS);
    const pos = await salvar(apelido, ms);
    return json({ ms, posicao: pos <= TOP ? pos : null, top: await top(TOP) });
  } catch (e) {
    console.error(e);
    return json({ erro: "Não deu para salvar agora. Tenta de novo." }, 502);
  }
}
