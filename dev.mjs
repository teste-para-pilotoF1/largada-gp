// Servidor de teste local: serve os arquivos e a função /api/ranking (ranking na memória).
// Uso: node dev.mjs  ->  http://localhost:3005
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import * as ranking from "./api/ranking.js";
import * as evento from "./api/evento.js";
import * as numeros from "./api/numeros.js";
const rotas = { "/api/ranking": ranking, "/api/evento": evento, "/api/numeros": numeros };

const raiz = fileURLToPath(new URL(".", import.meta.url));
const tipos = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".js": "text/javascript", ".png": "image/png" };
const porta = Number(process.env.PORT) || 3005;

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (rotas[url.pathname]) {
    const corpo = req.method === "POST" ? await new Promise((ok) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => ok(d)); }) : undefined;
    const pedido = new Request(url, { method: req.method, headers: req.headers, body: corpo });
    const fn = rotas[url.pathname][req.method];
    const resp = fn ? await fn(pedido) : new Response("Método não permitido", { status: 405 });
    res.writeHead(resp.status, Object.fromEntries(resp.headers));
    return res.end(await resp.text());
  }
  const caminho = normalize(join(raiz, url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname));
  if (!caminho.startsWith(raiz) || caminho.includes(`${raiz}api`)) { res.writeHead(404); return res.end(); }
  try {
    const dados = await readFile(caminho);
    res.writeHead(200, { "Content-Type": tipos[extname(caminho)] || "application/octet-stream" });
    res.end(dados);
  } catch {
    res.writeHead(404); res.end("Não encontrado");
  }
}).listen(porta, () => console.log(`Largada GP em http://localhost:${porta}`));
