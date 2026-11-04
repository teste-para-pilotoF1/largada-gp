// Armazenamento da seletiva: Upstash Redis (grátis, instalado pelo Marketplace da Vercel).
// Sem as variáveis de ambiente e fora da Vercel (teste local), usa a memória do processo.

const URL_REDIS = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const configurado = Boolean(URL_REDIS && TOKEN);
export const emMemoria = !configurado && !process.env.VERCEL;
// chave para assinar as rodadas (não precisa de variável nova: reaproveita o token do banco)
export const SEGREDO = process.env.SELETIVA_SEGREDO || TOKEN || "teste-local";

// ---- Redis pela API REST (sem dependências) ----
async function pipeline(comandos) {
  const r = await fetch(`${URL_REDIS}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(comandos),
  });
  if (!r.ok) throw new Error(`Redis respondeu ${r.status}`);
  const resp = await r.json();
  return resp.map((x) => {
    if (x.error) throw new Error(x.error);
    return x.result;
  });
}

// ---- memória (só para testar no computador) ----
const mem = { placar: new Map(), usadas: new Set(), cont: new Map() };

const CHAVE = "seletiva:placar"; // sorted set: membro = @ do Instagram (minúsculo), nota = média em ms

export async function top(n) {
  if (emMemoria) {
    return [...mem.placar.entries()].sort((a, b) => a[1] - b[1]).slice(0, n).map(([insta, ms]) => ({ insta, ms }));
  }
  const [lista] = await pipeline([["ZRANGE", CHAVE, "0", String(n - 1), "WITHSCORES"]]);
  const out = [];
  for (let i = 0; i < lista.length; i += 2) out.push({ insta: lista[i], ms: Number(lista[i + 1]) });
  return out;
}

// guarda só se for a melhor média desse @; devolve { posicao, melhor }
export async function salvar(insta, ms) {
  if (emMemoria) {
    const antes = mem.placar.get(insta);
    if (antes === undefined || ms < antes) mem.placar.set(insta, ms);
    const melhor = mem.placar.get(insta);
    return { melhor, posicao: [...mem.placar.values()].filter((v) => v < melhor).length + 1 };
  }
  const [, pos, melhor] = await pipeline([
    ["ZADD", CHAVE, "LT", String(ms), insta], // LT: só troca se a nova média for menor
    ["ZRANK", CHAVE, insta],
    ["ZSCORE", CHAVE, insta],
  ]);
  return { posicao: Number(pos) + 1, melhor: Number(melhor) };
}

// cada rodada assinada só pode ser salva uma vez
export async function usarRodada(assinatura) {
  if (emMemoria) {
    if (mem.usadas.has(assinatura)) return false;
    mem.usadas.add(assinatura);
    return true;
  }
  const [ok] = await pipeline([["SET", `seletiva:rodada:${assinatura}`, "1", "NX", "EX", "7200"]]);
  return ok === "OK";
}

// limite simples contra spam: N envios por minuto por IP
export async function podeEnviar(ip, limite = 8) {
  const k = `seletiva:ip:${ip}`;
  if (emMemoria) {
    const n = (mem.cont.get(k) || 0) + 1;
    mem.cont.set(k, n);
    setTimeout(() => mem.cont.delete(k), 60_000).unref?.();
    return n <= limite;
  }
  const [n] = await pipeline([["INCR", k], ["EXPIRE", k, "60", "NX"]]);
  return Number(n) <= limite;
}
