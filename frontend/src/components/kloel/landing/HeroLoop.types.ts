export type HeroLoopPhase = 'idle' | 'typing' | 'strike' | 'death' | 'hidden';

export type GlitchSlice = {
  top: number;
  h: number;
  off: number;
};

export type GlitchState = {
  on: boolean;
  text: string;
  shk: [number, number];
  chr: number;
  slices: GlitchSlice[];
  flash: boolean;
};

export type ViewState = {
  text: string;
  strike: number;
  suffix: string;
  phase: HeroLoopPhase;
};
