"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const Logger_1 = __importDefault(require("./utils/Logger"));
const bot_service_1 = require("./bot-service");
const env_1 = require("../config/env");
const fastify = (0, fastify_1.default)({
    logger: false,
    bodyLimit: 50 * 1024 * 1024,
});
const PORT = env_1.API_CONFIG.port;
fastify.register(cors_1.default, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
});
fastify.addHook("onRequest", async (request, reply) => {
    Logger_1.default.info(`${request.method} ${request.url} - ${request.ip}`);
});
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
fastify.get("/health", async (request, reply) => {
    return reply.send({
        status: "ok",
        timestamp: new Date().toISOString(),
        service: "JUCEPE Bot Webhook (Fastify)",
    });
});
fastify.post("/webhook/viability", {
    schema: {
        body: viabilitySchema,
    },
}, async (request, reply) => {
    try {
        const requestData = request.body;
        if (!Array.isArray(requestData.ownershipStructure) ||
            requestData.ownershipStructure.length === 0) {
            return reply.status(400).send({
                success: false,
                error: "É necessário informar pelo menos um sócio",
                message: "O campo ownershipStructure deve ser um array com pelo menos um objeto contendo CPF",
            });
        }
        Logger_1.default.info(`Nova solicitação de viabilidade recebida:`, {
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
    }
    catch (error) {
        Logger_1.default.error(`Erro no webhook: ${error}`);
        return reply.status(500).send({
            success: false,
            error: "Erro interno do servidor",
            message: "Ocorreu um erro ao processar a solicitação",
        });
    }
});
async function processViabilityRequest(requestData) {
    try {
        Logger_1.default.info(`Iniciando processamento da viabilidade: ${requestData.enterpriseName} (ID: ${requestData.enterpriseId})`);
        const result = await (0, bot_service_1.runViabilityBot)(requestData);
        if (result.success) {
            Logger_1.default.info(`Viabilidade concluída com sucesso após ${result.attempts} tentativa(s):`, result);
        }
        else {
            Logger_1.default.error(`Viabilidade falhou após ${result.attempts} tentativa(s):`, result);
        }
        await notifyObviaSystem(result);
    }
    catch (error) {
        // Este catch agora só captura erros inesperados que não foram tratados pelo sistema de retry
        Logger_1.default.error(`Erro inesperado ao processar viabilidade: ${error}`);
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
async function notifyObviaSystem(result) {
    try {
        const obviaApiUrl = `${env_1.API_CONFIG.obviaApiUrl}/commercial-registry/`;
        const apiSecret = env_1.API_CONFIG.botApiSecret;
        if (!apiSecret) {
            Logger_1.default.error("BOT_API_SECRET não está definido nas variáveis de ambiente");
            return;
        }
        const payload = {
            file_url: result.reportFileUrl || null,
            enterprise_id: result.enterpriseId,
            logs: {
                status: result.success ? "completed" : "failed",
                protocol_number: result.protocolNumber,
                processing_time: result.processingTime || "N/A",
                bot_response: result.botResponse ||
                    (result.success
                        ? "Processo finalizado com sucesso"
                        : "Erro no processamento"),
                attempts: result.attempts || 1,
            },
        };
        Logger_1.default.info("BOT result:", result);
        Logger_1.default.info("Notificando sistema Obvia:", payload);
        const response = await (0, node_fetch_1.default)(obviaApiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-secret": apiSecret,
            },
            body: JSON.stringify(payload),
        });
        if (response.ok) {
            Logger_1.default.info(`Sistema Obvia notificado com sucesso`);
        }
        else {
            Logger_1.default.error(`Erro ao notificar sistema Obvia: ${response.status} ${response.statusText}`);
        }
    }
    catch (error) {
        Logger_1.default.error(`Erro ao notificar sistema Obvia: ${error}`);
    }
}
fastify.get("/status", async (request, reply) => {
    return reply.send({
        message: "Endpoint para status das solicitações (em desenvolvimento)",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});
fastify.setErrorHandler(async (error, request, reply) => {
    Logger_1.default.error(`Erro não tratado: ${error.message}`);
    return reply.status(500).send({
        success: false,
        error: "Erro interno do servidor",
    });
});
// Só inicia o servidor se não estiver em ambiente serverless (Vercel)
if (process.env.VERCEL !== "1") {
    const start = async () => {
        try {
            await fastify.listen({
                port: Number(PORT),
                host: "0.0.0.0",
            });
            Logger_1.default.info(`🚀 Webhook JUCEPE (Fastify) rodando na porta ${PORT}`);
            Logger_1.default.info(`📋 Health check: http://localhost:${PORT}/health`);
            Logger_1.default.info(`🔗 Webhook URL: http://localhost:${PORT}/webhook/viability`);
        }
        catch (err) {
            Logger_1.default.error("Erro ao iniciar o servidor:", err);
            process.exit(1);
        }
    };
    start();
}
exports.default = fastify;
//# sourceMappingURL=webhook.js.map