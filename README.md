# API to Model

A VS Code extension: paste a cURL command, send the request, and turn the JSON response into model classes. Dart is supported today; the generator interface is built so more languages slot in without touching existing code.

## Usage

Command Palette → **API to Model: New Request**. The panel takes input two ways:

**cURL tab** — paste a cURL command, hit **Send** (or `Cmd`/`Ctrl` + `Enter`). Status, timing, headers and pretty-printed JSON come back.

**JSON tab** — paste a response you already have. No request is sent; it goes straight to generating.

Either way, **Generate** with a root class name (e.g. `LoadDocument`) and a language, then **Copy**, **Insert into editor**, or **Save as file**.

## Development

```bash
npm install
npm test          # jest — curl parser + dart generator
npm run compile   # tsc -> out/
npm run watch     # tsc --watch
```

Press `F5` in VS Code to launch an Extension Development Host with the extension loaded.

To install the extension into your own VS Code instead:

```bash
npm run install-local   # package to .vsix, then install it
```

## Architecture

Business logic is deliberately free of any `vscode` import, so it is testable in plain Node:

| Path | Role |
|---|---|
| `src/core/curlParser.ts` | cURL string → `{ method, url, headers, body }` |
| `src/core/httpClient.ts` | replays a parsed request via axios |
| `src/core/generators/ModelGenerator.ts` | language registry |
| `src/core/generators/dartGenerator.ts` | Dart implementation |
| `src/webview/panel.ts` | webview lifecycle + message routing |
| `src/commands/` | thin command handlers |

### Adding a language

Implement `ModelGenerator` from `src/types/index.ts` and append it to the `GENERATORS` array in `src/core/generators/ModelGenerator.ts`. The dropdown and the "Save as file" extension both read from that registry.

```ts
export interface ModelGenerator {
  readonly id: string;
  readonly label: string;
  readonly fileExtension: string;
  generate(rootClassName: string, json: unknown): string;
}
```

## Dart conversion rules

| JSON | Dart |
|---|---|
| `string` | `String?` |
| any number | `num?` |
| `boolean` | `bool?` |
| object | nested class named after the key, `ClassName?` |
| array of objects | `List<ClassName>?` |
| array of primitives | `List<String>?`, `List<num>?`, … |
| `null` | `String?` — except keys starting `is_`/`has_`, which become `bool?` |

Numbers all become `num?` rather than `int?` or `double?`. JSON has a single number type, and `JSON.parse` returns `1.0` as `1`, so narrowing is a guess that breaks at runtime the first time a field the sample showed as `3` comes back as `3.5`. `num` is the supertype of both, so `int` and `double` payloads parse into the same model. Narrow at the call site with `.toInt()` / `.toDouble()` when you need it.

Every field is nullable, keys are converted `snake_case` → `camelCase` only, and each class gets a named-parameter constructor plus `fromJson` / `toJson`. `test/fixtures/loadDocument.ts` holds the reference case from `CLAUDE.md`; `test/dartGenerator.test.ts` asserts the generator reproduces it byte for byte.

### Known limitations

- Output is formatted to match `dart format` at an 80-column page width. It is not a full formatter — constructors are the only construct that wraps.
- Two different objects under the same key name resolve to one class; the first shape wins.
- Dart reserved words are suffixed with `$` (`class` → `class$`) so the output compiles. The JSON key is untouched.
- A JSON root that is an array is rejected. See the roadmap.

## Roadmap

- [ ] More languages: Kotlin, TypeScript interfaces, Java, Swift, Python dataclasses
- [ ] More cURL flags: `-F`/`--form`, cookies, `-u` auth
- [ ] Configurable field naming (camelCase / snake_case)
- [ ] JSON root as an array
- [ ] Request history

## License

MIT
