import { describe, expect, it } from "vitest";
import { TtlCache } from "../src/lib/cache.ts";
import { hashPassword, verifyPassword } from "../src/lib/password.ts";
import { readCookie } from "../src/lib/sessions.ts";
import { Validator } from "../src/lib/validate.ts";

describe("Validator", () => {
  it("trims strings and treats empty as missing", () => {
    const v = new Validator({ name: "  Jane  ", notes: "" });
    expect(v.string("name")).toBe("Jane");
    expect(v.string("notes")).toBeNull();
    expect(() => v.check()).not.toThrow();
  });

  it("parses numeric strings", () => {
    const v = new Validator({ salary: "50000", bad: "12.5" });
    expect(v.int("salary")).toBe(50000);
    expect(v.int("bad")).toBeNull();
    expect(() => v.check()).toThrow("Validation failed");
  });

  it("rejects invalid calendar dates", () => {
    for (const d of ["2026-13-45", "2026-02-30", "26-1-1"]) {
      const v = new Validator({ d });
      expect(v.date("d")).toBeNull();
      expect(() => v.check()).toThrow();
    }
    expect(new Validator({ d: "2024-02-29" }).date("d")).toBe("2024-02-29");
  });
});

describe("password hashing", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong horse", hash)).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });
});

describe("readCookie", () => {
  it("finds a cookie among several", () => {
    expect(readCookie("a=1; jt_session=abc; b=2", "jt_session")).toBe("abc");
    expect(readCookie(undefined, "jt_session")).toBeUndefined();
  });
});

describe("TtlCache", () => {
  it("expires entries", async () => {
    const cache = new TtlCache<number>(10);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.get("a")).toBeUndefined();
  });
});
