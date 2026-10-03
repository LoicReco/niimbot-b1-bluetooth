import { dlopen, JSCallback, ptr, toArrayBuffer } from "bun:ffi";
import { resolve, join } from "node:path";

if (!process.argv.includes("--worker")) {
  const child = Bun.spawn([process.execPath, "run", import.meta.path, "--worker"], { stdout: "pipe", stderr: "pipe" });
  const timeout = setTimeout(() => child.kill(), 35000);
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  clearTimeout(timeout);
  for (const line of stdout.split("\n")) if (line.startsWith("CHECK ")) console.log(line.slice(6));
  await Bun.write(resolve(import.meta.dir, "../.local/check.log"), stdout + "\n" + stderr);
  if (code) console.error("Connection test failed. See .local/check.log.");
  process.exit(code === 0 ? 0 : 1);
}
const base = resolve(import.meta.dir, "../.local/NIIMBOT B1 Bluetooth.app/Contents/Frameworks");
const loader = dlopen("/usr/lib/libSystem.B.dylib", { dlopen: { args: ["cstring", "i32"], returns: "ptr" } });
for (const name of ["libjsoncpp.24.dylib", "libglog.0.dylib", "libz.1.dylib"]) {
  if (!loader.symbols.dlopen(Buffer.from(join(base, name) + "\0"), 10)) throw new Error(`Cannot load ${name}`);
}
const sdk = dlopen(join(base, "libjcPrinterSdk.dylib"), {
  getUsbPrinter: { args: ["ptr", "ptr"], returns: "void" },
  connectUsbPrinter: { args: ["ptr", "ptr"], returns: "i32" },
  getPrinterType: { args: ["ptr"], returns: "u64" },
  closePrinter: { args: ["ptr"], returns: "void" },
  freeData: { args: ["ptr"], returns: "void" },
});
const output = new BigUint64Array(1), count = new Int32Array(1);
console.log("CHECK Scanning through the adapter...");
sdk.symbols.getUsbPrinter(ptr(output), ptr(count));
if (count[0] !== 1 || !output[0]) throw new Error(`Expected one B1; found ${count[0]}`);
const record = Buffer.from(new Uint8Array(toArrayBuffer(Number(output[0]), 0, 156)));
sdk.symbols.freeData(Number(output[0]));
if (record.readInt32LE(152) !== 4096) throw new Error("Wrong model in discovery record");
console.log("CHECK B1 found in the adapted printer list.");
const callback = new JSCallback(() => {}, { args: [], returns: "void", threadsafe: true });
const status = sdk.symbols.connectUsbPrinter(ptr(record), callback.ptr);
if (status !== 0) throw new Error(`Connect returned ${status}`);
try {
  const model = BigInt(sdk.symbols.getPrinterType(ptr(record)));
  if (model !== 4096n) throw new Error(`Wrong model response: ${model}`);
  console.log("CHECK Connected through the adapter. The printer confirms model 4096 (standard B1).");
} finally {
  sdk.symbols.closePrinter(ptr(record));
  console.log("CHECK Connection closed. No label was printed.");
}
