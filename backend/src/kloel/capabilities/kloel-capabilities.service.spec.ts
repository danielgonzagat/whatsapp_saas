import { KloelCapabilitiesService } from './kloel-capabilities.service';
import { PromptRefinerCapability } from './prompt-refiner.capability';
import { ResponseDepthAdvisorCapability } from './response-depth-advisor.capability';
import { StructuredTextExtractorCapability } from './structured-text-extractor.capability';

describe('KloelCapabilitiesService (chat dispatcher)', () => {
  let service: KloelCapabilitiesService;

  beforeEach(() => {
    service = new KloelCapabilitiesService(
      new StructuredTextExtractorCapability(),
      new ResponseDepthAdvisorCapability(),
      new PromptRefinerCapability(),
    );
  });

  it('PROOF: advertises exactly the three read-only capabilities', () => {
    const caps = service.listCapabilities();
    expect(caps.map((c) => c.name).sort()).toEqual([
      'prompt_refiner',
      'response_depth_advisor',
      'structured_text_extractor',
    ]);
    expect(caps.every((c) => c.mutating === false)).toBe(true);
  });

  it('has() recognizes only the known capabilities', () => {
    expect(service.has('structured_text_extractor')).toBe(true);
    expect(service.has('response_depth_advisor')).toBe(true);
    expect(service.has('prompt_refiner')).toBe(true);
    expect(service.has('does_not_exist')).toBe(false);
  });

  it('PROOF: invoke() dispatches structured_text_extractor', () => {
    const result = service.invoke('structured_text_extractor', {
      text: 'a, b\nc, d',
      columns: ['x', 'y'],
    });
    expect(result.capability).toBe('structured_text_extractor');
  });

  it('PROOF: invoke() dispatches response_depth_advisor', () => {
    const result = service.invoke('response_depth_advisor', { prompt: 'O que é PIX?' });
    expect(result.capability).toBe('response_depth_advisor');
  });

  it('PROOF: invoke() dispatches prompt_refiner', () => {
    const result = service.invoke('prompt_refiner', { prompt: 'Corrige o bug do login' });
    expect(result.capability).toBe('prompt_refiner');
  });

  it('typed accessors return the matching capability result', () => {
    expect(service.extractStructuredText({ text: 'x' }).capability).toBe('structured_text_extractor');
    expect(service.adviseResponseDepth({ prompt: 'oi' }).capability).toBe('response_depth_advisor');
    expect(service.refinePrompt({ prompt: 'cria algo' }).capability).toBe('prompt_refiner');
  });
});
