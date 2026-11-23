import { IsString, MinLength } from 'class-validator';

export class UpdatePasswordDto {
  // Mesmo mínimo que o Supabase Auth usava por padrão.
  @IsString()
  @MinLength(6)
  password!: string;
}
