import { IsIn, IsString } from 'class-validator';

/** Kyc document type dto. */
export class KycDocumentTypeDto {
  /** Type property. */
  @IsString()
  @IsIn(['DOCUMENT_FRONT', 'DOCUMENT_BACK', 'PROOF_OF_ADDRESS', 'COMPANY_DOCUMENT'])
  type: string;
}
