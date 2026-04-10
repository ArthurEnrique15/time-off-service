import { IsOptional, IsString } from 'class-validator';

export class ApproveRejectTimeOffRequestDto {
  @IsString()
  @IsOptional()
  actorId?: string;
}
