// Package metadata regression coverage for scoped publishing and the isa binary.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("package metadata", () => {
  it("publishes a scoped package while exposing the isa binary", async () => {
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as {
      name: string;
      bin: Record<string, string>;
      publishConfig: { access: string };
    };

    expect(packageJson.name).toBe("@d0ublecl1ck/isa-cli");
    expect(packageJson.bin).toEqual({ isa: "./dist/cli.js" });
    expect(packageJson.publishConfig.access).toBe("public");
  });
});
