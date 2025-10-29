"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runViabilityBot = runViabilityBot;
const puppeteer_1 = __importDefault(require("puppeteer"));
const Logger_1 = __importDefault(require("./utils/Logger"));
const env_1 = require("../config/env");
async function runViabilityBot(webhookData) {
    // Validar variáveis de ambiente obrigatórias
    (0, env_1.validateRequiredEnvVars)();
    const viabilityRequester = {
        city: webhookData.city,
        state: webhookData.state,
        institution: env_1.BOT_CONFIG.institution,
        townRegistry: webhookData.townRegistry,
        isStateRegistryRequested: env_1.BOT_CONFIG.isStateRegistryRequested,
        commercialEstablishmentArea: env_1.BOT_CONFIG.commercialEstablishmentArea,
        propertySequentialNumber: env_1.BOT_CONFIG.propertySequentialNumber,
        referencePoint: webhookData.referencePoint,
        ownershipStructure: webhookData.ownershipStructure,
        enterpriseName: webhookData.enterpriseName,
        enterprisePurpose: webhookData.enterprisePurpose,
        additionalInformation: env_1.BOT_CONFIG.additionalInformation,
        sepulRecifeProtocol: env_1.BOT_CONFIG.sepulRecifeProtocol,
    };
    const credentials = env_1.BOT_CREDENTIALS;
    const fiscalRepresentative = env_1.FISCAL_REPRESENTATIVE;
    let lastError = null;
    let totalAttempts = 0;
    for (let attempt = 1; attempt <= env_1.RETRY_CONFIG.maxRetries; attempt++) {
        totalAttempts = attempt;
        Logger_1.default.info(`Tentativa ${attempt}/${env_1.RETRY_CONFIG.maxRetries} - Iniciando o navegador para processamento via webhook`);
        let browser = null;
        try {
            browser = await puppeteer_1.default.launch({
                headless: env_1.PUPPETEER_CONFIG.headless,
                slowMo: process.env.NODE_ENV === "production" ? 100 : env_1.PUPPETEER_CONFIG.slowMo, // Voltando à velocidade original
                defaultViewport: null,
                timeout: 60000, // Timeout maior para launch em máquinas lentas
                args: [
                    "--start-maximized",
                    `--window-size=${env_1.PUPPETEER_CONFIG.windowSize.width},${env_1.PUPPETEER_CONFIG.windowSize.height}`,
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-extensions",
                    "--disable-background-timer-throttling",
                    "--disable-backgrounding-occluded-windows",
                    "--disable-renderer-backgrounding",
                    "--disable-blink-features=AutomationControlled",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-popup-blocking",
                    "--disable-translate",
                    "--memory-pressure-off",
                    "--max_old_space_size=4096",
                    "--disable-features=VizDisplayCompositor",
                    "--single-process", // Para máquinas com recursos limitados
                ],
            });
            Logger_1.default.info(`Tentativa ${attempt} - Navegador iniciado via webhook`);
            const page = await browser.newPage();
            Logger_1.default.info(`Tentativa ${attempt} - Nova página aberta via webhook`);
            // Configurar timeouts mais robustos para servidores com menos recursos
            const extendedTimeout = env_1.RETRY_CONFIG.timeout * 2; // Dobrar timeout para EC2
            page.setDefaultTimeout(extendedTimeout);
            page.setDefaultNavigationTimeout(extendedTimeout);
            // Configurações adicionais para estabilidade e evitar bloqueios
            await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
            // Adicionar headers extras para evitar detecção de bot
            await page.setExtraHTTPHeaders({
                "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
                "Accept-Encoding": "gzip, deflate, br",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
                "Upgrade-Insecure-Requests": "1",
                "Cache-Control": "no-cache",
                Pragma: "no-cache",
            });
            await page.setViewport({
                width: env_1.PUPPETEER_CONFIG.windowSize.width,
                height: env_1.PUPPETEER_CONFIG.windowSize.height,
            });
            // Interceptar e bloquear recursos desnecessários para melhor performance
            await page.setRequestInterception(true);
            page.on("request", (req) => {
                const resourceType = req.resourceType();
                if (resourceType === "image" ||
                    resourceType === "stylesheet" ||
                    resourceType === "font") {
                    req.abort();
                }
                else {
                    req.continue();
                }
            });
            // Adicionar listener para detectar navegações inesperadas
            page.on("framenavigated", (frame) => {
                if (frame === page.mainFrame()) {
                    Logger_1.default.info(`Navegação detectada para: ${frame.url()}`);
                }
            });
            await page.goto(env_1.SYSTEM_URLS.jucepeLogin, {
                waitUntil: "networkidle0",
                timeout: env_1.RETRY_CONFIG.timeout,
            });
            const { viabilityService } = await Promise.resolve().then(() => __importStar(require("./viability-service")));
            const result = await viabilityService(page, viabilityRequester, credentials, fiscalRepresentative, webhookData.enterpriseId);
            if (!result) {
                throw new Error("Viability service returned undefined result");
            }
            // Se chegou até aqui, deu sucesso
            result.attempts = totalAttempts;
            Logger_1.default.info(`Viabilidade concluída com sucesso na tentativa ${attempt}: ${JSON.stringify(result)}`);
            await browser.close();
            return result;
        }
        catch (error) {
            lastError = error;
            Logger_1.default.error(`Tentativa ${attempt}/${env_1.RETRY_CONFIG.maxRetries} falhou: ${error}`);
            // Fechar o navegador se ainda estiver aberto
            if (browser) {
                try {
                    await browser.close();
                    Logger_1.default.info(`Navegador fechado após erro na tentativa ${attempt}`);
                }
                catch (closeError) {
                    Logger_1.default.error(`Erro ao fechar navegador: ${closeError}`);
                }
            }
            // Se não é a última tentativa, aguardar antes de tentar novamente
            if (attempt < env_1.RETRY_CONFIG.maxRetries) {
                const isRetryableError = isErrorRetryable(error);
                if (isRetryableError) {
                    Logger_1.default.info(`Erro recuperável detectado. Aguardando ${env_1.RETRY_CONFIG.retryDelay}ms antes da próxima tentativa...`);
                    await new Promise((resolve) => setTimeout(resolve, env_1.RETRY_CONFIG.retryDelay));
                }
                else {
                    Logger_1.default.error(`Erro não recuperável detectado. Interrompendo tentativas.`);
                    break;
                }
            }
        }
    }
    // Se chegou até aqui, todas as tentativas falharam
    Logger_1.default.error(`Todas as ${env_1.RETRY_CONFIG.maxRetries} tentativas falharam. Último erro: ${lastError === null || lastError === void 0 ? void 0 : lastError.message}`);
    // Retornar erro estruturado com número de tentativas
    return {
        success: false,
        protocolNumber: "ERRO",
        enterpriseName: webhookData.enterpriseName,
        enterpriseId: webhookData.enterpriseId,
        reportFileUrl: null,
        botResponse: `Falha após ${totalAttempts} tentativas: ${lastError === null || lastError === void 0 ? void 0 : lastError.message}`,
        attempts: totalAttempts,
    };
}
function isErrorRetryable(error) {
    const retryableErrors = [
        "Execution context was destroyed",
        "Navigation timeout",
        "net::ERR_INTERNET_DISCONNECTED",
        "net::ERR_CONNECTION_RESET",
        "net::ERR_CONNECTION_REFUSED",
        "Protocol error",
        "Target closed",
        "Session closed",
        "Connection closed",
        "Page crashed",
        "Cloudflare bloqueou o acesso", // Adicionar erro do Cloudflare como recuperável
    ];
    const errorMessage = error.message.toLowerCase();
    return retryableErrors.some((retryableError) => errorMessage.includes(retryableError.toLowerCase()));
}
//# sourceMappingURL=bot-service.js.map