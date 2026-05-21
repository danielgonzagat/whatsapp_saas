import { AppService } from './app.service';

describe('AppService', () => {
  it('returns hello world', () => {
    expect(new AppService().getHello()).toBe('Hello World!');
  });
});
