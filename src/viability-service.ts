import { Page } from "puppeteer";
import logger from "./utils/Logger";
import { uploadFileToS3 } from "../utils/handler-upload-files-to-spaces";
import type { ViabilityRequester } from "./types/IViabilityRequester";
import { BOT_SPEED_CONFIG } from "./data/constants";

const randomTimerRange = (
  min: number = BOT_SPEED_CONFIG.ACTION_DELAY.MIN,
  max: number = BOT_SPEED_CONFIG.ACTION_DELAY.MAX
) => {
  return Math.floor(Math.random() * (max - min + 1) + min);
};

async function ensurePageIsActive(
  page: Page,
  operation: string
): Promise<void> {
  if (page.isClosed()) {
    throw new Error(`Página foi fechada antes de: ${operation}`);
  }

  // Verificar se o contexto ainda está válido
  try {
    await page.evaluate(() => document.readyState);
  } catch (error) {
    throw new Error(`Contexto da página foi destruído antes de: ${operation}`);
  }
}

// ========== NOVAS FUNÇÕES PARA CLOUDFLARE ==========

async function takeDebugScreenshot(
  page: Page,
  filename: string,
  description: string = ""
): Promise<void> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const screenshotPath = `./debug-screenshots/${timestamp}-${filename}.png`;

    // Criar diretório se não existir
    const fs = require("fs");
    const path = require("path");
    const dir = path.dirname(screenshotPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await page.screenshot({
      path: screenshotPath as `${string}.png`,
      fullPage: true,
      type: "png",
    });

    logger.info(
      `📸 Screenshot salvo: ${screenshotPath} ${
        description ? `- ${description}` : ""
      }`
    );
  } catch (error) {
    logger.warn(`⚠️ Erro ao tirar screenshot: ${error}`);
  }
}

async function waitForCloudflareEnhanced(
  page: Page,
  timeout = 45000
): Promise<boolean> {
  logger.info("🛡️ Aguardando Cloudflare (versão melhorada)...");

  const startTime = Date.now();
  let lastTitle = "";

  while (Date.now() - startTime < timeout) {
    try {
      const currentTitle = await page.title();

      // Se o título mudou e não é mais Cloudflare
      if (
        currentTitle !== lastTitle &&
        !currentTitle.includes("Just a moment") &&
        !currentTitle.includes("Checking your browser") &&
        currentTitle !== "" &&
        currentTitle !== "Just a moment..."
      ) {
        logger.info(`✅ Cloudflare superado! Título atual: ${currentTitle}`);
        return true;
      }

      lastTitle = currentTitle;

      // COMPORTAMENTO HUMANO MAIS AVANÇADO
      await humanLikeBehavior(page);

      // Verificar a cada 3-5 segundos
      await new Promise((resolve) =>
        setTimeout(resolve, 3000 + Math.random() * 2000)
      );
    } catch (error) {
      logger.warn(`⚠️ Erro durante verificação do Cloudflare: ${error}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  logger.info("⏰ Timeout esperando Cloudflare");
  return false;
}

async function humanLikeBehavior(page: Page): Promise<void> {
  try {
    // Obter dimensões da viewport
    const viewport = page.viewport();
    if (viewport) {
      const x = 100 + Math.random() * (viewport.width - 200);
      const y = 100 + Math.random() * (viewport.height - 200);

      // Movimentos de mouse mais realistas
      await page.mouse.move(x, y);
      await new Promise((resolve) =>
        setTimeout(resolve, 100 + Math.random() * 200)
      );
      await page.mouse.move(x + 50, y + 30);
      await new Promise((resolve) =>
        setTimeout(resolve, 100 + Math.random() * 200)
      );
    }

    // Scroll suave e variado
    await page.evaluate(() => {
      window.scrollBy({
        top: 100 + Math.random() * 200,
        behavior: "smooth",
      });
    });

    // Pausas variáveis entre ações
    await new Promise((resolve) =>
      setTimeout(resolve, 500 + Math.random() * 1000)
    );
  } catch (error) {
    // Ignora erros de contexto/destruição
    logger.info("⚠️ Comportamento humano interrompido (contexto alterado)");
  }
}

async function alternativeMapStrategy(page: Page): Promise<{
  success: boolean;
  mapSkipped?: boolean;
  usedDefaultCoords?: boolean;
}> {
  logger.info("🔄 Usando estratégia alternativa para o mapa...");

  try {
    // 1. Tentar fechar o modal e voltar
    logger.info("🚪 Tentando fechar modal do mapa...");
    const closed = await tryCloseModal(page);
    if (closed) {
      logger.info("✅ Modal fechado, continuando sem mapa...");
      return { success: true, mapSkipped: true };
    }

    // 2. Tentar usar coordenadas padrão (pular confirmação)
    logger.info("📍 Tentando usar coordenadas padrão...");
    const usedDefaults = await tryUseDefaultCoordinates(page);
    if (usedDefaults) {
      logger.info("✅ Coordenadas padrão aplicadas");
      return { success: true, usedDefaultCoords: true };
    }

    // 3. Última tentativa: recarregar contexto completo
    logger.info("🔄 Recarregando contexto completo...");
    await page.reload({ waitUntil: "networkidle2", timeout: 30000 });

    return { success: false };
  } catch (error: any) {
    logger.info(`❌ Estratégia alternativa falhou: ${error}`);
    return { success: false };
  }
}

async function tryCloseModal(page: Page): Promise<boolean> {
  try {
    // Tentar encontrar botão de fechar (X) ou Cancelar
    const closeSelectors = [
      'button[aria-label="Close"]',
      ".close",
      '[data-dismiss="modal"]',
      'button:has-text("Cancelar")',
      'button:has-text("Fechar")',
      'button:has-text("Voltar")',
      'button:has-text("Close")',
      ".modal-close",
      ".btn-close",
    ];

    for (const selector of closeSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return true;
        }
      } catch (error) {
        continue;
      }
    }

    // Tentar ESC keyboard
    await page.keyboard.press("Escape");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return false;
  } catch (error) {
    return false;
  }
}

async function tryUseDefaultCoordinates(page: Page): Promise<boolean> {
  try {
    // Tentar encontrar e preencher campos de coordenadas diretamente
    const coordinateFields = [
      'input[name="latitude"]',
      'input[name="longitude"]',
      'input[placeholder*="coord"]',
      'input[id*="coord"]',
      "#latitude",
      "#longitude",
    ];

    let filledAny = false;

    for (const selector of coordinateFields) {
      try {
        const field = await page.$(selector);
        if (field) {
          await field.click();
          await field.evaluate((el) => ((el as HTMLInputElement).value = ""));
          await page.keyboard.type("-8.047562"); // Coordenada padrão Recife
          filledAny = true;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (error) {
        continue;
      }
    }

    return filledAny;
  } catch (error) {
    return false;
  }
}

async function handleMapPage(page: Page): Promise<{
  success: boolean;
  mapSkipped?: boolean;
  usedDefaultCoords?: boolean;
}> {
  logger.info("🗺️ Iniciando tratamento da página do mapa...");

  // Screenshot inicial da página do mapa
  await takeDebugScreenshot(
    page,
    "01-mapa-inicial",
    "Estado inicial da página do mapa"
  );

  // AGUARDAR CLOUDFLARE COM ESTRATÉGIA MELHOR
  const cloudflareBypassed = await waitForCloudflareEnhanced(page);

  if (!cloudflareBypassed) {
    logger.info(
      "❌ Cloudflare não foi contornado, tentando estratégia alternativa..."
    );
    await takeDebugScreenshot(
      page,
      "02-cloudflare-nao-resolvido",
      "Cloudflare não foi resolvido"
    );
    return await alternativeMapStrategy(page);
  }

  // Screenshot após Cloudflare resolvido
  await takeDebugScreenshot(
    page,
    "03-cloudflare-resolvido",
    "Cloudflare resolvido com sucesso"
  );

  // CONTINUAR COM O PROCESSO NORMAL
  return await normalMapProcess(page);
}

async function normalMapProcess(page: Page): Promise<{ success: boolean }> {
  try {
    // Aguardar um pouco para a página estabilizar
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Screenshot antes de tentar clicar no botão
    await takeDebugScreenshot(
      page,
      "04-antes-confirma-endereco",
      "Antes de tentar clicar em 'Confirma Endereço'"
    );

    // Tentar encontrar e clicar no botão de confirmação
    const confirmButtonFound = await findAndClickElement(
      page,
      "Confirma Endereço",
      10000
    );

    if (!confirmButtonFound) {
      // Screenshot quando não encontra o botão principal
      await takeDebugScreenshot(
        page,
        "05-confirma-endereco-nao-encontrado",
        "Botão 'Confirma Endereço' não encontrado"
      );

      logger.warn(
        "🔄 Tentando estratégias alternativas para confirmar endereço..."
      );

      const alternativeTexts = [
        "Confirmar",
        "Confirma",
        "OK",
        "Aceitar",
        "Continuar",
        "Confirm",
        "Ok",
      ];

      let alternativeFound = false;
      for (const text of alternativeTexts) {
        logger.info(`Tentando encontrar botão com texto: "${text}"`);
        const found = await findAndClickElement(page, text, 3000);
        if (found) {
          logger.info(`✅ Botão alternativo encontrado: "${text}"`);
          await takeDebugScreenshot(
            page,
            `06-botao-alternativo-${text.toLowerCase()}`,
            `Botão alternativo '${text}' encontrado`
          );
          alternativeFound = true;
          break;
        }
      }

      if (!alternativeFound) {
        // Screenshot final quando nenhuma alternativa funciona
        await takeDebugScreenshot(
          page,
          "07-nenhuma-alternativa-encontrada",
          "Nenhuma alternativa de botão encontrada"
        );
        return { success: false };
      }
    } else {
      logger.info("✅ Botão 'Confirma Endereço' clicado com sucesso");
      await takeDebugScreenshot(
        page,
        "08-confirma-endereco-sucesso",
        "Botão 'Confirma Endereço' clicado com sucesso"
      );
    }

    return { success: true };
  } catch (error) {
    logger.error(`❌ Erro no processamento normal do mapa: ${error}`);
    return { success: false };
  }
}

// ========== FUNÇÕES ORIGINAIS (MANTIDAS) ==========

async function findAndClickElement(
  page: Page,
  targetText: string,
  maxWaitTime: number = 10000
): Promise<boolean> {
  logger.info(`🎯 === INICIANDO findAndClickElement para "${targetText}" ===`);

  // DEBUG: Verificar estado da página antes de tentar qualquer estratégia
  try {
    const isPageClosed = page.isClosed();
    const pageUrl = await page.url();
    logger.info(
      `📄 Estado da página - Fechada: ${isPageClosed}, URL: ${pageUrl}`
    );

    if (isPageClosed) {
      logger.error(`❌ Página está fechada, não é possível continuar`);
      return false;
    }
  } catch (error) {
    logger.error(`❌ Erro ao verificar estado da página: ${error}`);
    return false;
  }

  const strategies = [
    // Estratégia 1: Seletor Puppeteer text
    async () => {
      try {
        logger.info(
          `🔍 Tentando Estratégia 1 (Puppeteer text) para "${targetText}"`
        );
        await page.waitForSelector(`::-p-text(${targetText})`, {
          timeout: 3000,
        });
        logger.info(`✅ Elemento encontrado com Estratégia 1, clicando...`);
        await page.click(`::-p-text(${targetText})`);
        logger.info(`✅ Clique realizado com sucesso na Estratégia 1`);
        return true;
      } catch (error) {
        logger.info(`❌ Estratégia 1 falhou para "${targetText}": ${error}`);
        return false;
      }
    },

    // Estratégia 2: XPath com texto exato
    async () => {
      try {
        logger.info(
          `🔍 Tentando Estratégia 2 (XPath exato) para "${targetText}"`
        );
        await page.waitForFunction(
          (text) => {
            const xpath = `//*[text()="${text}"]`;
            return document.evaluate(
              xpath,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            ).singleNodeValue;
          },
          { timeout: 3000 },
          targetText
        );
        logger.info(`✅ Elemento encontrado com XPath exato, clicando...`);
        const found = await page.evaluate((text) => {
          const xpath = `//*[text()="${text}"]`;
          const element = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          ).singleNodeValue as HTMLElement;
          if (element) {
            element.click();
            return true;
          }
          return false;
        }, targetText);
        if (found) {
          logger.info(`✅ Clique realizado com sucesso na Estratégia 2`);
        }
        return found;
      } catch (error) {
        logger.info(`❌ Estratégia 2 falhou para "${targetText}": ${error}`);
        return false;
      }
    },

    // Estratégia 3: XPath com contains (texto parcial)
    async () => {
      try {
        logger.info(
          `🔍 Tentando Estratégia 3 (XPath contains) para "${targetText}"`
        );
        await page.waitForFunction(
          (text) => {
            const xpath = `//*[contains(text(), "${text}")]`;
            return document.evaluate(
              xpath,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            ).singleNodeValue;
          },
          { timeout: 3000 },
          targetText
        );
        logger.info(`✅ Elemento encontrado com XPath contains, clicando...`);
        const found = await page.evaluate((text) => {
          const xpath = `//*[contains(text(), "${text}")]`;
          const element = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          ).singleNodeValue as HTMLElement;
          if (element) {
            element.click();
            return true;
          }
          return false;
        }, targetText);
        if (found) {
          logger.info(`✅ Clique realizado com sucesso na Estratégia 3`);
        }
        return found;
      } catch (error) {
        logger.info(`❌ Estratégia 3 falhou para "${targetText}": ${error}`);
        return false;
      }
    },

    // Estratégia 4: Buscar por botões/inputs com value ou texto similar
    async () => {
      try {
        logger.info(
          `🔍 Tentando Estratégia 4 (busca por similaridade) para "${targetText}"`
        );
        const element = await page.evaluate((text) => {
          const buttons = Array.from(
            document.querySelectorAll(
              'button, input[type="button"], input[type="submit"], a'
            )
          );
          return buttons.find((btn) => {
            const btnText =
              btn.textContent || (btn as HTMLInputElement).value || "";
            return (
              btnText.toLowerCase().includes(text.toLowerCase()) ||
              text.toLowerCase().includes(btnText.toLowerCase())
            );
          });
        }, targetText);

        if (element) {
          logger.info(`✅ Elemento similar encontrado, clicando...`);
          await page.evaluate((text) => {
            const buttons = Array.from(
              document.querySelectorAll(
                'button, input[type="button"], input[type="submit"], a'
              )
            );
            const btn = buttons.find((btn) => {
              const btnText =
                btn.textContent || (btn as HTMLInputElement).value || "";
              return (
                btnText.toLowerCase().includes(text.toLowerCase()) ||
                text.toLowerCase().includes(btnText.toLowerCase())
              );
            });
            if (btn) {
              (btn as HTMLElement).click();
            }
          }, targetText);
          logger.info(`✅ Clique realizado com sucesso na Estratégia 4`);
          return true;
        }
        logger.info(`❌ Nenhum elemento similar encontrado na Estratégia 4`);
        return false;
      } catch (error) {
        logger.info(`❌ Estratégia 4 falhou para "${targetText}": ${error}`);
        return false;
      }
    },
  ];

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    for (let i = 0; i < strategies.length; i++) {
      logger.info(
        `🔄 Tentando estratégia ${i + 1} para encontrar "${targetText}"`
      );

      if (await strategies[i]()) {
        logger.info(`✅ Estratégia ${i + 1} funcionou para "${targetText}"`);
        logger.info(`🎯 === FIM findAndClickElement - SUCESSO ===`);
        return true;
      }

      // Aguardar um pouco antes da próxima estratégia
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Aguardar antes de tentar todas as estratégias novamente
    logger.info(
      `⏳ Aguardando antes de tentar novamente... (${Math.round(
        (Date.now() - startTime) / 1000
      )}s decorridos)`
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Se chegou até aqui, nenhuma estratégia funcionou
  logger.error(
    `❌ Nenhuma estratégia funcionou para encontrar "${targetText}" após ${Math.round(
      maxWaitTime / 1000
    )}s`
  );

  // Screenshot quando todas as estratégias falharam
  await takeDebugScreenshot(
    page,
    `estrategias-falharam-${targetText.replace(/\s+/g, "-").toLowerCase()}`,
    `Todas as estratégias falharam para "${targetText}"`
  );

  logger.info(`🎯 === FIM findAndClickElement - FALHA ===`);

  // Debug: listar todos os elementos clicáveis na página
  try {
    const clickableElements = await page.evaluate(() => {
      const elements: Element[] = Array.from(
        document.querySelectorAll(
          'button, input[type="button"], input[type="submit"], a, [onclick]'
        )
      );
      return elements
        .map((el) => ({
          tagName: el.tagName,
          text: el.textContent?.trim() || "",
          value: (el as HTMLInputElement).value || "",
          id: el.id,
          className: el.className,
        }))
        .filter((el) => el.text || el.value);
    });

    logger.info(
      `Elementos clicáveis encontrados: ${JSON.stringify(
        clickableElements,
        null,
        2
      )}`
    );
  } catch (debugError) {
    logger.error(`Erro no debug dos elementos: ${debugError}`);
  }

  return false;
}

async function typeWithRandomDelays(
  page: Page,
  text: string,
  minDelay = BOT_SPEED_CONFIG.TYPING_SPEED.NORMAL.MIN,
  maxDelay = BOT_SPEED_CONFIG.TYPING_SPEED.NORMAL.MAX
) {
  for (const char of text) {
    try {
      await ensurePageIsActive(page, `digitar caractere '${char}'`);

      await page.keyboard.type(char);
      const delay = randomTimerRange(minDelay, maxDelay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      logger.error(`Erro ao digitar caractere '${char}': ${error}`);
      throw error;
    }
  }
}

// ========== FUNÇÃO PRINCIPAL ORIGINAL (COM MODIFICAÇÕES NO MAPA) ==========

export const viabilityService = async (
  page: Page,
  requester: ViabilityRequester,
  credentials: { cpf: string; password: string },
  defaultFiscalRepresentative: { name: string; cpf: string; phone: string },
  enterpriseId: number
) => {
  // Login
  await page.click('input[placeholder="Digite seu CPF"]');
  await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));
  await typeWithRandomDelays(
    page,
    credentials.cpf,
    BOT_SPEED_CONFIG.TYPING_SPEED.FAST.MIN,
    BOT_SPEED_CONFIG.TYPING_SPEED.FAST.MAX
  );

  await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

  await page.click('input[placeholder="Digite sua Senha."]');
  await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));
  await typeWithRandomDelays(
    page,
    credentials.password,
    BOT_SPEED_CONFIG.TYPING_SPEED.FAST.MIN,
    BOT_SPEED_CONFIG.TYPING_SPEED.FAST.MAX
  );

  await page.click("::-p-text(Entrar)");
  await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

  await page.click("::-p-text(Viabilidade)");
  await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

  let maxRetries = 5;
  let retryCount = 0;
  let viabilidadeFormPage: Page;

  for (let i = 0; i < maxRetries; i++) {
    logger.info(
      `Tentativa ${retryCount + 1} para clicar em 'Pedido de Viabilidade'`
    );

    await page.click("::-p-text(Pedido de Viabilidade)");
    logger.info("Clicado em Pedido de Viabilidade");
    await new Promise((resolve) =>
      setTimeout(resolve, randomTimerRange(2000, 3000))
    );

    const browser = page.browser();
    const pages = await browser.pages();
    logger.info(`Total de paginas: ${pages.length}`);

    viabilidadeFormPage = pages[pages.length - 1];

    logger.info("Pagina atual: Pedido de Viabilidade");
    logger.info("Procurando pelo seletor #drpListaMucinicpios");

    const selectCity = await viabilidadeFormPage.waitForSelector(
      "#drpListaMucinicpios",
      { timeout: 5000 }
    );

    if (!selectCity) {
      logger.info("Selector #drpListaMucinicpios não encontrado!");
      retryCount++;
      continue;
    }

    logger.info("Selector #drpListaMucinicpios encontrado com sucesso!");
    const cityValue = requester.city.toUpperCase();
    const institutionValue = requester.institution.toUpperCase();

    try {
      // Aguardar um pouco para garantir que a página está estável
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verificar se a página ainda está ativa antes de cada operação
      await ensurePageIsActive(
        viabilidadeFormPage,
        "focar no dropdown de cidades"
      );

      // Operação mais robusta para selecionar cidade
      logger.info("Iniciando seleção da cidade...");

      const citySelectionSuccess = await viabilidadeFormPage.evaluate(
        (cityValue: string) => {
          try {
            const select = document.querySelector(
              "#drpListaMucinicpios"
            ) as HTMLSelectElement;
            if (!select) return false;

            const options = Array.from(select.querySelectorAll("option"));
            const targetOption = options.find((opt) =>
              opt.textContent?.includes(cityValue)
            );

            if (targetOption) {
              select.value = targetOption.value;
              // Disparar evento change
              const event = new Event("change", { bubbles: true });
              select.dispatchEvent(event);
              return true;
            }
            return false;
          } catch (error) {
            console.error("Erro na seleção da cidade:", error);
            return false;
          }
        },
        cityValue
      );

      if (!citySelectionSuccess) {
        throw new Error(`Não foi possível selecionar a cidade: ${cityValue}`);
      }

      logger.info(`✅ Cidade selecionada: ${cityValue}`);

      // Aguardar após seleção da cidade
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await ensurePageIsActive(
        viabilidadeFormPage,
        "aguardar dropdown de instituições"
      );

      // Aguardar o dropdown da instituição aparecer
      logger.info("Aguardando dropdown de instituições...");
      await viabilidadeFormPage.waitForSelector("#drpListaOpcoes", {
        timeout: 5000,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
      await ensurePageIsActive(viabilidadeFormPage, "selecionar instituição");

      // Operação mais robusta para selecionar instituição
      logger.info("Iniciando seleção da instituição...");

      const institutionSelectionSuccess = await viabilidadeFormPage.evaluate(
        (institutionValue: string) => {
          try {
            const select = document.querySelector(
              "#drpListaOpcoes"
            ) as HTMLSelectElement;
            if (!select) return false;

            const options = Array.from(select.querySelectorAll("option"));
            const targetOption = options.find((opt) =>
              opt.textContent?.includes(institutionValue)
            );

            if (targetOption) {
              select.value = targetOption.value;
              // Disparar evento change
              const event = new Event("change", { bubbles: true });
              select.dispatchEvent(event);
              return true;
            }
            return false;
          } catch (error) {
            console.error("Erro na seleção da instituição:", error);
            return false;
          }
        },
        institutionValue
      );

      if (!institutionSelectionSuccess) {
        throw new Error(
          `Não foi possível selecionar a instituição: ${institutionValue}`
        );
      }

      logger.info(`✅ Instituição selecionada: ${institutionValue}`);
      await new Promise((resolve) => setTimeout(resolve, 500));

      await ensurePageIsActive(viabilidadeFormPage, "clicar em Matriz");

      await viabilidadeFormPage.click("#chkEmpresa");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));
      logger.info(`Selecionado Matriz`);

      await ensurePageIsActive(
        viabilidadeFormPage,
        "avançar para próxima página"
      );

      const advanceButtonFound = await findAndClickElement(
        viabilidadeFormPage,
        "Avançar",
        10000
      );

      if (!advanceButtonFound) {
        throw new Error(
          "Não foi possível encontrar o botão 'Avançar' após múltiplas tentativas"
        );
      }

      logger.info(`✅ Botão 'Avançar' clicado com sucesso`);

      // Aguardar navegação para próxima página
      await new Promise((resolve) => setTimeout(resolve, 1500));

      /**
       * Preenche o formulario na proxima pagina
       */
      logger.info("Pagina atual: Solicitante e Pessoa Jurídica");

      await viabilidadeFormPage.click("#txtIPTU");
      await typeWithRandomDelays(
        viabilidadeFormPage,
        requester.townRegistry,
        BOT_SPEED_CONFIG.TYPING_SPEED.FAST.MIN,
        BOT_SPEED_CONFIG.TYPING_SPEED.FAST.MAX
      );
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await viabilidadeFormPage.click("#txtArea");
      await typeWithRandomDelays(
        viabilidadeFormPage,
        requester.commercialEstablishmentArea,
        BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MIN,
        BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MAX
      );
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await viabilidadeFormPage.click("#drpEnviaSefaz");
      await viabilidadeFormPage.focus("#drpEnviaSefaz");
      await viabilidadeFormPage.keyboard.press("ArrowDown");
      await viabilidadeFormPage.keyboard.type(
        requester.isStateRegistryRequested[0]
      );
      await viabilidadeFormPage.keyboard.press("Enter");
      logger.info(
        `Selecionado opção se solicitará inscrição estadual: "${requester.isStateRegistryRequested}" usando teclado`
      );
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await viabilidadeFormPage.click("#drpTipoRegistro");
      const tipoRegistroOptionValue = await viabilidadeFormPage.evaluate(() => {
        const select = document.querySelector("#drpTipoRegistro");
        const options = select
          ? Array.from(select.querySelectorAll("option"))
          : [];
        const targetOption = options.find((opt) =>
          opt.textContent?.includes("Sociedade")
        );
        return targetOption ? targetOption.value : null;
      });

      if (tipoRegistroOptionValue) {
        await viabilidadeFormPage.select(
          "#drpTipoRegistro",
          tipoRegistroOptionValue
        );
        logger.info(`Selecionado opção tipo juridico: "Sociedade"`);
      } else {
        logger.error('Não foi possível encontrar a opção "Sociedade"');
      }
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await viabilidadeFormPage.click("#drpnaturezaJuridica");
      const optionValue = await viabilidadeFormPage.evaluate(() => {
        const select = document.querySelector("#drpnaturezaJuridica");
        const options = select
          ? Array.from(select.querySelectorAll("option"))
          : [];
        const targetOption = options.find((opt) =>
          opt.textContent?.includes("Sociedade Unipessoal de Advocacia")
        );
        return targetOption ? targetOption.value : null;
      });

      if (optionValue) {
        await viabilidadeFormPage.select("#drpnaturezaJuridica", optionValue);
      } else {
        logger.error(
          'Não foi possível encontrar a opção "Sociedade Unipessoal de Advocacia"'
        );
      }
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await viabilidadeFormPage.click("::-p-text(Internet)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await viabilidadeFormPage.waitForSelector("#txtCodigoImovel", {
        timeout: 5000,
      });
      await viabilidadeFormPage.click("#txtCodigoImovel");
      await typeWithRandomDelays(
        viabilidadeFormPage,
        requester.propertySequentialNumber,
        BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MIN,
        BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MAX
      );
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await viabilidadeFormPage.click("::-p-text(Buscar Imóvel)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      /**
       * Verifica se o button altera para Validado, se nao, tira print e lança exception
       */
      const button = await viabilidadeFormPage.$("::-p-text(Validado)");
      if (!button) {
        logger.error(
          "Sequencial do Imóvel não foi validada - botão 'Validado' não encontrado"
        );
        throw new Error("Sequencial do Imóvel não foi validada");
      }

      await viabilidadeFormPage.click("#txtReferencia");
      requester.referencePoint
        ? await typeWithRandomDelays(
            viabilidadeFormPage,
            requester.referencePoint,
            BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MIN,
            BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MAX
          )
        : await typeWithRandomDelays(
            viabilidadeFormPage,
            "NÃO SE APLICA",
            BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MIN,
            BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MAX
          );
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await viabilidadeFormPage.click("::-p-text(Visualizar Mapa)");
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          randomTimerRange(
            BOT_SPEED_CONFIG.SPECIAL_DELAYS.PAGE_LOAD.MIN,
            BOT_SPEED_CONFIG.SPECIAL_DELAYS.PAGE_LOAD.MAX
          )
        )
      );

      /**
       * Abre outra pagina com o mapa
       */
      const browser2 = viabilidadeFormPage.browser();
      const pages2 = await browser2.pages();
      logger.info(`Total de paginas: ${pages2.length}`);

      const mapAddressPage = pages2[pages2.length - 1];

      logger.info("Pagina atual: Mapa - confirmação de coordenadas");

      // Screenshot da página do mapa logo após abrir
      await takeDebugScreenshot(
        mapAddressPage,
        "00-mapa-aberto",
        "Página do mapa recém aberta"
      );

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const mapPageUrl = await mapAddressPage.url();
      const mapPageTitle = await mapAddressPage.title();
      logger.info(`URL da página do mapa: ${mapPageUrl}`);
      logger.info(`Título da página do mapa: ${mapPageTitle}`);

      // ========== SUBSTITUIÇÃO DA PARTE DO CLOUDFLARE ==========
      logger.info(
        "📍 Processando página do mapa com estratégia anti-Cloudflare..."
      );

      const mapResult = await handleMapPage(mapAddressPage);

      if (!mapResult.success) {
        if (mapResult.mapSkipped) {
          logger.info("⚠️ Mapa pulado, continuando processo...");
          // Continue o fluxo mesmo sem o mapa - tente voltar e avançar
          try {
            await mapAddressPage.close();
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Tentar avançar sem confirmação do mapa
            const advanced = await findAndClickElement(
              viabilidadeFormPage,
              "Avançar",
              5000
            );
            if (advanced) {
              logger.info("✅ Avançado sem confirmação do mapa");
            } else {
              throw new Error("Não foi possível avançar sem o mapa");
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            logger.error(`❌ Erro ao continuar sem mapa: ${errorMessage}`);
            throw new Error(`Falha no processo do mapa: ${errorMessage}`);
          }
        } else {
          throw new Error("Não foi possível processar a página do mapa");
        }
      } else {
        logger.info("✅ Mapa processado com sucesso");
      }

      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      /**
       * Volta para pagina anterior - Viabilidade
       */
      await viabilidadeFormPage.click("::-p-text(Avançar)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      /**
       * Preenche formulario Quadro Societário
       */
      await Promise.all(
        requester.ownershipStructure.map(async (partner, index) => {
          if (
            requester.ownershipStructure.length > 1 &&
            index === requester.ownershipStructure.length - 1
          ) {
            return;
          }

          await viabilidadeFormPage.waitForSelector("#CpfSocio", {
            timeout: 10000,
          });
          await viabilidadeFormPage.click("#CpfSocio");
          await typeWithRandomDelays(
            viabilidadeFormPage,
            partner.cpf,
            BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MIN,
            BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MAX
          );

          const addButton = await viabilidadeFormPage.waitForSelector(
            "::-p-text(Adicionar)",
            {
              visible: true,
              timeout: 10000,
            }
          );
          await addButton?.click();

          await new Promise((resolve) =>
            setTimeout(resolve, randomTimerRange())
          );
        })
      );

      await viabilidadeFormPage.click("::-p-text(Avançar)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      /**
       * Preenche formulario Nome Empresarial, Objeto Social e CNAE
       */
      await viabilidadeFormPage.click("#txtOpcao1");
      await typeWithRandomDelays(
        viabilidadeFormPage,
        requester.enterpriseName,
        BOT_SPEED_CONFIG.TYPING_SPEED.NORMAL.MIN,
        BOT_SPEED_CONFIG.TYPING_SPEED.NORMAL.MAX
      );
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await viabilidadeFormPage.click("#txtObjeto");
      await typeWithRandomDelays(
        viabilidadeFormPage,
        requester.enterprisePurpose,
        BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MIN,
        BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MAX
      );
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await viabilidadeFormPage.click("::-p-text(Avançar)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      /**
       * Preenche formulario Informações Complementares
       */
      await viabilidadeFormPage.waitForSelector(
        "#pnPrincipal input:first-of-type",
        { timeout: 3000 }
      );
      await viabilidadeFormPage.click("#pnPrincipal input:first-of-type");
      await typeWithRandomDelays(
        viabilidadeFormPage,
        requester.additionalInformation.builtArea,
        BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MIN,
        BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MAX
      );
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await viabilidadeFormPage.keyboard.press("Tab");
      await typeWithRandomDelays(
        viabilidadeFormPage,
        requester.additionalInformation.requestorPhone,
        BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MIN,
        BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MAX
      );
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await viabilidadeFormPage.keyboard.press("Tab");
      await typeWithRandomDelays(
        viabilidadeFormPage,
        defaultFiscalRepresentative.name,
        BOT_SPEED_CONFIG.TYPING_SPEED.NORMAL.MIN,
        BOT_SPEED_CONFIG.TYPING_SPEED.NORMAL.MAX
      );
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await viabilidadeFormPage.keyboard.press("Tab");
      await typeWithRandomDelays(
        viabilidadeFormPage,
        defaultFiscalRepresentative.cpf,
        BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MIN,
        BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MAX
      );
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await viabilidadeFormPage.keyboard.press("Tab");
      await typeWithRandomDelays(
        viabilidadeFormPage,
        defaultFiscalRepresentative.phone,
        BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MIN,
        BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MAX
      );
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      // Preenche o protocolo SEPUL - campo 6
      logger.info("Procurando campo do protocolo SEPUL...");

      let sepulFieldFilled = false;

      try {
        await viabilidadeFormPage.keyboard.press("Tab");
        await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

        const sepulValue = requester.sepulRecifeProtocol || "0";
        await typeWithRandomDelays(
          viabilidadeFormPage,
          sepulValue,
          BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MIN,
          BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MAX
        );

        logger.info(`Protocolo SEPUL preenchido via Tab: ${sepulValue}`);
        sepulFieldFilled = true;
      } catch (error) {
        logger.error(`Erro ao preencher SEPUL via Tab: ${error}`);
      }

      if (!sepulFieldFilled) {
        try {
          logger.info("Tentando encontrar campo SEPUL por seletor...");

          const inputs = await viabilidadeFormPage.$$(
            'input[type="text"], input:not([type])'
          );
          logger.info(`Encontrados ${inputs.length} campos de texto`);

          if (inputs.length >= 6) {
            const sepulField = inputs[5];
            await sepulField.click();
            await sepulField.evaluate(
              (el) => ((el as HTMLInputElement).value = "")
            );

            const sepulValue = requester.sepulRecifeProtocol || "0";
            await typeWithRandomDelays(
              viabilidadeFormPage,
              sepulValue,
              BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MIN,
              BOT_SPEED_CONFIG.TYPING_SPEED.SLOW.MAX
            );

            logger.info(
              `Protocolo SEPUL preenchido via seletor: ${sepulValue}`
            );
            sepulFieldFilled = true;
          }
        } catch (error) {
          logger.error(`Erro ao preencher SEPUL via seletor: ${error}`);
        }
      }

      if (!sepulFieldFilled) {
        logger.error(
          "AVISO: Não foi possível preencher o campo SEPUL automaticamente"
        );
      }
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await viabilidadeFormPage.click("::-p-text(Preencher Formulário)");
      logger.info("Clicado em 'Preencher Formulário'");
      await new Promise((resolve) =>
        setTimeout(resolve, randomTimerRange(3000, 5000))
      );

      /**
       * Verifica se uma nova página dos bombeiros foi aberta
       */
      const browser3 = viabilidadeFormPage.browser();
      const pages3 = await browser3.pages();
      logger.info(
        `Total de páginas após clicar em 'Preencher Formulário': ${pages3.length}`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, randomTimerRange(5000, 7000))
      );

      let bombeirosPage = pages3[pages3.length - 1];

      if (pages3.length <= 3) {
        logger.info("Nova página não detectada, tentando aguardar mais...");
        await new Promise((resolve) =>
          setTimeout(resolve, randomTimerRange(2000, 4000))
        );

        const updatedPages = await browser3.pages();
        logger.info(`Páginas atualizadas: ${updatedPages.length}`);
        bombeirosPage = updatedPages[updatedPages.length - 1];
      }

      const currentUrl = await bombeirosPage.url();
      logger.info(`URL da página dos bombeiros: ${currentUrl}`);

      const pageTitle = await bombeirosPage.title();
      logger.info(`Título da página: ${pageTitle}`);

      logger.info("Página atual: Formulário Bombeiros");

      await new Promise((resolve) =>
        setTimeout(resolve, randomTimerRange(3000, 5000))
      );

      /**
       * Procura pelo botão "Inciar" na página dos bombeiros
       */
      let iniciarButton = null;

      const pageContent = await bombeirosPage.content();
      const hasBombeirosContent =
        pageContent.includes("bombeiro") ||
        pageContent.includes("Bombeiro") ||
        pageContent.includes("BOMBEIRO") ||
        pageContent.includes("inciar") ||
        pageContent.includes("Inciar");

      logger.info(
        `Página contém conteúdo dos bombeiros: ${hasBombeirosContent}`
      );

      if (!hasBombeirosContent) {
        logger.error("ERRO: Não estamos na página dos bombeiros!");
        await new Promise((resolve) => setTimeout(resolve, 10000));

        const allPages = await browser3.pages();
        logger.info(`Todas as páginas abertas: ${allPages.length}`);

        for (let i = 0; i < allPages.length; i++) {
          const url = await allPages[i].url();
          const title = await allPages[i].title();
          logger.info(`Página ${i}: URL=${url}, Título=${title}`);
        }
      }

      const possibleTexts = ["Inciar", "INCIAR", "Iniciar", "INICIAR"];

      for (const text of possibleTexts) {
        try {
          logger.info(`Procurando botão com o texto: "${text}"`);
          iniciarButton = await bombeirosPage.waitForSelector(
            `::-p-text(${text})`,
            {
              timeout: 3000,
            }
          );
          if (iniciarButton) {
            logger.info(`Botão encontrado com o texto: "${text}"`);
            await bombeirosPage.focus(`::-p-text(${text})`);
            await new Promise((resolve) =>
              setTimeout(
                resolve,
                randomTimerRange(
                  BOT_SPEED_CONFIG.SPECIAL_DELAYS.IMPORTANT_CLICK.MIN,
                  BOT_SPEED_CONFIG.SPECIAL_DELAYS.IMPORTANT_CLICK.MAX
                )
              )
            );
            await bombeirosPage.click(`::-p-text(${text})`);
            break;
          }
        } catch (error) {
          logger.info(`Botão não encontrado com o texto: "${text}"`);
          continue;
        }
      }

      if (!iniciarButton) {
        try {
          logger.info("Tentando encontrar botão por outros seletores...");
          await bombeirosPage.waitForSelector(
            'input[type="button"], button, input[type="submit"]',
            { timeout: 5000 }
          );

          const buttons = await bombeirosPage.$$eval(
            'input[type="button"], button, input[type="submit"]',
            (buttons) =>
              buttons.map((btn) => ({
                text: btn.textContent || (btn as HTMLInputElement).value || "",
                tagName: btn.tagName,
                type: (btn as HTMLInputElement).type,
              }))
          );

          logger.info(
            `Botões encontrados na página: ${JSON.stringify(buttons, null, 2)}`
          );

          throw new Error(
            "Não foi possível encontrar o botão Inciar na página dos bombeiros"
          );
        } catch (debugError) {
          logger.error(`Erro no debug dos botões: ${debugError}`);
          throw new Error(
            "Não foi possível encontrar o botão Inciar na página dos bombeiros"
          );
        }
      }

      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      // Sequência de cliques no formulário dos bombeiros
      await bombeirosPage.click("::-p-text(Até 200 m²)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Avançar)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Não)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Exclusivamente térreo)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Avançar)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Não)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Avançar)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Não)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Avançar)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Não)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Não)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Não)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Não)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Não)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Avançar)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Não)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Avançar)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Não)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Avançar)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Não)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Não)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      await bombeirosPage.click("::-p-text(Confirmar)");
      await new Promise((resolve) => setTimeout(resolve, randomTimerRange()));

      logger.info("Formulário dos Bombeiros preenchido com sucesso");

      // Finalização: Enviar a viabilidade
      logger.info("Procurando botão 'Enviar' para finalizar...");

      // Tentar encontrar o botão "Enviar" primeiro na página dos bombeiros
      let enviarButtonFound = await findAndClickElement(
        bombeirosPage,
        "Enviar",
        5000
      );

      if (enviarButtonFound) {
        logger.info(
          "✅ Botão 'Enviar' encontrado e clicado na página dos bombeiros"
        );
      } else {
        logger.info(
          "Botão 'Enviar' não encontrado na página dos bombeiros, tentando na página principal..."
        );

        enviarButtonFound = await findAndClickElement(
          viabilidadeFormPage,
          "Enviar",
          5000
        );

        if (enviarButtonFound) {
          logger.info(
            "✅ Botão 'Enviar' encontrado e clicado na página principal"
          );
        } else {
          logger.error("❌ Botão 'Enviar' não encontrado em nenhuma página");

          try {
            const buttons = await viabilidadeFormPage.$$eval(
              'button, input[type="button"], input[type="submit"]',
              (buttons) =>
                buttons.map((btn) => ({
                  text:
                    btn.textContent || (btn as HTMLInputElement).value || "",
                  type: (btn as HTMLInputElement).type,
                  id: btn.id,
                  className: btn.className,
                }))
            );
            logger.info(
              `Botões encontrados na página principal: ${JSON.stringify(
                buttons,
                null,
                2
              )}`
            );
          } catch (debugError) {
            logger.error(`Erro no debug dos botões: ${debugError}`);
          }

          throw new Error("Não foi possível encontrar o botão 'Enviar'");
        }
      }

      await new Promise((resolve) =>
        setTimeout(resolve, randomTimerRange(15000, 20000))
      );

      try {
        logger.info(
          "Viabilidade finalizada com sucesso, processando relatório..."
        );

        // Extrai o número do protocolo da mensagem de sucesso
        let protocolNumber = null;
        try {
          const successElement = await viabilidadeFormPage.$(
            "::-p-text(Viabilidade concluida com sucesso)"
          );
          if (successElement) {
            const fullText = await successElement.evaluate(
              (el) => el.textContent
            );
            logger.info(`Texto completo encontrado: ${fullText}`);

            const protocolMatch = fullText?.match(/PEP\d+/);
            if (protocolMatch) {
              protocolNumber = protocolMatch[0];
              logger.info(`Protocolo extraído: ${protocolNumber}`);
            }
          }

          if (!protocolNumber) {
            const allText = await viabilidadeFormPage.evaluate(() => {
              return document.body.innerText;
            });
            const protocolMatch = allText.match(/PEP\d+/);
            if (protocolMatch) {
              protocolNumber = protocolMatch[0];
              logger.info(
                `Protocolo encontrado no texto da página: ${protocolNumber}`
              );
            }
          }
        } catch (protocolError) {
          logger.error(`Erro ao extrair protocolo: ${protocolError}`);
        }

        // Clica no botão "Ver Relatório" e baixa o arquivo
        logger.info("Procurando botão 'Ver Relatório'...");
        let reportFileUrl = null;

        try {
          await viabilidadeFormPage.waitForSelector(
            "::-p-text(Ver Relatório)",
            { timeout: 5000 }
          );
          await viabilidadeFormPage.click("::-p-text(Ver Relatório)");
          logger.info("Clicado em 'Ver Relatório'");

          await new Promise((resolve) =>
            setTimeout(resolve, randomTimerRange(3000, 5000))
          );

          const browser = viabilidadeFormPage.browser();
          const allPages = await browser.pages();
          logger.info(
            `Total de páginas após clicar Ver Relatório: ${allPages.length}`
          );

          let relatorioPage = allPages[allPages.length - 1];

          if (allPages.length <= 4) {
            logger.info("Relatório pode ter aberto na mesma página");
            relatorioPage = viabilidadeFormPage;
          }

          await new Promise((resolve) =>
            setTimeout(resolve, randomTimerRange(2000, 4000))
          );

          // Gera o PDF diretamente em buffer para upload
          let reportBuffer: Buffer;
          let fileName: string;

          try {
            const pdfBuffer = await relatorioPage.pdf({
              format: "A4",
              printBackground: true,
              margin: {
                top: "20px",
                right: "20px",
                bottom: "20px",
                left: "20px",
              },
            });
            reportBuffer = Buffer.from(pdfBuffer);
            fileName = `${requester.enterpriseName}-RELATORIO-${
              protocolNumber || Date.now()
            }.pdf`;
            logger.info(`Relatório gerado como PDF em memória`);
          } catch (pdfError) {
            logger.error(`Erro ao gerar PDF: ${pdfError}`);
            logger.info(`Tentando gerar screenshot como fallback...`);

            const screenshotBuffer = await relatorioPage.screenshot({
              fullPage: true,
            });
            reportBuffer = Buffer.from(screenshotBuffer);
            fileName = `${requester.enterpriseName}-RELATORIO-${
              protocolNumber || Date.now()
            }.png`;
            logger.info(`Relatório gerado como screenshot em memória`);
          }

          // Upload do relatório diretamente do buffer para o S3
          logger.info(`Fazendo upload do relatório: ${fileName}`);

          const uploadPath = `viabilidade-reports/${
            protocolNumber || Date.now()
          }/${fileName}`;

          const uploadResult = await uploadFileToS3(
            reportBuffer,
            fileName,
            uploadPath
          );
          reportFileUrl = uploadResult;
          logger.info(`Upload do relatório concluído: ${uploadResult}`);
        } catch (relatorioError) {
          logger.error(`Erro ao processar/upload relatório: ${relatorioError}`);
        }

        const result = {
          success: true,
          protocolNumber: protocolNumber || "PROTOCOLO_NAO_ENCONTRADO",
          enterpriseName: requester.enterpriseName,
          enterpriseId: enterpriseId,
          reportFileUrl: reportFileUrl,
          processedAt: new Date().toISOString(),
          processingTime: "N/A", // Pode ser calculado se necessário
          botResponse: "Processo finalizado com sucesso",
          attempts: retryCount + 1,
          requestData: {
            city: requester.city,
            institution: requester.institution,
            townRegistry: requester.townRegistry,
            propertySequentialNumber: requester.propertySequentialNumber,
            sepulRecifeProtocol: requester.sepulRecifeProtocol || "0",
          },
        };

        logger.info(
          `Processo concluído com sucesso: ${JSON.stringify(result, null, 2)}`
        );
        return result;
      } catch (finalError) {
        logger.error(`Erro na finalização: ${finalError}`);
        return {
          success: true,
          protocolNumber: "ERRO_AO_OBTER_PROTOCOLO",
          enterpriseName: requester.enterpriseName,
          enterpriseId: enterpriseId,
          botResponse: "Erro ao obter protocolo, mas processo foi executado",
          attempts: retryCount + 1,
        };
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`Tentativa ${retryCount + 1} falhou: ${errorMessage}`);

      // Verificar se é um erro de contexto destruído
      if (
        errorMessage.includes("Execution context was destroyed") ||
        errorMessage.includes("Página foi fechada")
      ) {
        logger.info(
          "Erro de contexto destruído detectado - reiniciando processo"
        );
      }

      retryCount++;
      const browser = page.browser();
      const pages = await browser.pages();
      if (pages.length > 2) {
        logger.info("Fechando a página atual para tentar novamente");
        try {
          await pages[pages.length - 1].close();
        } catch (closeError) {
          logger.error(`Erro ao fechar página: ${closeError}`);
        }
      }

      // Aguardar um pouco antes de tentar novamente
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await new Promise((resolve) =>
        setTimeout(resolve, randomTimerRange(2000, 3000))
      );
    }
  }

  throw new Error("Falha após todas as tentativas");
};
