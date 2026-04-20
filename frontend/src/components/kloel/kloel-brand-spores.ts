/**
 * Spore particle data for the Kloel mushroom animation.
 * Pure positional + animation-id data — no colours or radii.
 */
export interface KloelSpore {
  /** Id property. */
  id: string;
  /** Radius property. */
  radius: number;
  /** Opacity property. */
  opacity: number;
  /** Start cx property. */
  startCx: number;
  /** Start cy property. */
  startCy: number;
  /** End cx property. */
  endCx: number;
  /** End cy property. */
  endCy: number;
  /** Animation property. */
  animation: string;
  /** Delay ms property. */
  delayMs: number;
}

/** Kloel_spores. */
export const KLOEL_SPORES: KloelSpore[] = [
  {
    id: 'l1',
    radius: 2.2,
    opacity: 0.7,
    startCx: 38,
    startCy: 96,
    endCx: -10,
    endCy: 90,
    animation: 'kloel-sp-l1',
    delayMs: 0,
  },
  {
    id: 'l2',
    radius: 1.5,
    opacity: 0.55,
    startCx: 36,
    startCy: 88,
    endCx: -5,
    endCy: 62,
    animation: 'kloel-sp-l2',
    delayMs: 40,
  },
  {
    id: 'ul1',
    radius: 2.4,
    opacity: 0.7,
    startCx: 48,
    startCy: 75,
    endCx: 10,
    endCy: 22,
    animation: 'kloel-sp-ul1',
    delayMs: 70,
  },
  {
    id: 'ul2',
    radius: 1.4,
    opacity: 0.5,
    startCx: 53,
    startCy: 80,
    endCx: 18,
    endCy: 32,
    animation: 'kloel-sp-ul2',
    delayMs: 20,
  },
  {
    id: 'tl1',
    radius: 2,
    opacity: 0.7,
    startCx: 70,
    startCy: 58,
    endCx: 45,
    endCy: -10,
    animation: 'kloel-sp-tl1',
    delayMs: 90,
  },
  {
    id: 'tl2',
    radius: 1.6,
    opacity: 0.45,
    startCx: 78,
    startCy: 62,
    endCx: 55,
    endCy: -2,
    animation: 'kloel-sp-tl2',
    delayMs: 50,
  },
  {
    id: 't1',
    radius: 2.8,
    opacity: 0.8,
    startCx: 94,
    startCy: 48,
    endCx: 90,
    endCy: -25,
    animation: 'kloel-sp-t1',
    delayMs: 30,
  },
  {
    id: 't2',
    radius: 1.8,
    opacity: 0.6,
    startCx: 106,
    startCy: 50,
    endCx: 112,
    endCy: -20,
    animation: 'kloel-sp-t2',
    delayMs: 80,
  },
  {
    id: 'tr1',
    radius: 2.2,
    opacity: 0.7,
    startCx: 122,
    startCy: 56,
    endCx: 158,
    endCy: -8,
    animation: 'kloel-sp-tr1',
    delayMs: 60,
  },
  {
    id: 'tr2',
    radius: 1.5,
    opacity: 0.5,
    startCx: 128,
    startCy: 62,
    endCx: 150,
    endCy: 0,
    animation: 'kloel-sp-tr2',
    delayMs: 10,
  },
  {
    id: 'ur1',
    radius: 2,
    opacity: 0.65,
    startCx: 148,
    startCy: 75,
    endCx: 195,
    endCy: 25,
    animation: 'kloel-sp-ur1',
    delayMs: 100,
  },
  {
    id: 'ur2',
    radius: 1.4,
    opacity: 0.45,
    startCx: 152,
    startCy: 82,
    endCx: 190,
    endCy: 38,
    animation: 'kloel-sp-ur2',
    delayMs: 40,
  },
  {
    id: 'r1',
    radius: 1.8,
    opacity: 0.6,
    startCx: 160,
    startCy: 88,
    endCx: 210,
    endCy: 65,
    animation: 'kloel-sp-r1',
    delayMs: 70,
  },
  {
    id: 'r2',
    radius: 2,
    opacity: 0.7,
    startCx: 163,
    startCy: 95,
    endCx: 212,
    endCy: 90,
    animation: 'kloel-sp-r2',
    delayMs: 20,
  },
];
