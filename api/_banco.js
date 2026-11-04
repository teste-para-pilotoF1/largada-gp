// Armazenamento do ranking: Upstash Redis (grátis, instalado pelo Marketplace da Vercel).
// Sem as variáveis de ambiente e fora da Vercel (teste local), usa a memória do processo.

const URL_REDIS = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const configurado = Boolean(URL_REDIS && TOKEN);
export const emMemoria = !configurado && !process.env.VERCEL;

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
const mem = { placar: new Map(), nomes: new Map(), cont: new Map() };

const CHAVE = "largada:placar"; // sorted set: membro = apelido minúsculo, nota = média em ms
const NOMES = "largada:nomes"; // hash: apelido minúsculo -> como a pessoa escreveu

export async function top(n) {
  if (emMemoria) {
    return [...mem.placar.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, n)
      .map(([k, ms]) => ({ apelido: mem.nomes.get(k), ms }));
  }
  const [lista] = await pipeline([["ZRANGE", CHAVE, "0", String(n - 1), "WITHSCORES"]]);
  const chaves = [];
  for (let i = 0; i < lista.length; i += 2) chaves.push([lista[i], Number(lista[i + 1])]);
  if (!chaves.length) return [];
  const [nomes] = await pipeline([["HMGET", NOMES, ...chaves.map((c) => c[0])]]);
  return chaves.map(([k, ms], i) => ({ apelido: nomes[i] || k, ms }));
}

// guarda só se for a melhor média desse apelido; devolve a posição (1 = primeiro)
export async function salvar(apelido, ms) {
  const k = apelido.toLowerCase();
  if (emMemoria) {
    const antes = mem.placar.get(k);
    if (antes === undefined || ms < antes) mem.placar.set(k, ms);
    mem.nomes.set(k, apelido);
    const melhor = mem.placar.get(k);
    return [...mem.placar.values()].filter((v) => v < melhor).length + 1;
  }
  const [, , pos] = await pipeline([
    ["ZADD", CHAVE, "LT", String(ms), k], // LT: só troca se a nova média for menor
    ["HSET", NOMES, k, apelido],
    ["ZRANK", CHAVE, k],
  ]);
  return Number(pos) + 1;
}

// limite simples contra spam: N envios por minuto por IP
export async function podeEnviar(ip, limite = 8) {
  const k = `largada:ip:${ip}`;
  if (emMemoria) {
    const n = (mem.cont.get(k) || 0) + 1;
    mem.cont.set(k, n);
    setTimeout(() => mem.cont.delete(k), 60_000).unref?.();
    return n <= limite;
  }
  const [n] = await pipeline([["INCR", k], ["EXPIRE", k, "60", "NX"]]);
  return Number(n) <= limite;
}
