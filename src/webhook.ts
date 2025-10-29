import Fastify, { FastifyRequest, FastifyReply, FastifyError } from "fastify";
import cors from "@fastify/cors";
import fetch from "node-fetch";
import logger from "./utils/Logger";
import { runViabilityBot } from "./bot-service";
import type {
  WebhookViabilityRequest,
  BotResult,
  NotificationPayload,
} from "./types/webhook";
import { API_CONFIG, BOT_CONFIG } from "../config/env";

const fastify = Fastify({
  logger: false,
  bodyLimit: 50 * 1024 * 1024,
});

const PORT = API_CONFIG.port;

fastify.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
});

fastify.addHook(
  "onRequest",
  async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info(`${request.method} ${request.url} - ${request.ip}`);
  }
);

const viabilitySchema = {
  type: "object",
  required: [
    "enterpriseId",
    "enterpriseName",
    "enterprisePurpose",
    "city",
    "state",
    "townRegistry",
    "ownershipStructure",
  ],
  properties: {
    enterpriseId: { type: "number" },
    enterpriseName: { type: "string" },
    enterprisePurpose: { type: "string" },
    city: { type: "string" },
    state: { type: "string" },
    townRegistry: { type: "string" },
    referencePoint: { type: "string" },
    ownershipStructure: {
      type: "array",
      items: {
        type: "object",
        required: ["cpf"],
        properties: {
          cpf: { type: "string" },
        },
      },
    },
  },
};

fastify.get("/health", async (request: FastifyRequest, reply: FastifyReply) => {
  return reply.send({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "JUCEPE Bot Webhook (Fastify)",
  });
});

fastify.post<{ Body: WebhookViabilityRequest }>(
  "/webhook/viability",
  {
    schema: {
      body: viabilitySchema,
    },
  },
  async (
    request: FastifyRequest<{ Body: WebhookViabilityRequest }>,
    reply: FastifyReply
  ) => {
    try {
      const requestData = request.body;

      if (
        !Array.isArray(requestData.ownershipStructure) ||
        requestData.ownershipStructure.length === 0
      ) {
        return reply.status(400).send({
          success: false,
          error: "É necessário informar pelo menos um sócio",
          message:
            "O campo ownershipStructure deve ser um array com pelo menos um objeto contendo CPF",
        });
      }

      logger.info(`Nova solicitação de viabilidade recebida:`, {
        enterpriseId: requestData.enterpriseId,
        enterpriseName: requestData.enterpriseName,
        city: requestData.city,
        state: requestData.state,
      });

      const responseData = {
        success: true,
        message: "Solicitação recebida e será processada",
        timestamp: new Date().toISOString(),
        estimatedTime: "5-10 minutos",
      };

      reply.status(202).send(responseData);

      processViabilityRequest(requestData);
    } catch (error) {
      logger.error(`Erro no webhook: ${error}`);
      return reply.status(500).send({
        success: false,
        error: "Erro interno do servidor",
        message: "Ocorreu um erro ao processar a solicitação",
      });
    }
  }
);

async function processViabilityRequest(requestData: WebhookViabilityRequest) {
  try {
    logger.info(
      `Iniciando processamento da viabilidade: ${requestData.enterpriseName} (ID: ${requestData.enterpriseId})`
    );

    const result = await runViabilityBot(requestData);

    if (result.success) {
      logger.info(
        `Viabilidade concluída com sucesso após ${result.attempts} tentativa(s):`,
        result
      );
    } else {
      logger.error(
        `Viabilidade falhou após ${result.attempts} tentativa(s):`,
        result
      );
    }

    await notifyObviaSystem(result);
  } catch (error) {
    // Este catch agora só captura erros inesperados que não foram tratados pelo sistema de retry
    logger.error(`Erro inesperado ao processar viabilidade: ${error}`);

    await notifyObviaSystem({
      success: false,
      protocolNumber: "ERRO_INESPERADO",
      enterpriseName: requestData.enterpriseName,
      enterpriseId: requestData.enterpriseId,
      reportFileUrl: null,
      botResponse: `Erro inesperado: ${error}`,
      attempts: 1,
    });
  }
}

async function notifyObviaSystem(result: BotResult): Promise<void> {
  try {
    const obviaApiUrl = `${API_CONFIG.obviaApiUrl}/commercial-registry/`;
    const apiSecret = API_CONFIG.botApiSecret;

    if (!apiSecret) {
      logger.error(
        "BOT_API_SECRET não está definido nas variáveis de ambiente"
      );
      return;
    }

    const payload: NotificationPayload = {
      file_url: result.reportFileUrl || null,
      enterprise_id: result.enterpriseId,
      logs: {
        status: result.success ? "completed" : "failed",
        protocol_number: result.protocolNumber,
        processing_time: result.processingTime || "N/A",
        bot_response:
          result.botResponse ||
          (result.success
            ? "Processo finalizado com sucesso"
            : "Erro no processamento"),
        attempts: result.attempts || 1,
      },
    };

    logger.info("BOT result:", result);
    logger.info("Notificando sistema Obvia:", payload);

    const response = await fetch(obviaApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-secret": apiSecret,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      logger.info(`Sistema Obvia notificado com sucesso`);
    } else {
      logger.error(
        `Erro ao notificar sistema Obvia: ${response.status} ${response.statusText}`
      );
    }
  } catch (error) {
    logger.error(`Erro ao notificar sistema Obvia: ${error}`);
  }
}

fastify.get("/status", async (request: FastifyRequest, reply: FastifyReply) => {
  return reply.send({
    message: "Endpoint para status das solicitações (em desenvolvimento)",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

fastify.setErrorHandler(
  async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    logger.error(`Erro não tratado: ${error.message}`);
    return reply.status(500).send({
      success: false,
      error: "Erro interno do servidor",
    });
  }
);

const start = async () => {
  try {
    await fastify.listen({
      port: Number(PORT),
      host: "0.0.0.0",
    });

    logger.info(`🚀 Webhook JUCEPE (Fastify) rodando na porta ${PORT}`);
    logger.info(`📋 Health check: http://localhost:${PORT}/health`);
    logger.info(`🔗 Webhook URL: http://localhost:${PORT}/webhook/viability`);
  } catch (err) {
    logger.error("Erro ao iniciar o servidor:", err);
    process.exit(1);
  }
};

start();

export default fastify;
