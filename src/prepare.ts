import { cp, mkdir, realpath, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { patchLibrary } from "./adapter";

if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("This prototype requires an Apple silicon Mac");
const root = resolve(import.meta.dir, "..");
const source = "/Applications/NIIMBOT.app";
const work = join(root, ".local");
const destination = join(work, "NIIMBOT B1 Bluetooth.app");
const library = "Contents/Frameworks/libjcPrinterSdk.dylib";
const version = (await run(["/usr/libexec/PlistBuddy", "-c", "Print :CFBundleShortVersionString", join(source, "Contents/Info.plist")])).trim();
if (version !== "4.2.5") throw new Error(`Unsupported NIIMBOT version: ${version}`);
await run(["/usr/bin/codesign", "--verify", "--deep", "--strict", source]);
const original = Buffer.from(await Bun.file(join(source, library)).arrayBuffer());
const patched = patchLibrary(original);
await mkdir(work, { recursive: true });
if (await Bun.file(join(destination, "Contents/Info.plist")).exists()) {
  if (!process.argv.includes("--rebuild")) throw new Error("Working copy already exists. Close it and use --rebuild to make a new copy.");
  const processes = await run(["/bin/ps", "-axo", "command"]);
  if (processes.includes(join(destination, "Contents/MacOS/NIIMBOT"))) throw new Error("Close the test app before rebuilding it");
  await rm(destination, { recursive: true });
}
await cp(source, destination, { recursive: true, dereference: false });
if ((await realpath(destination)) === (await realpath(source))) throw new Error("Working copy points to the original app");
await Bun.write(join(destination, library), patched);

async function run(args: string[]) {
  const command = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(command.stdout).text(), new Response(command.stderr).text(), command.exited]);
  if (code) throw new Error(`${args[0]} failed: ${stderr || stdout}`);
  return stdout;
}
const entitlements = join(work, "entitlements.plist");
await Bun.write(entitlements, await run(["/usr/bin/codesign", "-d", "--entitlements", ":-", source]));
await run(["/usr/libexec/PlistBuddy", "-c", "Set :CFBundleIdentifier local.niimbot.b1bluetooth", join(destination, "Contents/Info.plist")]);
await run(["/usr/libexec/PlistBuddy", "-c", "Set :CFBundleName NIIMBOT B1 Bluetooth", join(destination, "Contents/Info.plist")]);
await run(["/usr/bin/codesign", "--force", "--sign", "-", join(destination, library)]);
await run(["/usr/bin/codesign", "--force", "--sign", "-", "--options", "0", "--entitlements", entitlements, destination]);
await run(["/usr/bin/codesign", "--verify", "--deep", "--strict", destination]);
console.log(`Local test copy ready: ${destination}`);
