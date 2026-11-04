// Seletiva de pilotos da equipe dos seguidores.
// GET  /api/ranking           -> { top: [{ insta, ms }], fim }   (as 20 melhores médias)
// GET  /api/ranking?rodada=1  -> { rodada }                      (vale de rodada assinado, pedido ao começar)
// POST /api/ranking  { insta, tempos: [5 números em ms], rodada } -> { ms, melhor, posicao, top }
import { createHmac, timingSafeEqual } from "node:crypto";
import { configurado, emMemoria, podeEnviar, salvar, SEGREDO, top, usarRodada } from "./_banco.js";

// ---- AJUSTE AQUI: data e hora em que a seletiva fecha (horário de Brasília). "" = sem data ainda ----
const FIM = process.env.SELETIVA_FIM || "";

const TOP = 20;
const LARGADAS = 5;
const PENALIDADE = 1000; // largada queimada vale 1 s
const MINIMO = 100; // abaixo disso ninguém reage, chutou
const POR_LARGADA = 5000; // cada largada sem queimar leva pelo menos 5 s de luzes
const VALIDADE = 2 * 3600 * 1000; // um vale de rodada vale 2 horas

const fimMs = FIM ? Date.parse(FIM.includes("T") && !/[Z+-]\d\d:?\d\d$|Z$/.test(FIM) ? FIM + "-03:00" : FIM) : NaN;
const fechou = () => Number.isFinite(fimMs) && Date.now() > fimMs;

const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const indisponivel = () => json({ erro: "O grid ainda não foi ligado (falta o banco Upstash na Vercel)." }, 503);

const assinar = (t) => createHmac("sha256", SEGREDO).update(`rodada:${t}`).digest("base64url").slice(0, 32);
function conferirRodada(rodada, reais) {
  if (typeof rodada !== "string" || !/^\d{13}\.[\w-]{32}$/.test(rodada)) return null;
  const [t, sig] = rodada.split(".");
  const certo = assinar(t);
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(certo))) return null;
  const idade = Date.now() - Number(t);
  if (idade < reais * POR_LARGADA || idade > VALIDADE) return null;
  return sig;
}

// @ do Instagram: letras, números, ponto e _ (até 30)
function limparInsta(bruto) {
  if (typeof bruto !== "string") return null;
  const a = bruto.trim().replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(a) || /^\.|\.$|\.\./.test(a)) return null;
  return a;
}

export async function GET(request) {
  if (!configurado && !emMemoria) return indisponivel();
  const url = new URL(request.url);
  if (url.searchParams.has("rodada")) {
    const t = String(Date.now());
    return json({ rodada: `${t}.${assinar(t)}` });
  }
  try {
    return json({ top: await top(TOP), fim: Number.isFinite(fimMs) ? new Date(fimMs).toISOString() : null });
  } catch (e) {
    console.error(e);
    return json({ erro: "O grid não está disponível agora." }, 502);
  }
}

export async function POST(request) {
  if (!configurado && !emMemoria) return indisponivel();
  if (fechou()) return json({ erro: "A seletiva já fechou. O resultado sai no próximo episódio." }, 403);
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: "Pedido inválido." }, 400);
  }
  const insta = limparInsta(corpo?.insta);
  if (!insta) return json({ erro: "Esse @ não parece um @ do Instagram." }, 400);

  const t = corpo?.tempos;
  const valido =
    Array.isArray(t) &&
    t.length === LARGADAS &&
    t.every((ms) => Number.isFinite(ms) && (ms === PENALIDADE || (ms >= MINIMO && ms < PENALIDADE)));
  if (!valido) return json({ erro: "Esses tempos não batem com uma rodada de verdade." }, 400);

  const sig = conferirRodada(corpo?.rodada, t.filter((ms) => ms !== PENALIDADE).length);
  if (!sig) return json({ erro: "Essa rodada não vale. Faça uma rodada nova e salve em até 2 horas." }, 400);

  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  try {
    if (!(await podeEnviar(ip))) return json({ erro: "Calma, piloto: muitas tentativas. Espera um minuto." }, 429);
    if (!(await usarRodada(sig))) return json({ erro: "Essa rodada já foi salva. Faça outra." }, 409);
    const ms = Math.round(t.reduce((s, x) => s + x, 0) / LARGADAS);
    const { posicao, melhor } = await salvar(insta, ms);
    return json({ ms, melhor, posicao, top: await top(TOP) });
  } catch (e) {
    console.error(e);
    return json({ erro: "Não deu para salvar agora. Tenta de novo." }, 502);
  }
}
