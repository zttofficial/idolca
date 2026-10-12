import { describe, expect, it } from "vitest";
import { gradeLabel, gradeLookupUrl, isInHouse, parseGrade } from "@/lib/grading";

describe("grading", () => {
  it("treats a form without a grading company as ungraded, even with leftover fields", () => {
    expect(parseGrade({}, "IC-000001")).toEqual({ grade: null });
    expect(parseGrade({ grader: "", gradeScore: "9", gradeCert: "123" }, "IC-000001")).toEqual({ grade: null });
  });

  it("requires a known company, a score in half steps from 1 to 10, and a cert number", () => {
    expect(parseGrade({ grader: "psa", gradeScore: "9.5", gradeCert: " 12345678 " }, "IC-000001")).toEqual({ grade: { grader: "psa", score: 9.5, cert: "12345678" } });
    expect(parseGrade({ grader: "acme", gradeScore: 10, gradeCert: "123" }, "IC-000001")).toEqual({ error: "invalid_grade" });
    expect(parseGrade({ grader: "psa", gradeScore: "", gradeCert: "123" }, "IC-000001")).toEqual({ error: "invalid_grade" });
    expect(parseGrade({ grader: "psa", gradeScore: 9.3, gradeCert: "123" }, "IC-000001")).toEqual({ error: "invalid_grade" });
    expect(parseGrade({ grader: "psa", gradeScore: 11, gradeCert: "123" }, "IC-000001")).toEqual({ error: "invalid_grade" });
    expect(parseGrade({ grader: "psa", gradeScore: 9, gradeCert: "" }, "IC-000001")).toEqual({ error: "invalid_grade" });
    expect(parseGrade({ grader: "psa", gradeScore: 9, gradeCert: "12/34" }, "IC-000001")).toEqual({ error: "invalid_grade" });
  });

  it("uses the vault serial as the cert number for Idolca's own grading", () => {
    expect(parseGrade({ grader: "idolca", gradeScore: 10, gradeCert: "ignored" }, "IC-000128")).toEqual({ grade: { grader: "idolca", score: 10, cert: "IC-000128" } });
    expect(isInHouse({ grader: "idolca", score: 10, cert: "IC-000128" })).toBe(true);
    expect(isInHouse({ grader: "psa", score: 10, cert: "1" })).toBe(false);
    expect(gradeLabel({ grader: "idolca", score: 10, cert: "IC-000128" })).toBe("IDG 10");
  });

  it("labels the grade with the company and links to public lookups where they exist", () => {
    expect(gradeLabel({ grader: "psa", score: 10, cert: "12345678" })).toBe("PSA 10");
    expect(gradeLookupUrl({ grader: "psa", score: 10, cert: "12345678" })).toBe("https://www.psacard.com/cert/12345678");
    expect(gradeLookupUrl({ grader: "cgc", score: 9.5, cert: "1401036583136" })).toBe("https://www.cgccards.com/certlookup/1401036583136/9_5/");
    expect(gradeLookupUrl({ grader: "brg", score: 9, cert: "BRG-1" })).toBeNull();
  });
});
