import { describe, expect, it } from '@jest/globals';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

async function validateBirthDate(birthDate: string) {
  const dto = new UpdateProfileDto();
  dto.birthDate = birthDate;
  return validate(dto);
}

describe('UpdateProfileDto', () => {
  it('accepts birthDate as a date-only value', async () => {
    const errors = await validateBirthDate('1991-05-07');
    expect(errors).toHaveLength(0);
  });

  it('rejects birthDate values that include time', async () => {
    const errors = await validateBirthDate('1991-05-07T12:30:00.000Z');
    expect(errors.some((error) => error.property === 'birthDate')).toBe(true);
  });
});
