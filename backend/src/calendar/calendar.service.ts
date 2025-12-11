import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendees?: string[];
  location?: string;
  meetingLink?: string;
}

export interface CalendarConfig {
  provider: 'google' | 'outlook' | 'internal';
  credentials?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    accessToken?: string;
  };
}

/**
 * 📅 Calendar Service
 * 
 * Serviço para integração com calendários (Google Calendar, Outlook, interno).
 * Permite criar eventos, agendamentos e sincronização bidirecional.
 */
@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Obtém configuração de calendário do workspace
   */
  async getCalendarConfig(workspaceId: string): Promise<CalendarConfig | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const settings = workspace?.providerSettings as any;
    return settings?.calendar || null;
  }

  /**
   * Cria um evento no calendário
   * Por padrão usa calendário interno (persistido no DB)
   * Se configurado, sincroniza com Google Calendar ou Outlook
   */
  async createEvent(workspaceId: string, event: CalendarEvent): Promise<CalendarEvent> {
    const config = await this.getCalendarConfig(workspaceId);

    // Tentar criar no provedor externo se configurado
    if (config?.provider === 'google' && config.credentials?.refreshToken) {
      try {
        const externalEvent = await this.createGoogleCalendarEvent(config, event);
        if (externalEvent) {
          // Salvar referência localmente
          await this.saveInternalEvent(workspaceId, { ...event, id: externalEvent.id });
          return externalEvent;
        }
      } catch (error: any) {
        this.logger.error(`[Calendar] Erro Google Calendar: ${error.message}`);
      }
    }

    // Fallback: salvar internamente
    return this.saveInternalEvent(workspaceId, event);
  }

  /**
   * Salva evento no banco de dados interno
   */
  private async saveInternalEvent(workspaceId: string, event: CalendarEvent): Promise<CalendarEvent> {
    // Usar tabela Appointment se existir, ou criar entrada genérica
    try {
      const appointment = await this.prisma.appointment.create({
        data: {
          workspaceId,
          title: event.summary,
          description: event.description,
          startAt: event.startTime,
          endAt: event.endTime,
          location: event.location,
          meetingUrl: event.meetingLink,
          status: 'SCHEDULED',
          metadata: {
            attendees: event.attendees,
          },
        },
      });

      return {
        id: appointment.id,
        summary: appointment.title,
        description: appointment.description || undefined,
        startTime: appointment.startAt,
        endTime: appointment.endAt,
        location: appointment.location || undefined,
        meetingLink: appointment.meetingUrl || undefined,
      };
    } catch (error: any) {
      this.logger.error(`[Calendar] Erro ao salvar evento interno: ${error.message}`);
      
      // Se tabela não existe, retornar evento simulado
      return {
        id: `local_${Date.now()}`,
        ...event,
      };
    }
  }

  /**
   * Cria evento no Google Calendar
   */
  private async createGoogleCalendarEvent(
    config: CalendarConfig,
    event: CalendarEvent,
  ): Promise<CalendarEvent | null> {
    try {
      // Importar googleapis dinamicamente para evitar dependência obrigatória
      const { google } = await import('googleapis');

      const oauth2Client = new google.auth.OAuth2(
        config.credentials?.clientId || this.configService.get('GOOGLE_CLIENT_ID'),
        config.credentials?.clientSecret || this.configService.get('GOOGLE_CLIENT_SECRET'),
      );

      oauth2Client.setCredentials({
        refresh_token: config.credentials?.refreshToken,
        access_token: config.credentials?.accessToken,
      });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: event.summary,
          description: event.description,
          start: { dateTime: event.startTime.toISOString() },
          end: { dateTime: event.endTime.toISOString() },
          location: event.location,
          attendees: event.attendees?.map((email) => ({ email })),
          conferenceData: event.meetingLink
            ? undefined
            : {
                createRequest: {
                  requestId: `kloel_${Date.now()}`,
                  conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
              },
        },
        conferenceDataVersion: 1,
      });

      const createdEvent = response.data;

      return {
        id: createdEvent.id || undefined,
        summary: createdEvent.summary || event.summary,
        description: createdEvent.description || event.description,
        startTime: new Date(createdEvent.start?.dateTime || event.startTime),
        endTime: new Date(createdEvent.end?.dateTime || event.endTime),
        location: createdEvent.location || event.location,
        meetingLink: createdEvent.hangoutLink || event.meetingLink,
      };
    } catch (error: any) {
      this.logger.error(`[Calendar] Google Calendar API error: ${error.message}`);
      return null;
    }
  }

  /**
   * Lista eventos do workspace
   */
  async listEvents(
    workspaceId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<CalendarEvent[]> {
    try {
      const appointments = await this.prisma.appointment.findMany({
        where: {
          workspaceId,
          ...(startDate && { startAt: { gte: startDate } }),
          ...(endDate && { endAt: { lte: endDate } }),
        },
        orderBy: { startAt: 'asc' },
        take: 100,
      });

      return appointments.map((apt) => ({
        id: apt.id,
        summary: apt.title,
        description: apt.description || undefined,
        startTime: apt.startAt,
        endTime: apt.endAt,
        location: apt.location || undefined,
        meetingLink: apt.meetingUrl || undefined,
      }));
    } catch (error: any) {
      this.logger.error(`[Calendar] Erro ao listar eventos: ${error.message}`);
      return [];
    }
  }

  /**
   * Cancela um evento
   */
  async cancelEvent(workspaceId: string, eventId: string): Promise<boolean> {
    try {
      await this.prisma.appointment.update({
        where: { id: eventId, workspaceId },
        data: { status: 'CANCELLED' },
      });
      return true;
    } catch (error: any) {
      this.logger.error(`[Calendar] Erro ao cancelar evento: ${error.message}`);
      return false;
    }
  }

  /**
   * Cria um agendamento para um contato (usado pela skill engine)
   */
  async createAppointmentForContact(
    workspaceId: string,
    contactId: string,
    datetime: Date,
    description?: string,
    durationMinutes: number = 30,
  ): Promise<CalendarEvent> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { name: true, email: true, phone: true },
    });

    const endTime = new Date(datetime.getTime() + durationMinutes * 60 * 1000);

    const event: CalendarEvent = {
      summary: `Reunião com ${contact?.name || 'Lead'}`,
      description: description || `Agendamento automático via KLOEL`,
      startTime: datetime,
      endTime,
      attendees: contact?.email ? [contact.email] : [],
    };

    const created = await this.createEvent(workspaceId, event);

    // Vincular ao contato
    if (created.id && contact) {
      try {
        await this.prisma.appointment.update({
          where: { id: created.id },
          data: { contactId },
        });
      } catch {}
    }

    return created;
  }
}
