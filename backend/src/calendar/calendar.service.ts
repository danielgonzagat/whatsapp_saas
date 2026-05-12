import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  asProviderSettings,
  type ProviderCalendarSettings,
} from '../whatsapp/provider-settings.types';

interface AppointmentRecord {
  id: string;
  title?: string;
  description?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  location?: string | null;
  meetingUrl?: string | null;
  status?: string;
  [key: string]: unknown;
}

/** Calendar event shape. */
export interface CalendarEvent {
  /** Id property. */
  id?: string;
  /** Summary property. */
  summary: string;
  /** Description property. */
  description?: string;
  /** Start time property. */
  startTime: Date;
  /** End time property. */
  endTime: Date;
  /** Attendees property. */
  attendees?: string[];
  /** Location property. */
  location?: string;
  /** Meeting link property. */
  meetingLink?: string;
}

interface CalendarConfig {
  provider: 'google' | 'outlook' | 'internal';
  credentials?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    accessToken?: string;
  };
}

type GoogleCalendarEventItem = {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  start?: { dateTime?: string | Date | null } | null;
  end?: { dateTime?: string | Date | null } | null;
  location?: string | null;
  hangoutLink?: string | null;
};

type GoogleCalendarModule = {
  google: {
    auth: {
      OAuth2: new (
        clientId?: string,
        clientSecret?: string,
      ) => {
        setCredentials(credentials: { refresh_token?: string; access_token?: string }): void;
      };
    };
    calendar(args: {
      version: 'v3';
      auth: {
        setCredentials(credentials: { refresh_token?: string; access_token?: string }): void;
      };
    }): {
      events: {
        insert(args: {
          calendarId: string;
          requestBody: {
            summary: string;
            description?: string;
            start: { dateTime: string };
            end: { dateTime: string };
            location?: string;
            attendees?: Array<{ email: string }>;
            conferenceData?:
              | {
                  createRequest: {
                    requestId: string;
                    conferenceSolutionKey: { type: 'hangoutsMeet' };
                  };
                }
              | undefined;
          };
          conferenceDataVersion: number;
        }): Promise<{ data: GoogleCalendarEventItem }>;
        list(args: {
          calendarId: string;
          timeMin?: string;
          timeMax?: string;
          maxResults?: number;
          singleEvents?: boolean;
          orderBy?: string;
        }): Promise<{ data: { items?: GoogleCalendarEventItem[] } }>;
      };
    };
  };
};

/**
 * 📅 Calendar Service
 *
 * Serviço para integração com calendários (Google Calendar, Outlook, interno).
 * Permite criar eventos, agendamentos e sincronização bidirecional.
 */
@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  private getAppointmentModel(): {
    create?: (...args: unknown[]) => Promise<AppointmentRecord>;
    findMany?: (...args: unknown[]) => Promise<AppointmentRecord[]>;
    update?: (...args: unknown[]) => Promise<AppointmentRecord>;
  } | null {
    type AppointmentModel = {
      create?: (...args: unknown[]) => Promise<AppointmentRecord>;
      findMany?: (...args: unknown[]) => Promise<AppointmentRecord[]>;
      update?: (...args: unknown[]) => Promise<AppointmentRecord>;
    };
    const model = Reflect.get(this.prisma, 'appointment') as AppointmentModel | undefined;
    return model ?? null;
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private normalizeCalendarConfig(value: unknown): CalendarConfig | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const config = value as ProviderCalendarSettings;
    if (
      config.provider !== 'google' &&
      config.provider !== 'outlook' &&
      config.provider !== 'internal'
    ) {
      return null;
    }

    const credentials =
      config.credentials &&
      typeof config.credentials === 'object' &&
      !Array.isArray(config.credentials)
        ? {
            ...(typeof config.credentials.clientId === 'string'
              ? { clientId: config.credentials.clientId }
              : {}),
            ...(typeof config.credentials.clientSecret === 'string'
              ? { clientSecret: config.credentials.clientSecret }
              : {}),
            ...(typeof config.credentials.refreshToken === 'string'
              ? { refreshToken: config.credentials.refreshToken }
              : {}),
            ...(typeof config.credentials.accessToken === 'string'
              ? { accessToken: config.credentials.accessToken }
              : {}),
          }
        : undefined;

    return {
      provider: config.provider,
      ...(credentials && Object.keys(credentials).length > 0 ? { credentials } : {}),
    };
  }

  /**
   * Obtém configuração de calendário do workspace
   */
  async getCalendarConfig(workspaceId: string): Promise<CalendarConfig | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    return this.normalizeCalendarConfig(asProviderSettings(workspace?.providerSettings).calendar);
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
          await this.saveInternalEvent(workspaceId, {
            summary: event.summary,
            ...(event.description !== undefined ? { description: event.description } : {}),
            startTime: event.startTime,
            endTime: event.endTime,
            ...(event.attendees !== undefined ? { attendees: event.attendees } : {}),
            ...(event.location !== undefined ? { location: event.location } : {}),
            ...(event.meetingLink !== undefined ? { meetingLink: event.meetingLink } : {}),
            ...(externalEvent.id !== undefined ? { id: externalEvent.id } : {}),
          });
          return externalEvent;
        }
      } catch (error: unknown) {
        this.logger.error(
          `[Calendar] Erro Google Calendar: ${error instanceof Error ? error.message : 'unknown_error'}`,
        );
      }
    }

    // Fallback: salvar internamente
    return this.saveInternalEvent(workspaceId, event);
  }

  /**
   * Salva evento no banco de dados interno
   */
  private async saveInternalEvent(
    workspaceId: string,
    event: CalendarEvent,
  ): Promise<CalendarEvent> {
    // Usar tabela Appointment se existir, ou criar entrada genérica
    try {
      const appointmentModel = this.getAppointmentModel();
      if (!appointmentModel?.create) {
        throw new Error('appointment_model_unavailable');
      }

      const appointment = await appointmentModel.create({
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

      const descVal = appointment.description || undefined;
      const locVal = appointment.location || undefined;
      const linkVal = appointment.meetingUrl || undefined;
      const result: CalendarEvent = {
        id: appointment.id,
        summary: appointment.title || '',
        startTime: appointment.startAt ?? event.startTime,
        endTime: appointment.endAt ?? event.endTime,
      };
      if (descVal) {
        result.description = descVal;
      }
      if (locVal) {
        result.location = locVal;
      }
      if (linkVal) {
        result.meetingLink = linkVal;
      }
      return result;
    } catch (error: unknown) {
      this.logger.error(
        `[Calendar] Erro ao salvar evento interno: ${error instanceof Error ? error.message : 'unknown_error'}`,
      );

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
      const googleCalendarModuleName = 'googleapis';
      const { google } = (await import(googleCalendarModuleName)) as GoogleCalendarModule;

      const oauth2Client = new google.auth.OAuth2(
        config.credentials?.clientId || this.configService.get('GOOGLE_CLIENT_ID'),
        config.credentials?.clientSecret || this.configService.get('GOOGLE_CLIENT_SECRET'),
      );

      const creds: { refresh_token?: string; access_token?: string } = {};
      const refreshToken = config.credentials?.refreshToken;
      const accessToken = config.credentials?.accessToken;
      if (refreshToken) {
        creds.refresh_token = refreshToken;
      }
      if (accessToken) {
        creds.access_token = accessToken;
      }
      oauth2Client.setCredentials(creds);

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      const requestBody: Record<string, unknown> = {
        summary: event.summary,
        start: { dateTime: event.startTime.toISOString() },
        end: { dateTime: event.endTime.toISOString() },
      };
      if (event.description) {
        requestBody.description = event.description;
      }
      if (event.location) {
        requestBody.location = event.location;
      }
      if (event.attendees) {
        requestBody.attendees = event.attendees.map((email) => ({ email }));
      }
      if (!event.meetingLink) {
        requestBody.conferenceData = {
          createRequest: {
            requestId: `kloel_${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        };
      }

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: requestBody as {
          summary: string;
          description?: string;
          start: { dateTime: string };
          end: { dateTime: string };
          location?: string;
          attendees?: Array<{ email: string }>;
          conferenceData?: {
            createRequest: {
              requestId: string;
              conferenceSolutionKey: { type: 'hangoutsMeet' };
            };
          };
        },
        conferenceDataVersion: 1,
      });

      const createdEvent = response.data;

      const eventResult: CalendarEvent = {
        summary: createdEvent.summary || event.summary,
        startTime: new Date(createdEvent.start?.dateTime || event.startTime),
        endTime: new Date(createdEvent.end?.dateTime || event.endTime),
      };
      if (createdEvent.id) {
        eventResult.id = createdEvent.id;
      }
      const desc = createdEvent.description || event.description;
      if (desc) {
        eventResult.description = desc;
      }
      const loc = createdEvent.location || event.location;
      if (loc) {
        eventResult.location = loc;
      }
      const link = createdEvent.hangoutLink || event.meetingLink;
      if (link) {
        eventResult.meetingLink = link;
      }
      return eventResult;
    } catch (error: unknown) {
      this.logger.error(
        `[Calendar] Google Calendar API error: ${error instanceof Error ? error.message : 'unknown_error'}`,
      );
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
    const appointmentModel = this.getAppointmentModel();
    if (appointmentModel?.findMany) {
      try {
        const appointments = await appointmentModel.findMany({
          where: {
            workspaceId,
            ...(startDate && { startAt: { gte: startDate } }),
            ...(endDate && { endAt: { lte: endDate } }),
          },
          orderBy: { startAt: 'asc' },
          take: 100,
          select: {
            id: true,
            title: true,
            description: true,
            startAt: true,
            endAt: true,
            location: true,
            meetingUrl: true,
            status: true,
            contactId: true,
          },
        });

        return appointments.map((apt) => {
          const item: CalendarEvent = {
            id: apt.id,
            summary: apt.title || '',
            startTime: apt.startAt ?? new Date(),
            endTime: apt.endAt ?? new Date(),
          };
          if (apt.description) {
            item.description = apt.description;
          }
          if (apt.location) {
            item.location = apt.location;
          }
          if (apt.meetingUrl) {
            item.meetingLink = apt.meetingUrl;
          }
          return item;
        });
      } catch (error: unknown) {
        this.logger.error(
          `Failed to fetch events: ${error instanceof Error ? error.message : 'unknown_error'}`,
        );
        throw error;
      }
    }

    return this.listFromCalendarProvider(workspaceId, startDate, endDate);
  }

  private async listFromCalendarProvider(
    workspaceId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<CalendarEvent[]> {
    const config = await this.getCalendarConfig(workspaceId);
    if (!config || config.provider !== 'google' || !config.credentials?.refreshToken) {
      return [];
    }

    try {
      const googleCalendarModuleName = 'googleapis';
      const { google } = (await import(googleCalendarModuleName)) as GoogleCalendarModule;

      const oauth2Client = new google.auth.OAuth2(
        config.credentials?.clientId || this.configService.get('GOOGLE_CLIENT_ID'),
        config.credentials?.clientSecret || this.configService.get('GOOGLE_CLIENT_SECRET'),
      );

      const googleCredentials: { refresh_token?: string; access_token?: string } = {
        refresh_token: config.credentials.refreshToken,
      };
      if (config.credentials?.accessToken) {
        googleCredentials.access_token = config.credentials.accessToken;
      }
      oauth2Client.setCredentials(googleCredentials);

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      const listParams: Record<string, unknown> = {
        calendarId: 'primary',
        maxResults: 100,
        singleEvents: true,
        orderBy: 'startTime',
      };
      if (startDate) {
        listParams.timeMin = startDate.toISOString();
      }
      if (endDate) {
        listParams.timeMax = endDate.toISOString();
      }
      const response = await calendar.events.list(
        listParams as Parameters<typeof calendar.events.list>[0],
      );

      return (response.data.items || []).map(
        (item): CalendarEvent => ({
          ...(item.id ? { id: item.id } : {}),
          summary: item.summary || '',
          ...(item.description ? { description: item.description } : {}),
          startTime: item.start?.dateTime ? new Date(item.start.dateTime) : new Date(),
          endTime: item.end?.dateTime ? new Date(item.end.dateTime) : new Date(),
          ...(item.location ? { location: item.location } : {}),
          ...(item.hangoutLink ? { meetingLink: item.hangoutLink } : {}),
        }),
      );
    } catch (error: unknown) {
      this.logger.error(
        `[Calendar] Google Calendar list error: ${error instanceof Error ? error.message : 'unknown_error'}`,
      );
      return [];
    }
  }

  /**
   * Cancela um evento
   */
  async cancelEvent(workspaceId: string, eventId: string): Promise<boolean> {
    try {
      const appointmentModel = this.getAppointmentModel();
      if (!appointmentModel?.update) {
        return false;
      }

      await appointmentModel.update({
        where: { id: eventId, workspaceId },
        data: { status: 'CANCELLED' },
      });
      return true;
    } catch (error: unknown) {
      this.logger.error(
        `[Calendar] Erro ao cancelar evento: ${error instanceof Error ? error.message : 'unknown_error'}`,
      );
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
    durationMinutes = 30,
  ): Promise<CalendarEvent> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
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
        const appointmentModel = this.getAppointmentModel();
        if (appointmentModel?.update) {
          await appointmentModel.update({
            where: { id: created.id },
            data: { contactId },
          });
        }
      } catch (err: unknown) {
        this.logger.warn(
          `Failed to link appointment ${created.id} to contact ${contactId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return created;
  }
}
