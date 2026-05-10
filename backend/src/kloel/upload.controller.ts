import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('KLOEL Upload')
@Controller('kloel/upload')
export class UploadController {}
