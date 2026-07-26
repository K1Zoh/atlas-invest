import { describe, expect, it } from "vitest";
import { normalizeKrakenAsset, parseKrakenPair } from "./kraken";

describe("normalizeKrakenAsset", () => {
  it("maps legacy X/Z-prefixed codes via the alias table", () => {
    expect(normalizeKrakenAsset("XXBT")).toBe("BTC");
    expect(normalizeKrakenAsset("XBT")).toBe("BTC");
    expect(normalizeKrakenAsset("XETH")).toBe("ETH");
    expect(normalizeKrakenAsset("ZEUR")).toBe("EUR");
    expect(normalizeKrakenAsset("XXDG")).toBe("DOGE");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeKrakenAsset(" xxbt ")).toBe("BTC");
  });

  it("strips a legacy 4-char X prefix not covered by the table", () => {
    expect(normalizeKrakenAsset("XSOL")).toBe("SOL");
  });

  it("keeps modern codes unchanged", () => {
    expect(normalizeKrakenAsset("SOL")).toBe("SOL");
    expect(normalizeKrakenAsset("ADA")).toBe("ADA");
  });

  it("reduces a staking/variant suffix to its base code", () => {
    expect(normalizeKrakenAsset("DOT.S")).toBe("DOT");
    expect(normalizeKrakenAsset("ETH2.S")).toBe("ETH2");
  });
});

describe("parseKrakenPair", () => {
  it("splits legacy prefixed pairs on the longest quote suffix", () => {
    expect(parseKrakenPair("XXBTZEUR")).toEqual({ base: "BTC", quote: "EUR" });
    expect(parseKrakenPair("XETHZEUR")).toEqual({ base: "ETH", quote: "EUR" });
  });

  it("handles short forms and a slash separator", () => {
    expect(parseKrakenPair("XBTEUR")).toEqual({ base: "BTC", quote: "EUR" });
    expect(parseKrakenPair("SOLEUR")).toEqual({ base: "SOL", quote: "EUR" });
    expect(parseKrakenPair("XXBT/ZEUR")).toEqual({ base: "BTC", quote: "EUR" });
  });

  it("recognizes a crypto-quoted pair (ETH priced in BTC)", () => {
    expect(parseKrakenPair("ETHXBT")).toEqual({ base: "ETH", quote: "BTC" });
  });

  it("returns null for an unrecognized pair", () => {
    expect(parseKrakenPair("HELLO")).toBeNull();
  });
});
