interface additionalInformation {
  builtArea: string;
  requestorPhone: string;
}

interface Partner {
  cpf: string;
}

export interface ViabilityRequester {
  city: string;
  state: string;
  institution: string;
  townRegistry: string;
  isStateRegistryRequested: string;
  commercialEstablishmentArea: string;
  propertySequentialNumber: string;
  referencePoint?: string;
  ownershipStructure: Partner[];
  enterpriseName: string;
  enterprisePurpose: string;
  additionalInformation: additionalInformation;
  sepulRecifeProtocol?: string;
}
