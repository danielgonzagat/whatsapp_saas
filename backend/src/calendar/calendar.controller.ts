import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CalendarService, CalendarEvent } from './calendar.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';

class CreateEventDto {
  summary: string;
  description?: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  attendees?: string[];
  location?: string;
}

@ApiTags('Calendar')
@ApiBearerAuth()
@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('events')
  @ApiOperation({ summary: 'List calendar events' })
  async listEvents(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.calendarService.listEvents(
      workspaceId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Post('events')
  @ApiOperation({ summary: 'Create a calendar event' })
  async createEvent(@Req() req: any, @Body() dto: CreateEventDto) {
    const workspaceId = resolveWorkspaceId(req);
    
    const event: CalendarEvent = {
      summary: dto.summary,
      description: dto.description,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      attendees: dto.attendees,
      location: dto.location,
    };

    return this.calendarService.createEvent(workspaceId, event);
  }

  @Delete('events/:eventId')
  @ApiOperation({ summary: 'Cancel a calendar event' })
  async cancelEvent(@Req() req: any, @Param('eventId') eventId: string) {
    const workspaceId = resolveWorkspaceId(req);
    const success = await this.calendarService.cancelEvent(workspaceId, eventId);
    return { success };
  }
}
