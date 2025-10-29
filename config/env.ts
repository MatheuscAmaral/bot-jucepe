import "dotenv/config";

export const BOT_SPEED_CONFIG = {
  ACTION_DELAY: {
    MIN: process.env.BOT_ACTION_DELAY_MIN || 0,
    MAX: process.env.BOT_ACTION_DELAY_MAX || 0,
  },
  TYPING_SPEED: {
    FAST: {
      MIN: process.env.BOT_TYPING_FAST_MIN || 0,
      MAX: process.env.BOT_TYPING_FAST_MAX || 0,
    },
    NORMAL: {
      MIN: process.env.BOT_TYPING_NORMAL_MIN || 0,
      MAX: process.env.BOT_TYPING_NORMAL_MAX || 0,
    },
    SLOW: {
      MIN: process.env.BOT_TYPING_SLOW_MIN || 0,
      MAX: process.env.BOT_TYPING_SLOW_MAX || 0,
    },
  },

  SPECIAL_DELAYS: {
    PAGE_LOAD: {
      MIN: process.env.BOT_PAGE_LOAD_MIN || 0,
      MAX: process.env.BOT_PAGE_LOAD_MAX || 0,
    },
    IMPORTANT_CLICK: {
      MIN: process.env.BOT_IMPORTANT_CLICK_MIN || 0,
      MAX: process.env.BOT_IMPORTANT_CLICK_MAX || 0,
    },
    FINAL_SUBMIT: {
      MIN: process.env.BOT_FINAL_SUBMIT_MIN || 0,
      MAX: process.env.BOT_FINAL_SUBMIT_MAX || 0,
    },
  },
};

export const BOT_CONFIG = {
  institution: process.env.BOT_INSTITUTION || "",
  isStateRegistryRequested: process.env.BOT_STATE_REGISTRY_REQUESTED || "",
  commercialEstablishmentArea: process.env.BOT_COMMERCIAL_AREA || "",
  propertySequentialNumber: process.env.BOT_PROPERTY_SEQUENTIAL_NUMBER || "",
  sepulRecifeProtocol: process.env.BOT_SEPUL_RECIFE_PROTOCOL || "",
  additionalInformation: {
    builtArea: process.env.BOT_BUILT_AREA || "",
    requestorPhone: process.env.BOT_REQUESTOR_PHONE || "",
  },
};

export const BOT_CREDENTIALS = {
  cpf: process.env.BOT_CPF || "",
  password: process.env.BOT_PASSWORD || "",
};

export const FISCAL_REPRESENTATIVE = {
  name: process.env.BOT_FISCAL_REP_NAME || "",
  cpf: process.env.BOT_FISCAL_REP_CPF || "",
  phone: process.env.BOT_FISCAL_REP_PHONE || "",
};

export const API_CONFIG = {
  obviaApiUrl: process.env.OBVIA_API_URL || "",
  botApiSecret: process.env.BOT_API_SECRET || "",
  port: process.env.PORT || 3000,
};

export const PUPPETEER_CONFIG = {
  headless: process.env.BOT_HEADLESS === "false" ? false : true,
  slowMo: parseInt(process.env.BOT_SLOW_MO || "100"),
  windowSize: {
    width: parseInt(process.env.BOT_WINDOW_WIDTH || "1920"),
    height: parseInt(process.env.BOT_WINDOW_HEIGHT || "1080"),
  },
};

export const RETRY_CONFIG = {
  maxRetries: parseInt(process.env.BOT_MAX_RETRIES || "3"),
  retryDelay: parseInt(process.env.BOT_RETRY_DELAY || "5000"),
  timeout: parseInt(process.env.BOT_TIMEOUT || "60000"),
};

export const SYSTEM_URLS = {
  jucepeLogin:
    process.env.JUCEPE_LOGIN_URL ||
    "https://redesim.jucepe.pe.gov.br/requerimentouniversal/NovoLogin.aspx",
};

export function validateRequiredEnvVars(): void {
  const requiredVars = [
    { key: "BOT_CPF", value: BOT_CREDENTIALS.cpf },
    { key: "BOT_PASSWORD", value: BOT_CREDENTIALS.password },
    { key: "BOT_FISCAL_REP_NAME", value: FISCAL_REPRESENTATIVE.name },
    { key: "BOT_FISCAL_REP_CPF", value: FISCAL_REPRESENTATIVE.cpf },
    { key: "BOT_FISCAL_REP_PHONE", value: FISCAL_REPRESENTATIVE.phone },
    { key: "OBVIA_API_URL", value: API_CONFIG.obviaApiUrl },
    { key: "BOT_API_SECRET", value: API_CONFIG.botApiSecret },
  ];

  const missingVars = requiredVars.filter(({ value }) => !value);

  if (missingVars.length > 0) {
    const missingKeys = missingVars.map(({ key }) => key).join(", ");
    throw new Error(
      `Variáveis de ambiente obrigatórias não definidas: ${missingKeys}`
    );
  }
}
