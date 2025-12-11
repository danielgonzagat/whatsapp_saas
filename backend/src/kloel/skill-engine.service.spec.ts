import { Test, TestingModule } from '@nestjs/testing';
import { SkillEngineService } from './skill-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CalendarService } from '../calendar/calendar.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('SkillEngineService', () => {
  let service: SkillEngineService;

  const mockPrisma = {
    kloelMemory: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    contact: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    appointment: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        OPENAI_API_KEY: 'test-key',
      };
      return config[key];
    }),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  const mockCalendar = {
    listEvents: jest.fn().mockResolvedValue([]),
    createEvent: jest.fn().mockResolvedValue({ id: 'event-1' }),
    getCalendarConfig: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillEngineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: CalendarService, useValue: mockCalendar },
        { provide: getQueueToken('autopilot-jobs'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<SkillEngineService>(SkillEngineService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAvailableSkills', () => {
    it('should return list of available skills', () => {
      const skills = service.getAvailableSkills();
      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBeGreaterThan(0);
      expect(skills).toContainEqual(
        expect.objectContaining({ name: expect.any(String) }),
      );
    });
  });

  describe('executeSkill', () => {
    describe('check_availability', () => {
      it('should return available slots for a date', async () => {
        mockPrisma.appointment.findMany.mockResolvedValue([]);

        const result = await service.executeSkill('ws-1', 'check_availability', {
          date: '2025-01-20',
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('availableSlots');
        expect(result.data.availableSlots.length).toBeGreaterThan(0);
      });

      it('should exclude booked slots', async () => {
        mockPrisma.appointment.findMany.mockResolvedValue([
          { startAt: new Date('2025-01-20T09:00:00'), endAt: new Date('2025-01-20T10:00:00') },
          { startAt: new Date('2025-01-20T14:00:00'), endAt: new Date('2025-01-20T15:00:00') },
        ]);

        const result = await service.executeSkill('ws-1', 'check_availability', {
          date: '2025-01-20',
        });

        expect(result.success).toBe(true);
        expect(result.data.availableSlots).not.toContain('09:00');
        expect(result.data.availableSlots).not.toContain('14:00');
      });

      it('should check Google Calendar when available', async () => {
        mockPrisma.appointment.findMany.mockResolvedValue([]);
        mockCalendar.listEvents.mockResolvedValue([
          { startTime: new Date('2025-01-20T10:00:00') },
        ]);

        const result = await service.executeSkill('ws-1', 'check_availability', {
          date: '2025-01-20',
        });

        expect(mockCalendar.listEvents).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.data.availableSlots).not.toContain('10:00');
      });
    });

    describe('create_appointment', () => {
      it('should create appointment when slot is available', async () => {
        mockPrisma.appointment.findMany.mockResolvedValue([]);

        const result = await service.executeSkill('ws-1', 'create_appointment', {
          datetime: '2025-01-20T09:00:00',
          customerPhone: '5511999999999',
          customerName: 'João Silva',
          service: 'Consulta',
        });

        expect(result.success).toBe(true);
        expect(result.message).toContain('confirmado');
        expect(mockPrisma.kloelMemory.create).toHaveBeenCalled();
      });

      it('should reject appointment when slot is taken', async () => {
        mockPrisma.appointment.findMany.mockResolvedValue([
          { startAt: new Date('2025-01-20T09:00:00'), endAt: new Date('2025-01-20T10:00:00') },
        ]);

        const result = await service.executeSkill('ws-1', 'create_appointment', {
          datetime: '2025-01-20T09:00:00',
          customerPhone: '5511999999999',
          service: 'Consulta',
        });

        expect(result.success).toBe(false);
        expect(result.message).toContain('não está disponível');
      });

      it('should sync with Google Calendar when configured', async () => {
        mockPrisma.appointment.findMany.mockResolvedValue([]);
        mockCalendar.createEvent.mockResolvedValue({ id: 'google-event-1' });

        await service.executeSkill('ws-1', 'create_appointment', {
          datetime: '2025-01-20T15:00:00',
          customerPhone: '5511999999999',
          service: 'Reunião',
        });

        expect(mockCalendar.createEvent).toHaveBeenCalledWith(
          'ws-1',
          expect.objectContaining({
            summary: expect.stringContaining('Reunião'),
          }),
        );
      });
    });

    describe('save_lead', () => {
      it('should save lead information', async () => {
        const result = await service.executeSkill('ws-1', 'save_lead', {
          name: 'Maria Santos',
          phone: '5511888888888',
          email: 'maria@test.com',
          interest: 'Produto X',
        });

        expect(result.success).toBe(true);
        expect(mockPrisma.kloelMemory.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              category: 'leads',
            }),
          }),
        );
      });
    });

    describe('search_products', () => {
      it('should return matching products', async () => {
        mockPrisma.product.findMany.mockResolvedValue([
          { id: 'prod-1', name: 'Produto A', price: 100 },
          { id: 'prod-2', name: 'Produto B', price: 200 },
        ]);

        const result = await service.executeSkill('ws-1', 'search_products', {
          query: 'Produto',
        });

        expect(result.success).toBe(true);
        expect(result.data.products).toHaveLength(2);
      });

      it('should handle no results', async () => {
        mockPrisma.product.findMany.mockResolvedValue([]);

        const result = await service.executeSkill('ws-1', 'search_products', {
          query: 'NonExistent',
        });

        expect(result.success).toBe(true);
        expect(result.data.products).toHaveLength(0);
      });
    });

    describe('schedule_followup', () => {
      it('should queue followup job', async () => {
        const result = await service.executeSkill('ws-1', 'schedule_followup', {
          contactId: 'contact-1',
          datetime: new Date(Date.now() + 3600000).toISOString(), // 1 hora
          message: 'Olá, retornando!',
        });

        expect(result.success).toBe(true);
        expect(mockQueue.add).toHaveBeenCalledWith(
          'followup',
          expect.objectContaining({
            workspaceId: 'ws-1',
            contactId: 'contact-1',
          }),
          expect.objectContaining({
            delay: expect.any(Number),
          }),
        );
      });
    });

    describe('update_crm', () => {
      it('should update contact CRM fields', async () => {
        mockPrisma.contact.findFirst.mockResolvedValue({
          id: 'contact-1',
          phone: '5511999999999',
        });
        mockPrisma.contact.update.mockResolvedValue({
          id: 'contact-1',
          leadScore: 80,
          stage: 'qualified',
        });

        const result = await service.executeSkill('ws-1', 'update_crm', {
          contactPhone: '5511999999999',
          leadScore: 80,
          stage: 'qualified',
        });

        expect(result.success).toBe(true);
        expect(mockPrisma.contact.update).toHaveBeenCalled();
      });
    });

    describe('Unknown skill', () => {
      it('should return error for unknown skill', async () => {
        const result = await service.executeSkill('ws-1', 'unknown_skill', {});

        expect(result.success).toBe(false);
        expect(result.message).toContain('não reconhecida');
      });
    });
  });

  describe('Memory Operations', () => {
    it('should store memory item', async () => {
      await service.storeMemory('ws-1', 'test_key', { data: 'value' }, 'general');

      expect(mockPrisma.kloelMemory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          key: 'test_key',
          category: 'general',
        }),
      });
    });

    it('should retrieve memory item', async () => {
      mockPrisma.kloelMemory.findFirst.mockResolvedValue({
        key: 'test_key',
        value: { data: 'stored_value' },
      });

      const result = await service.getMemory('ws-1', 'test_key');
      expect(result).toEqual({ data: 'stored_value' });
    });

    it('should update memory item', async () => {
      mockPrisma.kloelMemory.update.mockResolvedValue({
        key: 'test_key',
        value: { data: 'updated_value' },
      });

      await service.updateMemory('ws-1', 'test_key', { data: 'updated_value' });
      expect(mockPrisma.kloelMemory.update).toHaveBeenCalled();
    });
  });
});
