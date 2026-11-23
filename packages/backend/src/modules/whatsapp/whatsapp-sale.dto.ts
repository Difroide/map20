import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, Matches } from 'class-validator';

export class WhatsappSaleDto {
  @IsUUID()
  workspace_id!: string;

  @IsString()
  external_id!: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  product_name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^stl_[0-9a-f-]{36}$/, { message: 'tracking_ref must be stl_<uuid>' })
  tracking_ref?: string;

  @IsOptional()
  @IsString()
  fbclid?: string;

  @IsOptional()
  @IsString()
  utm_source?: string;

  @IsOptional()
  @IsString()
  utm_medium?: string;

  @IsOptional()
  @IsString()
  utm_campaign?: string;

  @IsOptional()
  @IsString()
  utm_content?: string;

  @IsOptional()
  @IsString()
  utm_term?: string;
}
