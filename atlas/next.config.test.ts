import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("Next.js development origins", () => {
  it("allows the loopback and local-network addresses used to open Atlas", () => {
    expect(nextConfig.allowedDevOrigins).toEqual(
      expect.arrayContaining(["127.0.0.1", "192.168.*.*"]),
    );
  });
});
