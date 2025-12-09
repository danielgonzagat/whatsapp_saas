/**
 * WhatsApp Cloud API Client
 * 
 * Official Meta Graph API integration for WhatsApp Business.
 * This client handles:
 * - Sending text messages
 * - Sending media (images, videos, documents, audio)
 * - Sending templates
 * - Sending interactive messages (buttons, lists)
 * - Marking messages as read
 * - Uploading media
 * 
 * USAGE:
 *   const client = new WhatsAppCloudClient({
 *     accessToken: org.accessTokenDecrypted,
 *     phoneNumberId: org.phoneNumberId,
 *   });
 *   await client.sendText('+5511999999999', 'Hello!');
 */

import { Logger } from '@nestjs/common';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface WhatsAppCloudClientOptions {
  accessToken: string;
  phoneNumberId: string;
  logger?: Logger;
}

export interface SendMessageResponse {
  messaging_product: 'whatsapp';
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface MediaUploadResponse {
  id: string;
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'quick_reply' | 'url';
  index?: number;
  parameters: Array<{
    type: 'text' | 'image' | 'document' | 'video' | 'payload';
    text?: string;
    image?: { link: string };
    document?: { link: string; filename?: string };
    video?: { link: string };
    payload?: string;
  }>;
}

export interface InteractiveButton {
  type: 'reply';
  reply: {
    id: string;
    title: string;
  };
}

export interface InteractiveListRow {
  id: string;
  title: string;
  description?: string;
}

export interface InteractiveListSection {
  title: string;
  rows: InteractiveListRow[];
}

export class WhatsAppCloudClient {
  private accessToken: string;
  private phoneNumberId: string;
  private logger: Logger;

  constructor(options: WhatsAppCloudClientOptions) {
    this.accessToken = options.accessToken;
    this.phoneNumberId = options.phoneNumberId;
    this.logger = options.logger || new Logger('WhatsAppCloudClient');
  }

  /**
   * Base method to call Graph API.
   */
  private async callApi<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'POST',
    body?: object,
  ): Promise<T> {
    const url = `${GRAPH_API_BASE}/${this.phoneNumberId}/${endpoint}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      this.logger.error(`Cloud API error: ${JSON.stringify(error)}`);
      throw new Error(
        `WhatsApp Cloud API error: ${error?.error?.message || response.statusText}`,
      );
    }

    return response.json();
  }

  /**
   * Format phone number to E.164 (removes special chars, ensures country code).
   */
  private formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    // If starts with 0, assume Brazil and add 55
    if (digits.startsWith('0')) {
      return `55${digits.substring(1)}`;
    }
    // If no country code (less than 11 digits), add Brazil code
    if (digits.length <= 11) {
      return `55${digits}`;
    }
    return digits;
  }

  /**
   * Send a text message.
   */
  async sendText(to: string, text: string): Promise<SendMessageResponse> {
    const formattedTo = this.formatPhone(to);
    
    this.logger.log(`Sending text to ${formattedTo}`);
    
    return this.callApi<SendMessageResponse>('messages', 'POST', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'text',
      text: { body: text },
    });
  }

  /**
   * Send an image message.
   */
  async sendImage(
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<SendMessageResponse> {
    const formattedTo = this.formatPhone(to);
    
    return this.callApi<SendMessageResponse>('messages', 'POST', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'image',
      image: {
        link: imageUrl,
        caption,
      },
    });
  }

  /**
   * Send a video message.
   */
  async sendVideo(
    to: string,
    videoUrl: string,
    caption?: string,
  ): Promise<SendMessageResponse> {
    const formattedTo = this.formatPhone(to);
    
    return this.callApi<SendMessageResponse>('messages', 'POST', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'video',
      video: {
        link: videoUrl,
        caption,
      },
    });
  }

  /**
   * Send an audio message.
   */
  async sendAudio(to: string, audioUrl: string): Promise<SendMessageResponse> {
    const formattedTo = this.formatPhone(to);
    
    return this.callApi<SendMessageResponse>('messages', 'POST', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'audio',
      audio: {
        link: audioUrl,
      },
    });
  }

  /**
   * Send a document message.
   */
  async sendDocument(
    to: string,
    documentUrl: string,
    filename?: string,
    caption?: string,
  ): Promise<SendMessageResponse> {
    const formattedTo = this.formatPhone(to);
    
    return this.callApi<SendMessageResponse>('messages', 'POST', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'document',
      document: {
        link: documentUrl,
        filename,
        caption,
      },
    });
  }

  /**
   * Send a template message.
   */
  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string = 'pt_BR',
    components?: TemplateComponent[],
  ): Promise<SendMessageResponse> {
    const formattedTo = this.formatPhone(to);
    
    return this.callApi<SendMessageResponse>('messages', 'POST', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    });
  }

  /**
   * Send interactive buttons message.
   */
  async sendButtons(
    to: string,
    bodyText: string,
    buttons: InteractiveButton[],
    headerText?: string,
    footerText?: string,
  ): Promise<SendMessageResponse> {
    const formattedTo = this.formatPhone(to);
    
    const interactive: any = {
      type: 'button',
      body: { text: bodyText },
      action: { buttons },
    };
    
    if (headerText) {
      interactive.header = { type: 'text', text: headerText };
    }
    if (footerText) {
      interactive.footer = { text: footerText };
    }
    
    return this.callApi<SendMessageResponse>('messages', 'POST', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'interactive',
      interactive,
    });
  }

  /**
   * Send interactive list message.
   */
  async sendList(
    to: string,
    bodyText: string,
    buttonText: string,
    sections: InteractiveListSection[],
    headerText?: string,
    footerText?: string,
  ): Promise<SendMessageResponse> {
    const formattedTo = this.formatPhone(to);
    
    const interactive: any = {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonText,
        sections,
      },
    };
    
    if (headerText) {
      interactive.header = { type: 'text', text: headerText };
    }
    if (footerText) {
      interactive.footer = { text: footerText };
    }
    
    return this.callApi<SendMessageResponse>('messages', 'POST', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'interactive',
      interactive,
    });
  }

  /**
   * Send a location message.
   */
  async sendLocation(
    to: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string,
  ): Promise<SendMessageResponse> {
    const formattedTo = this.formatPhone(to);
    
    return this.callApi<SendMessageResponse>('messages', 'POST', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'location',
      location: {
        latitude,
        longitude,
        name,
        address,
      },
    });
  }

  /**
   * Send a contact card message.
   */
  async sendContact(
    to: string,
    contact: {
      name: { formatted_name: string; first_name?: string; last_name?: string };
      phones?: Array<{ phone: string; type?: string }>;
      emails?: Array<{ email: string; type?: string }>;
    },
  ): Promise<SendMessageResponse> {
    const formattedTo = this.formatPhone(to);
    
    return this.callApi<SendMessageResponse>('messages', 'POST', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'contacts',
      contacts: [contact],
    });
  }

  /**
   * Mark a message as read.
   */
  async markAsRead(messageId: string): Promise<{ success: boolean }> {
    return this.callApi('messages', 'POST', {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  /**
   * Send a reaction to a message.
   */
  async sendReaction(
    to: string,
    messageId: string,
    emoji: string,
  ): Promise<SendMessageResponse> {
    const formattedTo = this.formatPhone(to);
    
    return this.callApi<SendMessageResponse>('messages', 'POST', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'reaction',
      reaction: {
        message_id: messageId,
        emoji,
      },
    });
  }

  /**
   * Upload media to WhatsApp servers.
   * Returns media ID that can be used to send the media.
   */
  async uploadMedia(
    file: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<MediaUploadResponse> {
    const formData = new FormData();
    // Create a Blob from the buffer - use type assertion for Node.js compatibility
    const blob = new Blob([file as unknown as BlobPart], { type: mimeType });
    formData.append('file', blob, filename);
    formData.append('messaging_product', 'whatsapp');

    const url = `${GRAPH_API_BASE}/${this.phoneNumberId}/media`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Media upload failed: ${error?.error?.message || response.statusText}`,
      );
    }

    return response.json();
  }

  /**
   * Get media URL from media ID.
   */
  async getMediaUrl(mediaId: string): Promise<string> {
    const url = `${GRAPH_API_BASE}/${mediaId}`;
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get media URL');
    }

    const data = await response.json();
    return data.url;
  }

  /**
   * Download media from WhatsApp servers.
   */
  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    const response = await fetch(mediaUrl, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to download media');
    }

    return Buffer.from(await response.arrayBuffer());
  }
}

/**
 * Factory function to create WhatsApp client from workspace settings.
 */
export function createWhatsAppClient(
  accessToken: string,
  phoneNumberId: string,
  logger?: Logger,
): WhatsAppCloudClient {
  return new WhatsAppCloudClient({
    accessToken,
    phoneNumberId,
    logger,
  });
}
