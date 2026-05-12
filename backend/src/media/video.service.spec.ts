import { VideoService } from './video.service';

describe('VideoService', () => {
  it('returns ok placeholder', () => {
    expect(new VideoService().generate()).toEqual({ ok: true });
  });
});
