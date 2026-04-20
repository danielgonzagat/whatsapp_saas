import { IsIn, IsString } from 'class-validator';

/** Kyc document type dto. */
export class KycDocumentTypeDto {
  @IsString()
  @IsIn(['CPF', 'CNPJ', 'RG', 'CNH', 'PASSPORT', 'SELFIE', 'PROOF_OF_ADDRESS', 'OTHER'])
  type: string;
}
