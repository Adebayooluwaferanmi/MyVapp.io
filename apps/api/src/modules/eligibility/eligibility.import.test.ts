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
        "member_unique_id,full_name,age,email\nM-100,Ada Okoye,31, ADA@example.com \nM-101,Tunde Bello,29,tunde@example.com"
      )
    });

    expect(result.acceptedRows).toEqual([
      {
        rowNumber: 2,
        memberUniqueId: "M-100",
        fullName: "Ada Okoye",
        age: 31,
        email: "ada@example.com"
      },
      {
        rowNumber: 3,
        memberUniqueId: "M-101",
        fullName: "Tunde Bello",
        age: 29,
        email: "tunde@example.com"
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
          "member_unique_id,full_name,age,email\nM-100,Ada Okoye,31,ada@example.com\nM-100,Second Ada,30,second@example.com\nM-102,Tunde Bello,29,ada@example.com\nM-103,Existing Member,40,existing@example.com"
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
        ["Unique ID", "Full Name", "Age", "Email Address"],
        ["M-200", "Ifeoma Nnaji", 28, "ifeoma@example.com"]
      ])
    });

    expect(result.acceptedRows[0]).toMatchObject({
      memberUniqueId: "M-200",
      fullName: "Ifeoma Nnaji",
      age: 28,
      email: "ifeoma@example.com"
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
