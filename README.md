# API to Model

A VS Code extension: paste a cURL command, send the request, and turn the JSON response into model classes. Dart is supported today; the generator interface is built so more languages slot in without touching existing code.

## Usage

1. Command Palette → **API to Model: New Request**
2. Paste a cURL command into the panel
3. **Send** (or `Cmd`/`Ctrl` + `Enter`) — status, timing, headers and pretty-printed JSON come back
4. **Generate** — enter a root class name (e.g. `LoadDocument`), pick a language
5. **Copy**, **Insert into editor**, or **Save as file**

## Development

```bash
npm install
npm test          # jest — curl parser + dart generator
npm run compile   # tsc -> out/
npm run watch     # tsc --watch
```

Press `F5` in VS Code to launch an Extension Development Host with the extension loaded.

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
| integer | `int?` |
| non-integer number | `double?` |
| `boolean` | `bool?` |
| object | nested class named after the key, `ClassName?` |
| array of objects | `List<ClassName>?` |
| array of primitives | `List<String>?`, `List<int>?`, … |
| `null` | `String?` — except keys starting `is_`/`has_`, which become `bool?` |

Every field is nullable, keys are converted `snake_case` → `camelCase` only, and each class gets a named-parameter constructor plus `fromJson` / `toJson`. `test/fixtures/loadDocument.ts` holds the reference case from `CLAUDE.md`; `test/dartGenerator.test.ts` asserts the generator reproduces it byte for byte.

### Known limitations

- Output is formatted to match `dart format` at an 80-column page width. It is not a full formatter — constructors are the only construct that wraps.
- Two different objects under the same key name resolve to one class; the first shape wins.
- Dart reserved words are suffixed with `$` (`class` → `class$`) so the output compiles. The JSON key is untouched.
- A JSON root that is an array is rejected. See the roadmap.
- `1.0` arrives from `JSON.parse` as an integer and is typed `int?`.

## Roadmap

- [ ] More languages: Kotlin, TypeScript interfaces, Java, Swift, Python dataclasses
- [ ] More cURL flags: `-F`/`--form`, cookies, `-u` auth
- [ ] Configurable field naming (camelCase / snake_case)
- [ ] JSON root as an array
- [ ] Request history

## License

MIT
