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
- `index.html`, topo do `<script>`: `EQUIPE` (nome da equipe), `PERFIL` (seu @ no card de story), `PILOTOS_TESTE`.
- `api/ranking.js`: `FIM` = data e hora em que a seletiva fecha, horário de Brasília, ex. `"2026-11-15T20:00"`
  (ou a variável de ambiente `SELETIVA_FIM` na Vercel). Depois do horário o grid para de aceitar entradas.

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
