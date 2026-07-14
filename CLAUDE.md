# CLAUDE.md

คำแนะนำสำหรับ Claude (หรือ AI assistant อื่น) เวลาช่วยพัฒนาโปรเจกต์ VS Code Extension นี้

## ภาพรวมโปรเจกต์

**ชื่อโปรเจกต์:** `api-to-model`

**ประเภท:** VS Code Extension

**เป้าหมาย:** ให้ dev วาง cURL command → extension ยิง API ให้ → แสดง response JSON → แปลง JSON เป็น Model class ของภาษาโปรแกรมมิ่ง (เริ่มต้นรองรับ **Dart** ก่อน ในอนาคตให้เลือกภาษาอื่นได้)

## Feature หลัก

1. **Input** — เลือกได้ 2 แบบผ่าน tab ใน webview
   - **cURL** — paste cURL command (multi-line ได้) แล้วให้ extension ยิง request ให้
   - **JSON** — paste JSON response ที่มีอยู่แล้วตรง ๆ ข้ามขั้นยิง request ไปเลย
2. **Send API** — parse cURL แล้วยิง HTTP request จริงจาก extension (เฉพาะ cURL mode)
3. **Get response JSON** — แสดงผล response ที่ได้ (pretty-print + validate ว่าเป็น JSON ที่ถูกต้อง)
4. **JSON → Model** — แปลง JSON เป็น model class โดยเลือกภาษาได้ (ตอนนี้ implement แค่ **Dart**, ออกแบบ interface ให้ต่อยอดภาษาอื่นทีหลังง่าย)

## Tech Stack

- TypeScript + VS Code Extension API
- Webview panel สำหรับ UI (input cURL / preview response / preview model code)
- HTTP client: `axios`
- cURL parser: tokenizer เขียนเอง (`src/core/curlParser.ts`) เพื่อคุม logic เอง 100%

## โครงสร้างไฟล์

```
api-to-model/
├── src/
│   ├── extension.ts              # entry point, register commands
│   ├── commands/
│   │   ├── newRequest.ts
│   │   ├── sendRequest.ts
│   │   └── generateModel.ts
│   ├── core/
│   │   ├── curlParser.ts         # แปลง curl string -> { method, url, headers, body }
│   │   ├── httpClient.ts         # ยิง request จาก parsed curl
│   │   └── generators/
│   │       ├── ModelGenerator.ts # registry กลาง (รองรับหลายภาษา)
│   │       └── dartGenerator.ts  # implement เฉพาะ Dart
│   ├── webview/
│   │   ├── controller.ts         # message handling + state ใช้ร่วมกัน 2 surface
│   │   ├── html.ts               # markup ใช้ร่วมกัน 2 surface
│   │   ├── panel.ts              # editor panel lifecycle
│   │   ├── sidebar.ts            # activity bar view lifecycle
│   │   └── ui/                   # main.js, style.css สำหรับ webview
│   └── types/
│       └── index.ts
├── test/
│   ├── fixtures/loadDocument.ts
│   ├── curlParser.test.ts
│   └── dartGenerator.test.ts
├── package.json
└── CLAUDE.md
```

## รายละเอียด Feature

### 1. Input (cURL / JSON)

- webview มี 2 tab: **cURL** และ **JSON** สลับ tab แล้ว output เดิมบนจอต้องถูก reset (ข้อมูลคนละชุดกัน)
- **JSON mode** — validate ด้วย `JSON.parse` ถ้าไม่ผ่านให้แจ้ง error ของ parser ตรง ๆ ถ้าผ่านให้ข้ามไปขั้น generate เลย ไม่ยิง request
- **cURL mode** — รับ input จาก textarea รองรับ curl หลายบรรทัด (มี `\` ต่อท้ายบรรทัด)
- Parse สิ่งต่อไปนี้เป็นอย่างน้อย:
  - `-X` / `--request` → HTTP method
  - URL (argument ที่ไม่มี flag นำหน้า)
  - `-H` / `--header` → headers (key: value)
  - `-d` / `--data` / `--data-raw` → body

ตัวอย่าง input:

```bash
curl -X 'POST' \
  'http://testapi' \
  -H 'accept: text/plain' \
  -H 'Content-Type: application/json-patch+json' \
  -d '{
  "keyword": "string"
}'
```

ผลลัพธ์ที่ parser ต้องได้:

```json
{
  "method": "POST",
  "url": "http://testapi",
  "headers": {
    "accept": "text/plain",
    "Content-Type": "application/json-patch+json"
  },
  "body": { "keyword": "string" }
}
```

### 2. Send API

- ใช้ผลลัพธ์จาก curl parser ยิง request จริงผ่าน `axios`
- แสดง status code, response time, response headers ใน webview
- จัดการ error (timeout, network error, non-2xx) แบบไม่ทำให้ extension crash

### 3. Get response JSON

- แสดง JSON response แบบ pretty-print
- Validate ว่า parse เป็น JSON ได้จริงก่อนส่งต่อไปยังขั้นตอน generate model
- ถ้า parse ไม่ได้ ให้แจ้ง error ชัดเจน ไม่ต้อง block ส่วนอื่นของ extension

### 4. JSON → Model (Dart)

นี่คือ core logic ที่สำคัญที่สุด ให้ยึด pattern ตามตัวอย่างด้านล่างเป็นมาตรฐานอ้างอิง

**กฎการแปลง (Conversion Rules):**

| เรื่อง | กฎ |
|---|---|
| ชื่อ class หลัก (root) | รับจาก input ผู้ใช้ (เช่น `LoadDocument`) |
| ชื่อ class ย่อย (nested object / array ของ object) | Capitalize ชื่อ key นั้น เช่น key `documents` → class `Documents` |
| ชื่อ field | แปลง `snake_case` → `camelCase` เช่น `document_type` → `documentType` |
| type: string | → `String?` |
| type: number (int / double / long ทุกกรณี) | → **`num?`** เสมอ |
| type: boolean | → `bool?` |
| type: object | → nested class ชื่อตาม key, เป็น `ClassName?` |
| type: array ของ object | → `List<ClassName>?` |
| type: array ของ primitive | → `List<String>?` / `List<num>?` ตามชนิดข้อมูลจริง |
| type: null (ไม่รู้ชนิดจริง) | **default เป็น `String?`** ยกเว้น field ที่ชื่อขึ้นต้นด้วย `is_` หรือ `has_` ให้ default เป็น `bool?` |
| nullability | ทุก field เป็น nullable (`?`) หมด เพื่อความปลอดภัยตอน parse JSON จริงที่อาจไม่ครบ field |
| output ที่ต้อง generate ต่อ class | constructor (named params), `fromJson`, `toJson` ตาม pattern ตัวอย่าง |

**ทำไม number ถึงเป็น `num?` ทั้งหมด:** JSON มี number type เดียว และ `JSON.parse` คืน `1.0` มาเป็น `1` — การเดาว่าเป็น `int` หรือ `double` จาก sample เดียวจึงพังทันทีที่ field ที่ sample เป็น `3` ยิงจริงแล้วได้ `3.5` `num` เป็น supertype ของทั้ง `int` และ `double` เลย parse ได้ทั้งคู่ ถ้าต้องการชนิดที่แคบกว่าให้ narrow ที่ call site ด้วย `.toInt()` / `.toDouble()`

**ตัวอย่างอ้างอิง (ใช้เป็น test case หลักในการ implement/verify ทุกครั้งที่แก้ generator):**

Test fixture อยู่ที่ `test/fixtures/loadDocument.ts` และถูก assert แบบ byte-for-byte ใน `test/dartGenerator.test.ts` — ถ้าแก้ generator แล้ว test นี้ต้องยังเขียวเสมอ

Input response:

```json
{
    "documents": [
        {
            "document_type": null,
            "plan_gi_index": null,
            "plan_gi_no": null,
            "plan_gi_date": null,
            "truck_load_index": "93ad6312-44d6-4170-9c8e-5b3d10691e0c",
            "truck_load_no": "SHIP20260213-N2",
            "truck_load_date": "2026-02-13T00:00:00",
            "booking_no": null,
            "booking_date": null,
            "ref_document_no": null,
            "is_shipment": null
        }
    ]
}
```

Output ที่ต้องได้ (root class name = `LoadDocument`):

```dart
class LoadDocument {
  List<Documents>? documents;

  LoadDocument({this.documents});

  LoadDocument.fromJson(Map<String, dynamic> json) {
    if (json['documents'] != null) {
      documents = <Documents>[];
      json['documents'].forEach((v) {
        documents!.add(Documents.fromJson(v));
      });
    }
  }

  Map<String, dynamic> toJson() {
    final Map<String, dynamic> data = <String, dynamic>{};
    if (documents != null) {
      data['documents'] = documents!.map((v) => v.toJson()).toList();
    }
    return data;
  }
}

class Documents {
  String? documentType;
  String? planGiIndex;
  String? planGiNo;
  String? planGiDate;
  String? truckLoadIndex;
  String? truckLoadNo;
  String? truckLoadDate;
  String? bookingNo;
  String? bookingDate;
  String? refDocumentNo;
  bool? isShipment;

  Documents(
      {this.documentType,
      this.planGiIndex,
      this.planGiNo,
      this.planGiDate,
      this.truckLoadIndex,
      this.truckLoadNo,
      this.truckLoadDate,
      this.bookingNo,
      this.bookingDate,
      this.refDocumentNo,
      this.isShipment});

  Documents.fromJson(Map<String, dynamic> json) {
    documentType = json['document_type'];
    planGiIndex = json['plan_gi_index'];
    planGiNo = json['plan_gi_no'];
    planGiDate = json['plan_gi_date'];
    truckLoadIndex = json['truck_load_index'];
    truckLoadNo = json['truck_load_no'];
    truckLoadDate = json['truck_load_date'];
    bookingNo = json['booking_no'];
    bookingDate = json['booking_date'];
    refDocumentNo = json['ref_document_no'];
    isShipment = json['is_shipment'];
  }

  Map<String, dynamic> toJson() {
    final Map<String, dynamic> data = <String, dynamic>{};
    data['document_type'] = documentType;
    data['plan_gi_index'] = planGiIndex;
    data['plan_gi_no'] = planGiNo;
    data['plan_gi_date'] = planGiDate;
    data['truck_load_index'] = truckLoadIndex;
    data['truck_load_no'] = truckLoadNo;
    data['truck_load_date'] = truckLoadDate;
    data['booking_no'] = bookingNo;
    data['booking_date'] = bookingDate;
    data['ref_document_no'] = refDocumentNo;
    data['is_shipment'] = isShipment;
    return data;
  }
}
```

> หมายเหตุ: `is_shipment` เป็น `null` ในตัวอย่างจริง แต่ generate เป็น `bool?` เพราะขึ้นต้นด้วย `is_` — นี่คือ exception rule ที่ต้อง implement ให้ตรง ส่วน field null อื่น ๆ ทั้งหมด default เป็น `String?`

**Whitespace:** ยึดตาม `dart format` (page width 80) — มีบรรทัดว่างคั่นระหว่าง field declarations / constructor / `fromJson` / `toJson` และคั่นระหว่าง class

## Surface (UI มี 2 ที่ ใช้โค้ดชุดเดียวกัน)

- **Sidebar** — icon `{↓}` บน activity bar (`src/webview/sidebar.ts`)
- **Editor panel** — Command Palette → New Request (`src/webview/panel.ts`)

ทั้งคู่เป็นแค่ host ครอบ `WebviewController` ตัวเดียวกัน แต่ละ host ถือ controller ของตัวเองแล้ว `markFocused()` ตอนที่ visible — palette command จะยิงไปที่ตัวที่ focus ล่าสุด **ห้าม duplicate markup หรือ message handling ระหว่างสอง surface** ถ้าจะเพิ่ม UI ให้แก้ที่ `html.ts` / `controller.ts` ที่เดียว

**CSS ต้อง responsive:** sidebar แคบได้ถึง ~200px ส่วน panel กว้างได้เป็น 1400px ใช้ stylesheet เดียวกัน ใช้วิธี `flex-wrap` ให้ row ยุบตัวแทนการล้น ไม่ต้องใช้ media query

## User Flow ของ Extension

1. เปิด sidebar จาก activity bar หรือ Command Palette → `API to Model: New Request`
2. เลือก tab **cURL** หรือ **JSON**
3. **cURL** — paste curl แล้วกด **Send** → parse curl → ยิง request → แสดง response JSON
   **JSON** — paste JSON แล้วกด **Use this JSON** → validate → ข้ามไปข้อ 4 เลย
4. กด **Generate** → ใส่ชื่อ class หลัก (เช่น `LoadDocument`) → เลือกภาษา (ตอนนี้มีแค่ Dart) → แสดง preview code
5. กด **Copy** หรือ **Insert into editor** / **Save as file**

## VS Code Commands

- `apiToModel.newRequest`
- `apiToModel.sendRequest`
- `apiToModel.generateModel`
- `apiToModel.insertModel`

## Coding Convention

- ใช้ TypeScript strict mode
- แยก business logic (curl parser, http client, model generator) ออกจาก webview UI ให้ชัดเจน — โค้ดใน `src/core/` **ห้าม import `vscode`** เพื่อให้ test ได้ด้วย Node ธรรมดา
- `ModelGenerator` เป็น interface กลาง (`src/types/index.ts`)

  ```ts
  interface ModelGenerator {
    readonly id: string;
    readonly label: string;
    readonly fileExtension: string;
    generate(rootClassName: string, json: unknown): string;
  }
  ```

  แล้วให้ `DartGenerator implements ModelGenerator` เพิ่มภาษาใหม่แค่ implement interface นี้แล้ว append เข้า `GENERATORS` array ใน `src/core/generators/ModelGenerator.ts` โดยไม่แตะ logic เดิม

- เขียน unit test (Jest) ให้ `curlParser` และ `dartGenerator` โดยใช้ตัวอย่าง curl/response ด้านบนเป็น test fixture หลัก

## Roadmap

- [ ] รองรับภาษาอื่นเพิ่ม: Kotlin, TypeScript interface, Java, Swift, Python (dataclass)
- [ ] รองรับ curl flags เพิ่มเติม (`-F`, `--form`, cookies, `-u` auth)
- [ ] ตั้งค่า naming convention ได้ (camelCase / snake_case) สำหรับ field
- [ ] รองรับกรณี JSON root เป็น array โดยตรง (ไม่ใช่ object)
- [ ] History ของ request ที่เคยยิงไปแล้ว

## ข้อควรระวังสำหรับ AI เวลาช่วย implement โค้ดในโปรเจกต์นี้

- ยึด conversion rules และตัวอย่าง Dart output ด้านบนเป็นมาตรฐานเทียบผลลัพธ์ทุกครั้งที่แก้ generator — รัน `npm test` ทุกครั้ง
- number ทุกกรณี (int / double / long) → `num?` เท่านั้น ห้าม generate เป็น `int?` หรือ `double?`
- ห้ามเปลี่ยนชื่อ field เพี้ยนไปจาก JSON key เดิม (แปลงแค่ `snake_case` → `camelCase` เท่านั้น) ข้อยกเว้นเดียวคือ Dart reserved word จะถูกเติม `$` ต่อท้ายเพื่อให้ compile ผ่าน (`class` → `class$`) โดย JSON key ยังคงเดิม
- field ที่เจอค่า `null` ในตัวอย่าง JSON ให้ default type เป็น `String?` เสมอ ยกเว้นชื่อขึ้นต้นด้วย `is_`/`has_` ให้เป็น `bool?`
- ทุก field เป็น nullable ทั้งหมด ห้าม generate เป็น non-nullable
