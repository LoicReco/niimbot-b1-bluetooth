import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { libraryHash, makeAdapter, patchLibrary } from "./adapter";

describe("version-specific adapter", () => {
  test("rejects an unknown library before parsing or writing it", () => {
    const input = Buffer.from("unsupported library");
    const before = Buffer.from(input);
    expect(() => patchLibrary(input)).toThrow("Unsupported printer library");
    expect(input).toEqual(before);
  });

  test("changes only the two intended function bodies", async () => {
    const backup = join(homedir(), "Library/Application Support/NIIMBOT B1 Helper/NIIMBOT 4.2.5 Original.app/Contents/Frameworks/libjcPrinterSdk.dylib");
    const file = Bun.file(await Bun.file(backup).exists() ? backup : "/Applications/NIIMBOT.app/Contents/Frameworks/libjcPrinterSdk.dylib");
    if (!await file.exists()) throw new Error("Install the supported NIIMBOT app for this local compatibility test");
    const original = Buffer.from(await file.arrayBuffer());
    expect(new Bun.CryptoHasher("sha256").update(original).digest("hex")).toBe(libraryHash);
    const patched = patchLibrary(original);
    let slice = -1;
    for (let i = 0; i < original.readUInt32BE(4); i++) {
      const entry = 8 + i * 20;
      if (original.readUInt32BE(entry) === 0x100000c) slice = original.readUInt32BE(entry + 8);
    }
    expect(slice).toBeGreaterThan(0);
    const restored = Buffer.from(patched);
    for (const { address, bytes } of makeAdapter()) {
      expect(patched.subarray(slice + address, slice + address + bytes.length)).toEqual(bytes);
      original.copy(restored, slice + address, slice + address, slice + address + bytes.length);
    }
    expect(restored).toEqual(original);
    expect(new Bun.CryptoHasher("sha256").update(original).digest("hex")).toBe(libraryHash);
  });
});
