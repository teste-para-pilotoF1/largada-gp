# Seletiva de pilotos (equipe dos seguidores)

No ar: https://teste-para-piloto.vercel.app/ · código: https://github.com/teste-para-pilotoF1/largada-gp
(cada `git push` na `main` publica sozinho na Vercel).

Teste de reflexo da série "equipe dos seguidores". O link sai no fim do ep. 2: "o Rui foi buscar a roda e não voltou",
a vaga está aberta, e quem estiver no topo do grid quando a seletiva fechar vira **Piloto 1**, **Piloto 2** e
**pilotos de teste** (3º ao 5º).

Visual: a garagem da Sede 01 (parede de tábuas, porta de enrolar, mural de cortiça), 5 lâmpadas penduradas no lugar
do pórtico da F1, o kart enferrujado do ep. 1 apoiado num tijolo sem a roda da frente, bonecos low-poly de macacão
vermelho e branco, legenda "linha apagada + palavra forte". O resultado é uma "ficha do candidato" com a função que
o tempo daria na equipe (Piloto, Piloto de teste, Mecânico, Equipe de pneus, Buscar a roda) e um card de story 1080×1920.

A lógica de tempo veio da engenharia reversa do Lights Out GP (@formulaafondo, crédito na tela inicial): 5 luzes, uma
por segundo, espera sorteada de 0,2 a 3 s, tempo = `event.timeStamp` do toque − carimbo do `requestAnimationFrame`
do quadro escuro. Abaixo de 100 ms ou com luz acesa = largada queimada (vale 1 s).

## Ajustes rápidos
- `index.html`, topo do `<script>`: `EQUIPE` (nome da equipe), `PERFIL` (@formula1explica no card de story), `PILOTOS_TESTE`.
- `api/ranking.js`: `POSTADO` = hora em que o ep. 2 foi postado (Brasília), ex. `"2026-11-10T18:00"`; a seletiva fecha 24 h depois (`HORAS_ABERTA`). Também dá para usar a variável `SELETIVA_POSTADO` na Vercel.
  No lançamento, trocar a chave `CHAVE` em `api/_banco.js` (ex. `seletiva:ep2:placar`) zera o grid dos testes.

## Como o grid se protege
- Ao começar a rodada o site pede um "vale" assinado ao servidor; o grid só aceita a rodada com esse vale, uma vez só,
  e só se passou o tempo mínimo das luzes (5 s por largada não queimada) e no máximo 2 horas.
- Cada @ guarda só a melhor média; 8 envios por minuto por IP.
- Isso barra quem tenta mandar tempo direto pela API, mas não um robô feito sob medida: antes de anunciar,
  vale pedir aos primeiros um vídeo da tela fazendo o teste (a regra já está escrita no site).

## Arquivos
- `index.html` — o jogo inteiro (HTML + CSS + JS, sem build).
- `api/ranking.js` — função da Vercel: `GET` (grid + data de fim), `GET ?rodada=1` (vale), `POST` (entrar no grid).
- `api/_banco.js` — Upstash Redis pela API REST (sem dependências); chave `seletiva:placar`. Sem variáveis e fora da Vercel, usa memória.
- `dev.mjs` — servidor local: `node dev.mjs` → http://localhost:3005

Banco: Upstash for Redis (plano Free) ligado pelo painel da Vercel (Storage). Variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`.

## Números (mini analytics)
- Painel: `/numeros/` (só números somados, sem IP nem nada pessoal; fica fora do Google com noindex).
- O site manda eventos sem esperar resposta (`api/evento.js`): entrada (país/estado/cidade pelos cabeçalhos da Vercel, aparelho, app), início e fim de rodada, salvou no grid, card de story, abriu o grid, tempo com a página visível.
- Cada evento é 1 linha na lista `seletiva:ep2:eventos` do Upstash; `api/numeros.js` soma tudo na hora (cache de 60 s).
- "@ no grid" e "função de quem está no grid" vêm do placar e contam desde a abertura; o resto conta desde que o analytics entrou no ar.
