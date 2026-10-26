import { describe, expect, it } from "vitest";
import { csvHeaderSample, csvHeaders } from "./LiveListImportWizard";

const bytes = (text: string) => new TextEncoder().encode(text);
describe("server mapped CSV header admission", () => {
  it("keeps quoted commas and CRLF header names for ERP mapping", () => {
    expect(csvHeaders(bytes('\uFEFF"Legal, name",CountryCode\r\nAcme,ZM\r\n'))).toEqual(["Legal, name", "CountryCode"]);
    expect(csvHeaders(bytes('"Display ""public""\nname",CountryCode\r\nAcme,ZM\r\n')))
      .toEqual(['Display "public"\nname', "CountryCode"]);
    expect(csvHeaderSample(bytes("Code,Name\nA1,Widget\n")).sample).toEqual({ Code: "A1", Name: "Widget" });
  });
  it("denies duplicate headers and malformed quote boundaries before preview", () => {
    expect(() => csvHeaders(bytes("Name,Name\nA,B"))).toThrow(/duplicated/);
    expect(() => csvHeaders(bytes('"Name"x,Country\nA,ZM'))).toThrow(/quote/);
  });
  it("never interprets a data row as additional mapping targets", () => {
    expect(csvHeaders(bytes("Code,Name\nA,B\nC,D"))).toEqual(["Code", "Name"]);
  });
});
