import { WhatsappService } from './whatsapp.service';

jest.mock('../queue/queue', () => ({
  autopilotQueue: { add: jest.fn() },
  flowQueue: { add: jest.fn() },
}));
import "../../../scripts/pulse/__companions__/whatsapp.service.spec.companion";
