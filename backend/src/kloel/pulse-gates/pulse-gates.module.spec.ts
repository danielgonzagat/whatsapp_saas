import { Test } from '@nestjs/testing';
import { PulseGatesModule } from './pulse-gates.module';
import { GATE_DEFAULT_MODE } from './gate-mode-controller';
import type { Gate } from './pulse-gates.types';

describe('PulseGatesModule', () => {
  it('registers all gates listed in GATE_DEFAULT_MODE as providers under tokens GATE:<name> with a check function', async () => {
    const module = await Test.createTestingModule({
      imports: [PulseGatesModule],
    }).compile();

    const gateNames = Object.keys(GATE_DEFAULT_MODE);

    expect(gateNames).toHaveLength(14);

    for (const name of gateNames) {
      const token = `GATE:${name}`;
      const gate = module.get<Gate<unknown>>(token);
      expect(typeof gate.check).toBe('function');
    }
  });
});
