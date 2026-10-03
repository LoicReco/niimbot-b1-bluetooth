import { Arm64 } from "./arm64";

export const libraryHash = "cfbac2ec3c1be36284bd2859f9643a5ed1e96478d8a6ad55c4c43b55225de441";
const api = { getBluetooth: 0x4d94, connectBluetooth: 0x5134, searchTime: 0x5438, printerType: 0x9464, close: 0x9938, calloc: 0x1cb810, free: 0x1cb8c4, memcpy: 0x1cb984, strlen: 0x1cbb58 };

// NIIMBOT 4.2.5, Apple silicon. USB record: key[21], port[131], model:int32.
// Bluetooth record: name[41], address[23], type:int32 (68 bytes).
// The adapter keeps the real Bluetooth name as the SDK connection key.
export function makeAdapter() {
  const scan = new Arm64(0x3f78);
  const saved = [19, 20, 21, 22, 23, 24, 25, 26, 29, 30];
  scan.enter(112, saved);
  scan.mov(19, 0); // output records
  scan.mov(20, 1); // output count
  scan.str(31, 19);
  scan.str(31, 20, 0, 4);
  scan.str(31, 31, 80);
  scan.str(31, 31, 88, 4);
  scan.imm(0, 5);
  scan.call(api.searchTime);
  scan.add(0, 31, 80);
  scan.add(1, 31, 88);
  scan.call(api.getBluetooth);
  scan.ldr(21, 31, 80);
  scan.ldr(22, 31, 88, 4);
  scan.cbz(21, "done");
  scan.cbz(22, "freeBluetooth");
  scan.cmpImm(22, 1000);
  scan.branch("freeBluetooth", 8); // unsigned higher
  scan.mov(0, 22);
  scan.imm(1, 156);
  scan.call(api.calloc);
  scan.mov(23, 0);
  scan.cbz(23, "freeBluetooth");
  scan.mov(24, 23);
  scan.mov(25, 21);
  scan.imm(26, 0);
  scan.label("loop");
  scan.ldr(8, 25, 0, 2);
  scan.imm(9, 0x3142); // B1
  scan.cmp(8, 9);
  scan.branch("next", 1);
  scan.ldr(8, 25, 2, 1);
  scan.cmpImm(8, 45); // '-' excludes B1 Pro names with another prefix
  scan.branch("next", 1);
  scan.mov(0, 25);
  scan.call(api.strlen);
  scan.cmpImm(0, 20);
  scan.branch("next", 8);
  scan.mov(2, 0);
  scan.mov(0, 24);
  scan.mov(1, 25);
  scan.call(api.memcpy);
  scan.add(0, 24, 21);
  scan.mov(1, 25);
  scan.imm(2, 41);
  scan.call(api.memcpy);
  scan.imm(8, 4096);
  scan.str(8, 24, 152, 4);
  scan.add(24, 24, 156);
  scan.add(26, 26, 1);
  scan.label("next");
  scan.add(25, 25, 68);
  scan.sub(22, 22, 1);
  scan.cbz(22, "publish");
  scan.branch("loop");
  scan.label("publish");
  scan.cbz(26, "freeEmpty");
  scan.str(23, 19);
  scan.str(26, 20, 0, 4);
  scan.branch("freeBluetooth");
  scan.label("freeEmpty");
  scan.mov(0, 23);
  scan.call(api.free);
  scan.label("freeBluetooth");
  scan.mov(0, 21);
  scan.call(api.free);
  scan.label("done");
  scan.leave(112, saved);

  const connect = new Arm64(0x438c);
  const csaved = [19, 20, 29, 30];
  connect.enter(112, csaved);
  connect.mov(19, 0);
  connect.mov(20, 1);
  for (let offset = 32; offset < 104; offset += 8) connect.str(31, 31, offset);
  connect.add(0, 31, 32);
  connect.mov(1, 19);
  connect.imm(2, 21);
  connect.call(api.memcpy);
  connect.add(0, 31, 73);
  connect.mov(1, 19);
  connect.imm(2, 21);
  connect.call(api.memcpy);
  connect.add(0, 31, 32);
  connect.mov(1, 20);
  connect.call(api.connectBluetooth);
  connect.cbz(0, "checkModel");
  connect.branch("done");
  connect.label("checkModel");
  connect.mov(0, 19);
  connect.call(api.printerType);
  connect.imm(8, 4096);
  connect.cmp(0, 8);
  connect.branch("success", 0);
  connect.mov(0, 19);
  connect.call(api.close);
  connect.emit(0x12800000); // mov w0, #-1
  connect.branch("done");
  connect.label("success");
  connect.imm(0, 0);
  connect.label("done");
  connect.leave(112, csaved);
  return [{ address: scan.base, bytes: scan.finish(0x438c - 0x3f78) }, { address: connect.base, bytes: connect.finish(0x4728 - 0x438c) }];
}

export function patchLibrary(original: Buffer) {
  const hash = new Bun.CryptoHasher("sha256").update(original).digest("hex");
  if (hash !== libraryHash) throw new Error("Unsupported printer library. The installed app was not changed.");
  if (original.readUInt32BE(0) !== 0xcafebabe) throw new Error("Expected a universal Mach-O library");
  let slice = -1;
  for (let i = 0; i < original.readUInt32BE(4); i++) {
    const entry = 8 + i * 20;
    if (original.readUInt32BE(entry) === 0x100000c) slice = original.readUInt32BE(entry + 8);
  }
  if (slice < 0 || original.readUInt32LE(slice) !== 0xfeedfacf) throw new Error("No arm64 slice");
  const output = Buffer.from(original);
  for (const { address, bytes } of makeAdapter()) bytes.copy(output, slice + address);
  return output;
}
