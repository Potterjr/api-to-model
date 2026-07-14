import { ModelGenerator } from '../../types';

export class ModelGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelGenerationError';
  }
}

/**
 * `num` is the supertype of both `int` and `double`, so every JSON number maps to
 * it. JSON itself has one number type and `JSON.parse` hands back `1.0` as `1`,
 * which makes a narrower guess unreliable at runtime.
 */
type DartPrimitive = 'String' | 'num' | 'bool';

type DartType =
  | { kind: 'primitive'; name: DartPrimitive }
  | { kind: 'class'; name: string }
  | { kind: 'listPrimitive'; element: DartPrimitive }
  | { kind: 'listClass'; element: string };

interface DartField {
  jsonKey: string;
  name: string;
  type: DartType;
}

interface DartClass {
  name: string;
  fields: DartField[];
}

/** `dart format` keeps a constructor on one line while it fits the 80-column page. */
const PAGE_WIDTH = 80;

const DART_RESERVED = new Set([
  'abstract', 'as', 'assert', 'async', 'await', 'break', 'case', 'catch', 'class',
  'const', 'continue', 'covariant', 'default', 'deferred', 'do', 'dynamic', 'else',
  'enum', 'export', 'extends', 'extension', 'external', 'factory', 'false', 'final',
  'finally', 'for', 'function', 'get', 'hide', 'if', 'implements', 'import', 'in',
  'interface', 'is', 'late', 'library', 'mixin', 'new', 'null', 'on', 'operator',
  'part', 'required', 'rethrow', 'return', 'set', 'show', 'static', 'super',
  'switch', 'sync', 'this', 'throw', 'true', 'try', 'typedef', 'var', 'void',
  'while', 'with', 'yield',
]);

export class DartGenerator implements ModelGenerator {
  readonly id = 'dart';
  readonly label = 'Dart';
  readonly fileExtension = 'dart';

  generate(rootClassName: string, json: unknown): string {
    const root = rootClassName.trim();
    if (root.length === 0) {
      throw new ModelGenerationError('A root class name is required.');
    }
    if (!isPlainObject(json)) {
      throw new ModelGenerationError(
        'The root of the JSON must be an object. Arrays and primitives are not supported yet.',
      );
    }

    const classes: DartClass[] = [];
    const built = new Set<string>();

    const build = (className: string, obj: Record<string, unknown>): string => {
      if (built.has(className)) {
        return className;
      }
      built.add(className);

      const cls: DartClass = { name: className, fields: [] };
      classes.push(cls); // Reserve the slot first so parents are emitted before children.

      for (const [key, value] of Object.entries(obj)) {
        cls.fields.push({
          jsonKey: key,
          name: toCamelCase(key),
          type: resolveType(key, value, build),
        });
      }
      return className;
    };

    build(toPascalCase(root), json);
    return classes.map(emitClass).join('\n\n') + '\n';
  }
}

type BuildFn = (className: string, obj: Record<string, unknown>) => string;

function resolveType(key: string, value: unknown, build: BuildFn): DartType {
  if (value === null || value === undefined) {
    // The response carried no value, so the shape is a guess: booleans read as
    // `is_`/`has_` questions, everything else falls back to String.
    return { kind: 'primitive', name: looksBoolean(key) ? 'bool' : 'String' };
  }
  if (typeof value === 'string') {
    return { kind: 'primitive', name: 'String' };
  }
  if (typeof value === 'boolean') {
    return { kind: 'primitive', name: 'bool' };
  }
  if (typeof value === 'number') {
    return { kind: 'primitive', name: 'num' };
  }
  if (Array.isArray(value)) {
    return resolveArrayType(key, value, build);
  }
  if (isPlainObject(value)) {
    return { kind: 'class', name: build(toPascalCase(key), value) };
  }
  return { kind: 'primitive', name: 'String' };
}

function resolveArrayType(key: string, items: unknown[], build: BuildFn): DartType {
  const present = items.filter((item) => item !== null && item !== undefined);
  if (present.length === 0) {
    return { kind: 'listPrimitive', element: looksBoolean(key) ? 'bool' : 'String' };
  }

  const objects = present.filter(isPlainObject);
  if (objects.length === present.length) {
    // Merge every element so a field that is null in the first row can still pick
    // up its real type from a later one.
    return { kind: 'listClass', element: build(toPascalCase(key), mergeObjects(objects)) };
  }

  const first = present[0];
  if (typeof first === 'string') {
    return { kind: 'listPrimitive', element: 'String' };
  }
  if (typeof first === 'boolean') {
    return { kind: 'listPrimitive', element: 'bool' };
  }
  if (typeof first === 'number') {
    return { kind: 'listPrimitive', element: 'num' };
  }
  return { kind: 'listPrimitive', element: 'String' };
}

function mergeObjects(items: Record<string, unknown>[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const item of items) {
    for (const [key, value] of Object.entries(item)) {
      const known = merged[key];
      if (!(key in merged) || known === null || known === undefined) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function emitClass(cls: DartClass): string {
  const lines: string[] = [`class ${cls.name} {`];

  for (const field of cls.fields) {
    lines.push(`  ${typeName(field.type)}? ${field.name};`);
  }

  lines.push('', ...emitConstructor(cls), '', ...emitFromJson(cls), '', ...emitToJson(cls), '}');
  return lines.join('\n');
}

function emitConstructor(cls: DartClass): string[] {
  if (cls.fields.length === 0) {
    return [`  ${cls.name}();`];
  }

  const params = cls.fields.map((field) => `this.${field.name}`);
  const singleLine = `  ${cls.name}({${params.join(', ')}});`;
  if (singleLine.length <= PAGE_WIDTH) {
    return [singleLine];
  }

  const lines = [`  ${cls.name}(`];
  params.forEach((param, index) => {
    const open = index === 0 ? '{' : '';
    const close = index === params.length - 1 ? '});' : ',';
    lines.push(`      ${open}${param}${close}`);
  });
  return lines;
}

function emitFromJson(cls: DartClass): string[] {
  const lines = [`  ${cls.name}.fromJson(Map<String, dynamic> json) {`];

  for (const field of cls.fields) {
    const key = `json['${field.jsonKey}']`;
    const { name, type } = field;

    switch (type.kind) {
      case 'primitive':
        lines.push(`    ${name} = ${key};`);
        break;
      case 'class':
        lines.push(`    ${name} = ${key} != null ? ${type.name}.fromJson(${key}) : null;`);
        break;
      case 'listPrimitive':
        lines.push(
          `    if (${key} != null) {`,
          `      ${name} = ${key}.cast<${type.element}>();`,
          '    }',
        );
        break;
      case 'listClass':
        lines.push(
          `    if (${key} != null) {`,
          `      ${name} = <${type.element}>[];`,
          `      ${key}.forEach((v) {`,
          `        ${name}!.add(${type.element}.fromJson(v));`,
          '      });',
          '    }',
        );
        break;
    }
  }

  lines.push('  }');
  return lines;
}

function emitToJson(cls: DartClass): string[] {
  const lines = [
    '  Map<String, dynamic> toJson() {',
    '    final Map<String, dynamic> data = <String, dynamic>{};',
  ];

  for (const field of cls.fields) {
    const target = `data['${field.jsonKey}']`;
    const { name, type } = field;

    switch (type.kind) {
      case 'primitive':
      case 'listPrimitive':
        lines.push(`    ${target} = ${name};`);
        break;
      case 'class':
        lines.push(`    if (${name} != null) {`, `      ${target} = ${name}!.toJson();`, '    }');
        break;
      case 'listClass':
        lines.push(
          `    if (${name} != null) {`,
          `      ${target} = ${name}!.map((v) => v.toJson()).toList();`,
          '    }',
        );
        break;
    }
  }

  lines.push('    return data;', '  }');
  return lines;
}

function typeName(type: DartType): string {
  switch (type.kind) {
    case 'primitive':
      return type.name;
    case 'class':
      return type.name;
    case 'listPrimitive':
      return `List<${type.element}>`;
    case 'listClass':
      return `List<${type.element}>`;
  }
}

/** `is_active` / `isActive` / `has_photo` read as booleans; `island` and `history` do not. */
function looksBoolean(key: string): boolean {
  return /^(is|has)_/i.test(key) || /^(is|has)[A-Z0-9]/.test(key);
}

function splitWords(key: string): string[] {
  return key.split(/[^a-zA-Z0-9]+/).filter((word) => word.length > 0);
}

export function toCamelCase(key: string): string {
  const words = splitWords(key);
  if (words.length === 0) {
    return 'field';
  }

  const [head, ...rest] = words;
  let name = head.charAt(0).toLowerCase() + head.slice(1);
  for (const word of rest) {
    name += capitalize(word);
  }

  if (/^[0-9]/.test(name)) {
    name = `\$${name}`; // Dart identifiers cannot start with a digit.
  }
  if (DART_RESERVED.has(name)) {
    name = `${name}\$`; // Keeps the code compiling; the JSON key is unaffected.
  }
  return name;
}

export function toPascalCase(key: string): string {
  const words = splitWords(key);
  if (words.length === 0) {
    return 'Model';
  }
  const name = words.map(capitalize).join('');
  return /^[0-9]/.test(name) ? `\$${name}` : name;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
