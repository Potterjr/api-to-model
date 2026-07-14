import { DartGenerator, ModelGenerationError } from '../src/core/generators/dartGenerator';
import { LOAD_DOCUMENT_DART, LOAD_DOCUMENT_RESPONSE } from './fixtures/loadDocument';

const dart = new DartGenerator();
const generate = (root: string, json: unknown) => dart.generate(root, json);

describe('DartGenerator — the CLAUDE.md reference case', () => {
  it('reproduces the required LoadDocument output exactly', () => {
    expect(generate('LoadDocument', LOAD_DOCUMENT_RESPONSE)).toBe(LOAD_DOCUMENT_DART);
  });
});

describe('DartGenerator — type mapping', () => {
  it('maps each JSON primitive to its nullable Dart type', () => {
    const out = generate('M', { s: 'a', b: true });
    expect(out).toContain('  String? s;');
    expect(out).toContain('  bool? b;');
  });

  it('maps every number to num?, whatever its precision', () => {
    const out = generate('M', { whole: 1, fraction: 1.5, big: 9007199254740993, negative: -2 });
    expect(out).toContain('  num? whole;');
    expect(out).toContain('  num? fraction;');
    expect(out).toContain('  num? big;');
    expect(out).toContain('  num? negative;');
    expect(out).not.toMatch(/\b(int|double)\?/);
  });

  it('defaults an unknown null to String?', () => {
    expect(generate('M', { note: null })).toContain('  String? note;');
  });

  it('defaults null to bool? for is_/has_ fields', () => {
    const out = generate('M', { is_shipment: null, has_photo: null, isActive: null });
    expect(out).toContain('  bool? isShipment;');
    expect(out).toContain('  bool? hasPhoto;');
    expect(out).toContain('  bool? isActive;');
  });

  it('does not mistake island or history for booleans', () => {
    const out = generate('M', { island: null, history: null });
    expect(out).toContain('  String? island;');
    expect(out).toContain('  String? history;');
  });

  it('makes every field nullable', () => {
    const out = generate('M', { s: 'a', i: 1, b: true, o: { x: 1 }, l: [1] });
    // A field declaration is `  <type> <name>;` — constructors and method bodies never match.
    const declarations = out.split('\n').filter((line) => /^ {2}\S+ \w+;$/.test(line));
    expect(declarations).toHaveLength(6); // 5 on M, plus x on the nested class O
    for (const line of declarations) {
      expect(line).toMatch(/\?\s\w+;$/);
    }
  });

  it('types a list of primitives by its real element type', () => {
    expect(generate('M', { tags: ['a'] })).toContain('  List<String>? tags;');
    expect(generate('M', { ids: [1, 2] })).toContain('  List<num>? ids;');
    expect(generate('M', { rates: [1, 2.5] })).toContain('  List<num>? rates;');
    expect(generate('M', { flags: [true] })).toContain('  List<bool>? flags;');
  });

  it('falls back to List<String>? for an empty list', () => {
    expect(generate('M', { tags: [] })).toContain('  List<String>? tags;');
  });
});

describe('DartGenerator — naming', () => {
  it('converts snake_case keys to camelCase fields without renaming the JSON key', () => {
    const out = generate('M', { document_type: 'x', plan_gi_no: 'y' });
    expect(out).toContain('  String? documentType;');
    expect(out).toContain("    documentType = json['document_type'];");
    expect(out).toContain("    data['plan_gi_no'] = planGiNo;");
  });

  it('names a nested class after its key, capitalized', () => {
    const out = generate('M', { user_profile: { id: 1 } });
    expect(out).toContain('  UserProfile? userProfile;');
    expect(out).toContain('class UserProfile {');
  });

  it('leaves keys that are already camelCase alone', () => {
    expect(generate('M', { documentType: 'x' })).toContain('  String? documentType;');
  });

  it('escapes Dart reserved words while keeping the JSON key intact', () => {
    const out = generate('M', { class: 'x', default: 1 });
    expect(out).toContain('  String? class$;');
    expect(out).toContain("    class$ = json['class'];");
    expect(out).toContain("    data['default'] = default$;");
  });

  it('escapes a key that starts with a digit', () => {
    const out = generate('M', { '2fa_enabled': true });
    expect(out).toContain('  bool? $2faEnabled;');
    expect(out).toContain("    \$2faEnabled = json['2fa_enabled'];");
  });
});

describe('DartGenerator — nested structures', () => {
  it('emits the root class before its children', () => {
    const out = generate('Root', { child: { leaf: { v: 1 } } });
    expect(out.indexOf('class Root {')).toBeLessThan(out.indexOf('class Child {'));
    expect(out.indexOf('class Child {')).toBeLessThan(out.indexOf('class Leaf {'));
  });

  it('round-trips a nested object through fromJson and toJson', () => {
    const out = generate('M', { user: { id: 1 } });
    expect(out).toContain("    user = json['user'] != null ? User.fromJson(json['user']) : null;");
    expect(out).toContain('    if (user != null) {');
    expect(out).toContain("      data['user'] = user!.toJson();");
  });

  it('null-guards a list of primitives before casting', () => {
    const out = generate('M', { tags: ['a'] });
    expect(out).toContain("    if (json['tags'] != null) {");
    expect(out).toContain("      tags = json['tags'].cast<String>();");
    expect(out).toContain("    data['tags'] = tags;");
  });

  it('merges every element of an object list so later rows can fix null types', () => {
    const out = generate('M', {
      rows: [
        { id: null, name: 'a' },
        { id: 7, name: 'b', extra: true },
      ],
    });
    expect(out).toContain('  num? id;');
    expect(out).toContain('  String? name;');
    expect(out).toContain('  bool? extra;');
  });

  it('emits a class only once when the same key name repeats', () => {
    const out = generate('M', { a: { item: { v: 1 } }, b: { item: { v: 2 } } });
    expect(out.match(/class Item \{/g)).toHaveLength(1);
  });

  it('generates a valid empty class for an empty object', () => {
    expect(generate('M', {})).toContain('  M();');
  });
});

describe('DartGenerator — constructor formatting', () => {
  it('keeps a short constructor on one line', () => {
    expect(generate('LoadDocument', { documents: [{ a: 1 }] })).toContain(
      '  LoadDocument({this.documents});',
    );
  });

  it('wraps a constructor that would pass 80 columns, one param per line', () => {
    const out = generate('M', {
      alpha_field: 'a',
      bravo_field: 'b',
      charlie_field: 'c',
      delta_field: 'd',
      echo_field: 'e',
    });
    expect(out).toContain(
      [
        '  M(',
        '      {this.alphaField,',
        '      this.bravoField,',
        '      this.charlieField,',
        '      this.deltaField,',
        '      this.echoField});',
      ].join('\n'),
    );
  });

  it('never emits a line over 80 columns for the reference case', () => {
    for (const line of LOAD_DOCUMENT_DART.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });
});

describe('DartGenerator — input validation', () => {
  it('rejects a non-object root', () => {
    expect(() => generate('M', [1, 2])).toThrow(ModelGenerationError);
    expect(() => generate('M', 'text')).toThrow(/must be an object/);
    expect(() => generate('M', null)).toThrow(/must be an object/);
  });

  it('rejects an empty root class name', () => {
    expect(() => generate('  ', {})).toThrow(/root class name is required/);
  });

  it('normalizes a snake_case root class name', () => {
    expect(generate('load_document', {})).toContain('class LoadDocument {');
  });
});
