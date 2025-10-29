import puppeteer from "puppeteer";
import logger from "./utils/Logger";
import type { WebhookViabilityRequest, BotResult } from "./types/webhook";
import type { ViabilityRequester } from "./types/IViabilityRequester";
import {
  BOT_CONFIG,
  BOT_CREDENTIALS,
  FISCAL_REPRESENTATIVE,
  PUPPETEER_CONFIG,
  RETRY_CONFIG,
  SYSTEM_URLS,
  validateRequiredEnvVars,
} from "../config/env";

export async function runViabilityBot(
  webhookData: WebhookViabilityRequest
): Promise<BotResult> {
  // Validar variáveis de ambiente obrigatórias
  validateRequiredEnvVars();

  const viabilityRequester: ViabilityRequester = {
    city: webhookData.city,
    state: webhookData.state,
    institution: BOT_CONFIG.institution,
    townRegistry: webhookData.townRegistry,
    isStateRegistryRequested: BOT_CONFIG.isStateRegistryRequested,
    commercialEstablishmentArea: BOT_CONFIG.commercialEstablishmentArea,
    propertySequentialNumber: BOT_CONFIG.propertySequentialNumber,
    referencePoint: webhookData.referencePoint,
    ownershipStructure: webhookData.ownershipStructure,
    enterpriseName: webhookData.enterpriseName,
    enterprisePurpose: webhookData.enterprisePurpose,
    additionalInformation: BOT_CONFIG.additionalInformation,
    sepulRecifeProtocol: BOT_CONFIG.sepulRecifeProtocol,
  };

  const credentials = BOT_CREDENTIALS;
  const fiscalRepresentative = FISCAL_REPRESENTATIVE;

  let lastError: Error | null = null;
  let totalAttempts = 0;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    totalAttempts = attempt;

    logger.info(
      `Tentativa ${attempt}/${RETRY_CONFIG.maxRetries} - Iniciando o navegador para processamento via webhook`
    );

    let browser = null;

    try {
      browser = await puppeteer.launch({
        headless: PUPPETEER_CONFIG.headless,
        slowMo:
          process.env.NODE_ENV === "production" ? 100 : PUPPETEER_CONFIG.slowMo, // Voltando à velocidade original
        defaultViewport: null,
        timeout: 60000, // Timeout maior para launch em máquinas lentas
        args: [
          "--start-maximized",
          `--window-size=${PUPPETEER_CONFIG.windowSize.width},${PUPPETEER_CONFIG.windowSize.height}`,
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

      logger.info(`Tentativa ${attempt} - Navegador iniciado via webhook`);

      const page = await browser.newPage();
      logger.info(`Tentativa ${attempt} - Nova página aberta via webhook`);

      // Configurar timeouts mais robustos para servidores com menos recursos
      const extendedTimeout = RETRY_CONFIG.timeout * 2; // Dobrar timeout para EC2
      page.setDefaultTimeout(extendedTimeout);
      page.setDefaultNavigationTimeout(extendedTimeout);

      // Configurações adicionais para estabilidade e evitar bloqueios
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // Adicionar headers extras para evitar detecção de bot
      await page.setExtraHTTPHeaders({
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      });

      await page.setViewport({
        width: PUPPETEER_CONFIG.windowSize.width,
        height: PUPPETEER_CONFIG.windowSize.height,
      });

      // Interceptar e bloquear recursos desnecessários para melhor performance
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const resourceType = req.resourceType();
        if (
          resourceType === "image" ||
          resourceType === "stylesheet" ||
          resourceType === "font"
        ) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // Adicionar listener para detectar navegações inesperadas
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) {
          logger.info(`Navegação detectada para: ${frame.url()}`);
        }
      });

      await page.goto(SYSTEM_URLS.jucepeLogin, {
        waitUntil: "networkidle0",
        timeout: RETRY_CONFIG.timeout,
      });

      const { viabilityService } = await import("./viability-service");
      const result = await viabilityService(
        page,
        viabilityRequester,
        credentials,
        fiscalRepresentative,
        webhookData.enterpriseId
      );

      if (!result) {
        throw new Error("Viability service returned undefined result");
      }

      // Se chegou até aqui, deu sucesso
      result.attempts = totalAttempts;
      logger.info(
        `Viabilidade concluída com sucesso na tentativa ${attempt}: ${JSON.stringify(
          result
        )}`
      );

      await browser.close();
      return result;
    } catch (error) {
      lastError = error as Error;
      logger.error(
        `Tentativa ${attempt}/${RETRY_CONFIG.maxRetries} falhou: ${error}`
      );

      // Fechar o navegador se ainda estiver aberto
      if (browser) {
        try {
          await browser.close();
          logger.info(`Navegador fechado após erro na tentativa ${attempt}`);
        } catch (closeError) {
          logger.error(`Erro ao fechar navegador: ${closeError}`);
        }
      }

      // Se não é a última tentativa, aguardar antes de tentar novamente
      if (attempt < RETRY_CONFIG.maxRetries) {
        const isRetryableError = isErrorRetryable(error as Error);

        if (isRetryableError) {
          logger.info(
            `Erro recuperável detectado. Aguardando ${RETRY_CONFIG.retryDelay}ms antes da próxima tentativa...`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, RETRY_CONFIG.retryDelay)
          );
        } else {
          logger.error(
            `Erro não recuperável detectado. Interrompendo tentativas.`
          );
          break;
        }
      }
    }
  }

  // Se chegou até aqui, todas as tentativas falharam
  logger.error(
    `Todas as ${RETRY_CONFIG.maxRetries} tentativas falharam. Último erro: ${lastError?.message}`
  );

  // Retornar erro estruturado com número de tentativas
  return {
    success: false,
    protocolNumber: "ERRO",
    enterpriseName: webhookData.enterpriseName,
    enterpriseId: webhookData.enterpriseId,
    reportFileUrl: null,
    botResponse: `Falha após ${totalAttempts} tentativas: ${lastError?.message}`,
    attempts: totalAttempts,
  };
}

function isErrorRetryable(error: Error): boolean {
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

  return retryableErrors.some((retryableError) =>
    errorMessage.includes(retryableError.toLowerCase())
  );
}
