import type { VercelRequest, VercelResponse } from "@vercel/node";
import fastifyApp from "../src/webhook";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Definir variável de ambiente para indicar que está rodando na Vercel
  process.env.VERCEL = "1";

  // Garantir que o Fastify está pronto
  await fastifyApp.ready();

  // A Vercel fornece req/res compatíveis com Node.js padrão
  // O Fastify pode processar diretamente através do servidor HTTP interno
  fastifyApp.server.emit("request", req as any, res as any);
}
