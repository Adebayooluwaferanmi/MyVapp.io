import * as XLSX from "xlsx";
import { z } from "zod";

import { AppError } from "../../lib/app-error";
import type { PreviewElectionVoterImportInput } from "./election-voters.schemas";

type CanonicalHeader = "member_unique_id" | "full_name" | "email" | "phone";

export type ParsedElectionVoterRow = {
  rowNumber: number;
  memberUniqueId: string;
  fullName: string;
  email: string;
  phone: string;
};

export type RejectedElectionVoterRow = {
  rowNumber: number;
  values: Record<string, string | number | null>;
  errors: string[];
};

export type ElectionVoterImportParseResult = {
  acceptedRows: ParsedElectionVoterRow[];
  rejectedRows: RejectedElectionVoterRow[];
  summary: {
    acceptedCount: number;
    rejectedCount: number;
  };
};

const requiredHeaders: CanonicalHeader[] = ["member_unique_id", "full_name", "email", "phone"];
const emailSchema = z.string().email();

const headerSynonyms: Record<CanonicalHeader, string[]> = {
  member_unique_id: ["member_unique_id", "unique_id", "member_id", "member id"],
  full_name: ["full_name", "full name", "name"],
  email: ["email", "email_address", "email address"],
  phone: ["phone", "phone_number", "phone number", "mobile", "mobile_number"]
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizePhone(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function mapHeaderRow(headerRow: unknown[]): Map<CanonicalHeader, number> {
  const normalizedHeaders = headerRow.map((cell) => normalizeHeader(cell));
  const indexMap = new Map<CanonicalHeader, number>();

  for (const header of requiredHeaders) {
    const columnIndex = normalizedHeaders.findIndex((cell) => headerSynonyms[header].includes(cell));

    if (columnIndex === -1) {
      throw new AppError(
        `Missing required column "${header}". Expected columns: member_unique_id, full_name, email, phone.`,
        400
      );
    }

    indexMap.set(header, columnIndex);
  }

  return indexMap;
}

function decodeImportBuffer(input: PreviewElectionVoterImportInput): Buffer | string {
  try {
    const buffer = Buffer.from(input.contentBase64, "base64");

    if (buffer.length === 0) {
      throw new Error("Empty content");
    }

    return input.format === "CSV" ? buffer.toString("utf8") : buffer;
  } catch {
    throw new AppError("The import file could not be decoded. Upload the file again and try once more.", 400);
  }
}

function readWorksheetRows(input: PreviewElectionVoterImportInput): unknown[][] {
  try {
    const source = decodeImportBuffer(input);
    const workbook = XLSX.read(source, {
      type: input.format === "CSV" ? "string" : "buffer"
    });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new AppError("The import file is empty.", 400);
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: false,
      defval: ""
    });

    if (rows.length === 0) {
      throw new AppError("The import file is empty.", 400);
    }

    return rows;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("The import file could not be parsed. Check the file format and try again.", 400);
  }
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((cell) => String(cell ?? "").trim() === "");
}

function toDisplayValue(value: unknown): string | number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  const stringValue = String(value).trim();
  return stringValue === "" ? null : stringValue;
}

function parseRow(
  row: unknown[],
  rowNumber: number,
  headerIndex: Map<CanonicalHeader, number>,
  seenMemberIds: Set<string>,
  seenEmails: Set<string>,
  existingMemberIds: Set<string>,
  existingEmails: Set<string>
): ParsedElectionVoterRow | RejectedElectionVoterRow {
  const values = {
    member_unique_id: toDisplayValue(row[headerIndex.get("member_unique_id") ?? -1]),
    full_name: toDisplayValue(row[headerIndex.get("full_name") ?? -1]),
    email: toDisplayValue(row[headerIndex.get("email") ?? -1]),
    phone: toDisplayValue(row[headerIndex.get("phone") ?? -1])
  };

  const errors: string[] = [];
  const memberUniqueId = String(values.member_unique_id ?? "").trim();
  const fullName = String(values.full_name ?? "").trim();
  const email = String(values.email ?? "")
    .trim()
    .toLowerCase();
  const phone = normalizePhone(String(values.phone ?? ""));

  if (!memberUniqueId) {
    errors.push("member_unique_id is required.");
  }

  if (!fullName) {
    errors.push("full_name is required.");
  }

  if (!email) {
    errors.push("email is required.");
  } else if (!emailSchema.safeParse(email).success) {
    errors.push("email must be a valid email address.");
  }

  if (!phone) {
    errors.push("phone is required.");
  }

  if (memberUniqueId && seenMemberIds.has(memberUniqueId)) {
    errors.push("member_unique_id is duplicated in this file.");
  }

  if (email && seenEmails.has(email)) {
    errors.push("email is duplicated in this file.");
  }

  if (memberUniqueId && existingMemberIds.has(memberUniqueId)) {
    errors.push("member_unique_id already exists for this election.");
  }

  if (email && existingEmails.has(email)) {
    errors.push("email already exists for this election.");
  }

  if (errors.length > 0) {
    return {
      rowNumber,
      values,
      errors
    };
  }

  seenMemberIds.add(memberUniqueId);
  seenEmails.add(email);

  return {
    rowNumber,
    memberUniqueId,
    fullName,
    email,
    phone
  };
}

export function parseElectionVoterImport(
  input: PreviewElectionVoterImportInput,
  existing?: {
    memberUniqueIds?: Iterable<string>;
    emails?: Iterable<string>;
  }
): ElectionVoterImportParseResult {
  const rows = readWorksheetRows(input);
  const headerIndex = mapHeaderRow(rows[0] ?? []);
  const seenMemberIds = new Set<string>();
  const seenEmails = new Set<string>();
  const existingMemberIds = new Set(existing?.memberUniqueIds ?? []);
  const existingEmails = new Set(Array.from(existing?.emails ?? [], (email) => email.trim().toLowerCase()));
  const acceptedRows: ParsedElectionVoterRow[] = [];
  const rejectedRows: RejectedElectionVoterRow[] = [];

  rows.slice(1).forEach((row, index) => {
    if (isBlankRow(row)) {
      return;
    }

    const rowNumber = index + 2;
    const result = parseRow(
      row,
      rowNumber,
      headerIndex,
      seenMemberIds,
      seenEmails,
      existingMemberIds,
      existingEmails
    );

    if ("errors" in result) {
      rejectedRows.push(result);
    } else {
      acceptedRows.push(result);
    }
  });

  return {
    acceptedRows,
    rejectedRows,
    summary: {
      acceptedCount: acceptedRows.length,
      rejectedCount: rejectedRows.length
    }
  };
}
