import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GenerateAudioDto } from './generate-audio.dto';

const SAMPLE_UUID = '11111111-2222-4333-8444-555555555555';
const OTHER_UUID = '99999999-2222-4333-8444-555555555555';

describe('GenerateAudioDto', () => {
  it('accepts canonical profileId', async () => {
    const dto = plainToInstance(GenerateAudioDto, {
      text: 'Hello world',
      profileId: SAMPLE_UUID,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.profileId).toBe(SAMPLE_UUID);
  });

  it('mirrors frontend alias voiceProfileId into profileId', async () => {
    const dto = plainToInstance(GenerateAudioDto, {
      text: 'Hello world',
      voiceProfileId: SAMPLE_UUID,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.profileId).toBe(SAMPLE_UUID);
    expect(dto.voiceProfileId).toBe(SAMPLE_UUID);
  });

  it('prefers explicit profileId when both are present', async () => {
    const dto = plainToInstance(GenerateAudioDto, {
      text: 'Hello world',
      profileId: SAMPLE_UUID,
      voiceProfileId: OTHER_UUID,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.profileId).toBe(SAMPLE_UUID);
  });

  it('rejects payload missing both profileId and voiceProfileId', async () => {
    const dto = plainToInstance(GenerateAudioDto, {
      text: 'Hello world',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const profileIdError = errors.find((e) => e.property === 'profileId');
    expect(profileIdError).toBeDefined();
  });

  it('rejects non-UUID voiceProfileId alias', async () => {
    const dto = plainToInstance(GenerateAudioDto, {
      text: 'Hello world',
      voiceProfileId: 'not-a-uuid',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects empty text', async () => {
    const dto = plainToInstance(GenerateAudioDto, {
      text: '',
      profileId: SAMPLE_UUID,
    });
    const errors = await validate(dto);
    const textError = errors.find((e) => e.property === 'text');
    expect(textError).toBeDefined();
  });
});
