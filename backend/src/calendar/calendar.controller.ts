import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { CalendarEvent, CalendarService } from './calendar.service';

class CreateEventDto {
  summary: string;
  description?: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  attendees?: string[];
  location?: string;
}

/** Calendar controller. */
@ApiTags('Calendar')
@ApiBearerAuth()
@UseGuards(ThrottlerGuard)
@Controller('calendar')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  /** List events. */
  @Get('events')
  @ApiOperation({ summary: 'List calendar events' })
  async listEvents(
    @Req() req: AuthenticatedRequest,
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

  /** Create event. */
  @Post('events')
  @ApiOperation({ summary: 'Create a calendar event' })
  async createEvent(@Req() req: AuthenticatedRequest, @Body() dto: CreateEventDto) {
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

  /** Cancel event. */
  @Delete('events/:eventId')
  @ApiOperation({ summary: 'Cancel a calendar event' })
  async cancelEvent(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string) {
    const workspaceId = resolveWorkspaceId(req);
    const success = await this.calendarService.cancelEvent(workspaceId, eventId);
    return { success };
  }
}
