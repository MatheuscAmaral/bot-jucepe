import type { VercelRequest, VercelResponse } from "@vercel/node";

// Definir variável de ambiente ANTES de importar o módulo webhook
process.env.VERCEL = "1";

// Agora importar o webhook com a variável de ambiente já configurada
import fastifyApp from "../src/webhook";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    // Garantir que o Fastify está pronto
    await fastifyApp.ready();

    // A Vercel fornece req/res compatíveis com Node.js padrão
    // O Fastify pode processar diretamente através do servidor HTTP interno
    fastifyApp.server.emit("request", req as any, res as any);
  } catch (error) {
    console.error("Error in Vercel handler:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
