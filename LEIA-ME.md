# Largada GP

Teste de reflexo da largada da F1, 100% em português, com a cara dos vídeos de F1
(noite azul-marinho, low-poly, zebra, legenda "linha apagada + palavra forte", tags em pílula, cards brancos).

Engenharia reversa de https://lightsout-gp.vercel.app/ (de @formulaafondo, crédito mantido na tela inicial).
A lógica de tempo é a mesma do original: 5 colunas acendem, uma por segundo, e apagam depois de uma espera
sorteada de 0,2 a 3 s. O tempo vem do `event.timeStamp` do toque menos o carimbo do `requestAnimationFrame`
do quadro escuro. Abaixo de 100 ms ou com luz acesa = largada queimada (vale 1 s na média).

## Arquivos
- `index.html` — o jogo inteiro (HTML + CSS + JS, sem build). No topo do `<script>`, `PERFIL` põe seu @ no card de compartilhar.
- `api/ranking.js` — função da Vercel: `GET` devolve o top 20, `POST` salva `{ apelido, tempos }` (valida, calcula a média no servidor, guarda só a melhor de cada apelido, limita 8 envios/min por IP).
- `api/_banco.js` — Upstash Redis pela API REST (sem dependências). Fora da Vercel e sem variáveis, usa memória (só para teste).
- `dev.mjs` — servidor local: `node dev.mjs` → http://localhost:3005

## Publicar (plano grátis)
1. Suba esta pasta para a Vercel (repositório no GitHub + "Add New → Project", ou `npx vercel` dentro da pasta).
   Framework: **Other**, sem build. O site já funciona; só o ranking fica "indisponível".
2. Ranking: no projeto da Vercel → **Storage → Create Database → Upstash for Redis** (plano Free) → conectar ao projeto.
   Isso cria as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` (ou `UPSTASH_REDIS_REST_*`), que o código já lê.
3. **Redeploy** para a função enxergar as variáveis.

Plano free do Upstash: 500 mil comandos/mês; cada partida salva gasta ~5 comandos e cada abertura do ranking ~2.
