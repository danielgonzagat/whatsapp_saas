import { titleCaseStructural } from '../../structural-family';

export function zero(): number {
  return Number(false);
}

export function one(): number {
  return Number(true);
}

export function roundToPercentStep(value: number): number {
  return Math.round(value * 100) / 100;
}

export function quotient(numerator: number, denominator: number): number {
  if (denominator <= zero()) {
    return zero();
  }
  return roundToPercentStep(numerator / denominator);
}

export function clamp(value: number): number {
  return Math.max(zero(), Math.min(one(), roundToPercentStep(value)));
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function compact(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(zero(), max - '...'.length)}...`;
}

export function humanize(value: string): string {
  return titleCaseStructural(value);
}

export function deriveStateSequence<State extends string>(
  summary: Record<string, unknown>,
  suffix: string,
  observedValues: State[],
): State[] {
  const observed = unique(observedValues);
  const suffixSize = suffix.length;
  const derived = Object.keys(summary)
    .filter((key) => key.endsWith(suffix))
    .map((key) => key.slice(0, key.length - suffixSize))
    .filter((key): key is State => observed.includes(key as State));

  return unique([...derived, ...observed]);
}

export function hasItems<T>(items: T[]): boolean {
  return items.length > zero();
}

export function hasCount(value: number): boolean {
  return value > zero();
}

export function multiple<T>(items: T[]): boolean {
  return items.length > one();
}

export function observedHead<T>(items: T[]): T | undefined {
  return items[zero()];
}

export function observedSecond<T>(items: T[]): T | undefined {
  return items[one()];
}

export function observedMiddle<T>(items: T[]): T | undefined {
  return items[Math.floor(quotient(items.length, one() + one()))];
}

export function leadingSpan(...counts: number[]): number {
  const observedCounts = counts.filter((count) => count > zero());
  if (!hasItems(observedCounts)) {
    return one();
  }
  return Math.max(
    one(),
    Math.ceil(
      quotient(
        observedCounts.reduce((sum, count) => sum + count, zero()),
        observedCounts.length,
      ),
    ),
  );
}

export function observedAverage(values: number[]): number {
  if (!hasItems(values)) {
    return zero();
  }
  return clamp(
    quotient(
      values.reduce((sum, value) => sum + value, zero()),
      values.length,
    ),
  );
}

export function observedRankWeight<State extends string>(
  status: State,
  observedStatuses: State[],
): number {
  return stateWeight(status, unique(observedStatuses));
}

export function stateWeight<State extends string>(status: State, statusOrder: State[]): number {
  const index = statusOrder.indexOf(status);
  if (index < zero()) {
    return zero();
  }

  const denominator = Math.max(statusOrder.length - one(), one());
  return clamp((denominator - index) / denominator);
}

export function strongestState<State extends string>(statusOrder: State[]): State | undefined {
  return statusOrder[0];
}

export function weakestState<State extends string>(statusOrder: State[]): State | undefined {
  return statusOrder[statusOrder.length - 1];
}

export function isMaterializedState<State extends string>(
  status: State,
  statusOrder: State[],
): boolean {
  const index = statusOrder.indexOf(status);
  if (index < 0) {
    return false;
  }

  return index < Math.ceil(statusOrder.length / 2);
}

export function stateFromCompletion<State extends string>(
  completion: number,
  statusOrder: State[],
): State | undefined {
  if (statusOrder.length === 0) {
    return undefined;
  }

  for (let index = 0; index < statusOrder.length - 1; index += 1) {
    const current = statusOrder[index];
    const next = statusOrder[index + 1];
    const boundary = quotient(
      stateWeight(current, statusOrder) + stateWeight(next, statusOrder),
      one() + one(),
    );
    if (completion >= boundary) {
      return current;
    }
  }

  return weakestState(statusOrder);
}
