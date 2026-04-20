import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { AppError } from "../../lib/app-error";
import { parseElectionEligibilityImport } from "./eligibility.import";

function encodeCsv(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function encodeWorkbook(rows: unknown[][]) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Registry");

  return XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
}

describe("parseElectionEligibilityImport", () => {
  it("parses valid csv rows and normalizes email addresses", () => {
    const result = parseElectionEligibilityImport({
      filename: "registry.csv",
      format: "CSV",
      contentBase64: encodeCsv(
        "member_unique_id,full_name,email,phone\nM-100,Ada Okoye, ADA@example.com ,+234 800 111 1111\nM-101,Tunde Bello,tunde@example.com,+234 800 222 2222"
      )
    });

    expect(result.acceptedRows).toEqual([
      {
        rowNumber: 2,
        memberUniqueId: "M-100",
        fullName: "Ada Okoye",
        email: "ada@example.com",
        phone: "+234 800 111 1111"
      },
      {
        rowNumber: 3,
        memberUniqueId: "M-101",
        fullName: "Tunde Bello",
        email: "tunde@example.com",
        phone: "+234 800 222 2222"
      }
    ]);
    expect(result.rejectedRows).toEqual([]);
    expect(result.summary).toEqual({
      acceptedCount: 2,
      rejectedCount: 0
    });
  });

  it("rejects duplicate rows and existing election collisions", () => {
    const result = parseElectionEligibilityImport(
      {
        filename: "registry.csv",
        format: "CSV",
        contentBase64: encodeCsv(
          "member_unique_id,full_name,email,phone\nM-100,Ada Okoye,ada@example.com,+234 800 111 1111\nM-100,Second Ada,second@example.com,+234 800 111 1112\nM-102,Tunde Bello,ada@example.com,+234 800 111 1113\nM-103,Existing Member,existing@example.com,+234 800 111 1114"
        )
      },
      {
        emails: ["existing@example.com"]
      }
    );

    expect(result.acceptedRows).toHaveLength(1);
    expect(result.rejectedRows).toHaveLength(3);
    expect(result.rejectedRows.map((row) => row.errors)).toEqual([
      ["member_unique_id is duplicated in this file."],
      ["email is duplicated in this file."],
      ["email already exists for this election."]
    ]);
  });

  it("parses xlsx files with common header variants", () => {
    const result = parseElectionEligibilityImport({
      filename: "registry.xlsx",
      format: "XLSX",
      contentBase64: encodeWorkbook([
        ["Unique ID", "Full Name", "Email Address", "Phone Number"],
        ["M-200", "Ifeoma Nnaji", "ifeoma@example.com", "+234 800 333 3333"]
      ])
    });

    expect(result.acceptedRows[0]).toMatchObject({
      memberUniqueId: "M-200",
      fullName: "Ifeoma Nnaji",
      email: "ifeoma@example.com",
      phone: "+234 800 333 3333"
    });
  });

  it("throws when the required headers are missing", () => {
    expect(() =>
      parseElectionEligibilityImport({
        filename: "registry.csv",
        format: "CSV",
        contentBase64: encodeCsv("name,email\nAda Okoye,ada@example.com")
      })
    ).toThrowError(AppError);
  });
});
