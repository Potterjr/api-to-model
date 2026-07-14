/** The reference request/response pair from CLAUDE.md. */
export const LOAD_DOCUMENT_RESPONSE = {
  documents: [
    {
      document_type: null,
      plan_gi_index: null,
      plan_gi_no: null,
      plan_gi_date: null,
      truck_load_index: '93ad6312-44d6-4170-9c8e-5b3d10691e0c',
      truck_load_no: 'SHIP20260213-N2',
      truck_load_date: '2026-02-13T00:00:00',
      booking_no: null,
      booking_date: null,
      ref_document_no: null,
      is_shipment: null,
    },
  ],
};

/** The Dart that CLAUDE.md requires for `LOAD_DOCUMENT_RESPONSE` with root `LoadDocument`. */
export const LOAD_DOCUMENT_DART = `class LoadDocument {
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
`;
