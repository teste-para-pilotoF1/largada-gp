// Painel de números da seletiva (página /numeros/). Só números somados, nada pessoal.
// GET /api/numeros -> resumo calculado na hora a partir dos eventos (cache de 60 s na Vercel)
import { configurado, emMemoria, eventos, resumoGrid, top } from "./_banco.js";

// mesmos cortes do site (index.html, FUNCOES)
const FUNCOES = [[220, "Piloto"], [259, "Piloto de teste"], [319, "Pit stop"], [400, "Mecânico"], [479, "Auxiliar de equipe"], [515, "Equipe de marketing"], [Infinity, "Buscar a roda"]];
const funcao = (ms) => FUNCOES.findIndex((f) => ms < f[0]);
const BRT = -3 * 3600 * 1000;

const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": emMemoria || status !== 200 ? "no-store" : "public, max-age=0, s-maxage=60, stale-while-revalidate=120" },
  });

// conta quantas PESSOAS (aparelhos) caem em cada valor
function porPessoa(lista, campo) {
  const vistos = new Map();
  for (const x of lista) if (!vistos.has(x.v)) vistos.set(x.v, x[campo] || "?");
  const c = {};
  for (const k of vistos.values()) c[k] = (c[k] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}
const pessoas = (lista) => new Set(lista.map((x) => x.v)).size;
const mediana = (v) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export async function GET() {
  if (!configurado && !emMemoria) return json({ erro: "Banco não ligado." }, 503);
  try {
    const [ev, grid, primeiro] = await Promise.all([eventos(), resumoGrid(FUNCOES.map((f) => f[0])), top(1)]);
    const de = (tipo) => ev.filter((x) => x.e === tipo);
    const entradas = de("entrada"), rodadas = de("rodada"), inicios = de("inicio");

    // tempo no site: o maior valor mandado por cada visita
    const tempoVisita = new Map();
    for (const x of de("tempo")) tempoVisita.set(x.s, Math.max(tempoVisita.get(x.s) || 0, x.seg));
    const segs = [...tempoVisita.values()].filter((s) => s > 0);

    // visitas por hora (Brasília)
    const porHora = {};
    for (const x of entradas) {
      const h = new Date(x.ts + BRT).toISOString().slice(0, 13); // "2026-11-04T20"
      porHora[h] = (porHora[h] || 0) + 1;
    }
    // rodadas por pessoa
    const rodPessoa = {};
    for (const x of rodadas) rodPessoa[x.v] = (rodPessoa[x.v] || 0) + 1;
    const qtdRod = Object.values(rodPessoa);
    const faixasRod = [["1", 1, 1], ["2 a 3", 2, 3], ["4 a 9", 4, 9], ["10 ou mais", 10, Infinity]].map(([n, a, b]) => [n, qtdRod.filter((q) => q >= a && q <= b).length]);

    const limpas = rodadas.flatMap((x) => x.t.filter((t) => t > 0)); // 0 = queimou
    const largadas = rodadas.length * 5, queimadas = rodadas.reduce((s, x) => s + x.q, 0);
    const funcoesRod = FUNCOES.map(() => 0);
    for (const x of rodadas) funcoesRod[funcao(x.m)]++;
    // reações: histograma de 20 em 20 ms
    const hist = {};
    for (const t of limpas) { const b = Math.min(600, Math.floor(t / 20) * 20); hist[b] = (hist[b] || 0) + 1; }

    const novos = new Set(entradas.filter((x) => x.n).map((x) => x.v)).size;
    const unicos = pessoas(entradas);
    return json({
      agora: Date.now(),
      desde: ev.length ? ev.reduce((m, x) => Math.min(m, x.ts), Infinity) : null,
      visitas: entradas.length,
      pessoas: unicos,
      voltaram: Math.max(0, unicos - novos),
      tempo: { medio: segs.length ? Math.round(segs.reduce((a, b) => a + b, 0) / segs.length) : 0, mediana: Math.round(mediana(segs)), totalHoras: Math.round(segs.reduce((a, b) => a + b, 0) / 360) / 10, visitasMedidas: segs.length },
      funil: [
        ["Abriram o site", unicos],
        ["Começaram uma rodada", pessoas(inicios)],
        ["Terminaram as 5 largadas", pessoas(rodadas)],
        ["Salvaram no grid", pessoas(de("salvou"))],
        ["Geraram o card de story", pessoas(de("story"))],
      ],
      rodadas: {
        iniciadas: inicios.length, completas: rodadas.length, largadas, queimadas,
        jogadores: qtdRod.length, porJogador: qtdRod.length ? Math.round((rodadas.length / qtdRod.length) * 10) / 10 : 0, recordista: qtdRod.reduce((m, q) => Math.max(m, q), 0),
        melhorReacao: limpas.length ? limpas.reduce((m, t) => Math.min(m, t), Infinity) : null,
        reacaoMediana: Math.round(mediana(limpas)),
        melhorMedia: rodadas.length ? rodadas.reduce((m, x) => Math.min(m, x.m), Infinity) : null,
        faixas: faixasRod,
        funcoes: FUNCOES.map((f, i) => [f[1], funcoesRod[i]]),
        histograma: Object.entries(hist).map(([b, n]) => [Number(b), n]).sort((a, b) => a[0] - b[0]),
      },
      grid: { inscritos: grid.total, funcoes: FUNCOES.map((f, i) => [f[1], grid.porFuncao[i]]), lider: primeiro[0] || null },
      stories: de("story").length,
      gridAberto: de("grid").length,
      porHora: Object.entries(porHora).sort(),
      paises: porPessoa(entradas, "pa"),
      estados: porPessoa(entradas.filter((x) => x.pa === "BR"), "uf"),
      cidades: porPessoa(entradas, "ci").filter(([c]) => c !== "?").slice(0, 15),
      aparelhos: porPessoa(entradas, "ap"),
      sistemas: porPessoa(entradas, "so"),
      apps: porPessoa(entradas, "app"),
    });
  } catch (e) {
    console.error(e);
    return json({ erro: "Não deu para montar os números agora." }, 502);
  }
}
