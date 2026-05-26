import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

/** Shape of a calendar event used by Google Calendar helpers. */
export interface GoogleCalendarEventParams {
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendees?: string[];
  location?: string;
  meetingLink?: string;
  id?: string;
}

/** Shape of calendar config used by Google Calendar helpers. */
export interface GoogleCalendarConfig {
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
 * Google Calendar integration helper.
 *
 * Handles OAuth2 credential setup, event creation, and event listing
 * against the Google Calendar API.
 */
export class CalendarGoogleHelper {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {}

  /** Create an event in Google Calendar. Returns null on failure. */
  async createEvent(
    config: GoogleCalendarConfig,
    event: GoogleCalendarEventParams,
  ): Promise<GoogleCalendarEventParams | null> {
    try {
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

      const eventResult: GoogleCalendarEventParams = {
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

  /** List events from Google Calendar. */
  async listEvents(
    config: GoogleCalendarConfig,
    startDate?: Date,
    endDate?: Date,
  ): Promise<GoogleCalendarEventParams[]> {
    try {
      const googleCalendarModuleName = 'googleapis';
      const { google } = (await import(googleCalendarModuleName)) as GoogleCalendarModule;

      const oauth2Client = new google.auth.OAuth2(
        config.credentials?.clientId || this.configService.get('GOOGLE_CLIENT_ID'),
        config.credentials?.clientSecret || this.configService.get('GOOGLE_CLIENT_SECRET'),
      );

      const googleCredentials: { refresh_token?: string; access_token?: string } = {
        refresh_token: config.credentials?.refreshToken,
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
        (item): GoogleCalendarEventParams => ({
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
}