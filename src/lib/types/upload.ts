export type UploadJobStatus =
  | "UPLOADED"
  | "VALIDATED"
  | "PARTIALLY_APPLIED"
  | "APPLIED"
  | "FAILED";

export type UploadLineValidationStatus =
  | "PENDING"
  | "VALID"
  | "INVALID"
  | "APPLIED"
  | "SKIPPED";

export type UploadType = "GR_BULK" | "DN_BULK";
export type RefType = "ASN" | "DN";

export interface GRUploadRowInput {
  sku: string;
  qty_received: number | string;
  expected_qty?: number | string;
}

export interface DNUploadRowInput {
  sku: string;
  qty_to_ship: number | string;
  reserved_qty?: number | string;
  description?: string | null;
}

export interface UploadLineResult {
  lineNo: number;
  sku: string;
  description?: string | null;
  refLineId: string | null;
  expectedQty: number | null;
  inputQty: number | null;
  validationStatus: UploadLineValidationStatus;
  validationMessage: string | null;
  isSelected: boolean;
}