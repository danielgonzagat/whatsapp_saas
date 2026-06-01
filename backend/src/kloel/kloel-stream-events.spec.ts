import { describe, expect, it } from '@jest/globals';
import { createKloelDoneEvent } from './kloel-stream-events';

describe('kloel-stream-events', () => {
  it('carries capability metadata on terminal done events', () => {
    const metadata = {
      capability: 'create_image',
      generatedImageUrl: 'https://cdn.example.test/generated.png',
    };

    expect(createKloelDoneEvent(metadata)).toEqual({
      type: 'done',
      done: true,
      metadata,
    });
  });

  it('keeps ordinary done events minimal when no metadata is present', () => {
    expect(createKloelDoneEvent()).toEqual({
      type: 'done',
      done: true,
    });
    expect(createKloelDoneEvent({})).toEqual({
      type: 'done',
      done: true,
    });
  });
});
