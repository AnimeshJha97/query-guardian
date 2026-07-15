import { describe, expect, it } from "vitest";
import { fingerprintQuery, normalizeQuery } from "../src/fingerprint";

describe("normalizeQuery", () => {
  it("collapses whitespace and lowercases", () => {
    expect(normalizeQuery("SELECT *\n  FROM   books")).toBe("select * from books");
  });

  it("replaces string and numeric literals with placeholders", () => {
    expect(normalizeQuery("SELECT * FROM books WHERE title = 'Dune' AND year = 1965")).toBe(
      "select * from books where title = ? and year = ?"
    );
  });

  it("collapses IN lists to a single placeholder", () => {
    expect(normalizeQuery("SELECT id FROM books WHERE id IN (1, 2, 3)")).toBe(
      "select id from books where id in (?)"
    );
  });

  it("does not mangle identifiers containing digits", () => {
    expect(normalizeQuery("SELECT col2 FROM table1")).toBe("select col2 from table1");
  });
});

describe("fingerprintQuery", () => {
  it("gives the same hash for structurally identical queries", () => {
    const a = fingerprintQuery("SELECT * FROM books WHERE author_id = 42");
    const b = fingerprintQuery("select *  from books where author_id = 7");
    expect(a.queryHash).toBe(b.queryHash);
    expect(a.normalizedQuery).toBe(b.normalizedQuery);
  });

  it("gives different hashes for different queries", () => {
    const a = fingerprintQuery("SELECT * FROM books");
    const b = fingerprintQuery("SELECT * FROM authors");
    expect(a.queryHash).not.toBe(b.queryHash);
  });
});
