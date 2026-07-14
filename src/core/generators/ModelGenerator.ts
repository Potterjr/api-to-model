import { ModelGenerator } from '../../types';
import { DartGenerator } from './dartGenerator';

/**
 * Every language the extension can emit. Adding one means implementing
 * `ModelGenerator` and appending it here — nothing else changes.
 */
const GENERATORS: ModelGenerator[] = [new DartGenerator()];

export function getGenerator(id: string): ModelGenerator {
  const generator = GENERATORS.find((candidate) => candidate.id === id);
  if (!generator) {
    throw new Error(`No model generator registered for "${id}".`);
  }
  return generator;
}

export function listGenerators(): { id: string; label: string }[] {
  return GENERATORS.map(({ id, label }) => ({ id, label }));
}

export { ModelGenerator };
