import 'reflect-metadata';
import { validate } from 'class-validator';

import { MindMessageDto, BrainMessageDto } from './mind-runtime.dto';

describe('MindMessageDto / BrainMessageDto', () => {
  it('MindMessageDto creates instance with role and content', () => {
    const dto = new MindMessageDto();
    dto.role = 'user';
    dto.content = 'hello';

    expect(dto.role).toBe('user');
    expect(dto.content).toBe('hello');
  });

  it('BrainMessageDto is a deprecated alias producing same shape', () => {
    const dto = new BrainMessageDto();
    dto.role = 'assistant';
    dto.content = 'test';

    expect(dto.role).toBe('assistant');
    expect(dto.content).toBe('test');
  });

  it('BrainMessageDto instanceof MindMessageDto', () => {
    const dto = new BrainMessageDto();
    expect(dto).toBeInstanceOf(MindMessageDto);
    expect(dto).toBeInstanceOf(BrainMessageDto);
  });

  it('MindMessageDto validators reject invalid role', async () => {
    const dto = new MindMessageDto();
    (dto as unknown as { role: string }).role = 'invalid_role';
    dto.content = 'hello';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('role');
  });

  it('MindMessageDto validators reject empty content', async () => {
    const dto = new MindMessageDto();
    dto.role = 'user';

    const errors = await validate(dto);
    const contentErr = errors.find((e) => e.property === 'content');
    expect(contentErr).toBeDefined();
  });

  it('BrainMessageDto inherits MindMessageDto validators', async () => {
    const dto = new BrainMessageDto();
    (dto as unknown as { role: string }).role = 'invalid_role';
    dto.content = 'hello';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('role');
  });
});
