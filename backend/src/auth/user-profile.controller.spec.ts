import { UnauthorizedException } from '@nestjs/common';
import { UserProfileController } from './user-profile.controller';

describe('UserProfileController', () => {
  const auth = {
    getGoogleExtendedProfile: jest.fn(),
  } as any;

  const controller = new UserProfileController(auth);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects the extended Google profile route when the request is unauthenticated', async () => {
    await expect(controller.googleProfileExtended({ user: undefined, headers: {} } as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('forwards the authenticated agent id and access token header to the auth service', async () => {
    auth.getGoogleExtendedProfile.mockResolvedValue({
      provider: 'google',
      email: 'daniel@kloel.com',
      phone: '+5562999990000',
      birthday: '1994-04-18',
      address: null,
    });

    const result = await controller.googleProfileExtended({
      user: { sub: 'agent-1' },
      headers: { 'x-google-access-token': 'google-access-token' },
    } as any);

    expect(auth.getGoogleExtendedProfile).toHaveBeenCalledWith(
      'agent-1',
      'google-access-token',
    );
    expect(result).toEqual({
      provider: 'google',
      email: 'daniel@kloel.com',
      phone: '+5562999990000',
      birthday: '1994-04-18',
      address: null,
    });
  });
});
