import { IsString, IsOptional, IsNumber, IsArray, IsObject } from 'class-validator';

export class CreateOrderDto {
  @IsString() slug: string;
  @IsObject() customer: { name: string; email: string; cpf?: string; phone?: string };
  @IsObject() address: { cep: string; street: string; number: string; neighborhood: string; complement?: string; city?: string; state?: string };
  @IsString() paymentMethod: string;
  @IsOptional() @IsString() couponCode?: string;
  @IsOptional() @IsArray() acceptedBumps?: string[];
  @IsOptional() @IsNumber() installments?: number;
}
