import type { VercelRequest, VercelResponse } from "@vercel/node";

// Definir variável de ambiente ANTES de importar qualquer módulo
process.env.VERCEL = "1";
process.env.VERCEL_ENV = "production";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    // Importar o webhook dentro do handler para garantir que a variável de ambiente está definida
    const { default: fastifyApp } = await import("../src/webhook");

    // Garantir que o Fastify está pronto
    await fastifyApp.ready();

    console.log("Fastify ready, processing request to:", req.url);

    // A Vercel fornece req/res compatíveis com Node.js padrão
    // O Fastify pode processar diretamente através do servidor HTTP interno
    fastifyApp.server.emit("request", req as any, res as any);
  } catch (error) {
    console.error("Error in Vercel handler:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack");
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
      details: error instanceof Error ? error.stack : undefined,
    });
  }
}
