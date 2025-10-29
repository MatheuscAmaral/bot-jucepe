export interface WebhookViabilityRequest {
  enterpriseId: number;
  enterpriseName: string;
  enterprisePurpose: string;
  city: string;
  state: string;
  townRegistry: string;
  referencePoint?: string;
  ownershipStructure: Array<{
    cpf: string;
  }>;
}

export interface BotResult {
  success: boolean;
  protocolNumber: string;
  enterpriseName: string;
  enterpriseId: number;
  reportFileUrl?: string | null;
  processedAt?: string;
  processingTime?: string;
  botResponse?: string;
  attempts?: number;
  requestData?: {
    city: string;
    institution: string;
    townRegistry: string;
    propertySequentialNumber: string;
    sepulRecifeProtocol: string;
  };
}

export interface NotificationPayload {
  file_url: string | null;
  enterprise_id: number;
  logs: {
    status: "completed" | "failed" | "processing";
    protocol_number: string;
    processing_time: string;
    bot_response: string;
    attempts: number;
  };
}

export interface CallbackSuccessData {
  success: true;
  result: BotResult;
  timestamp: string;
}

export interface CallbackErrorData {
  success: false;
  error: string;
  timestamp: string;
}

export type CallbackData = CallbackSuccessData | CallbackErrorData;
