import { cp, mkdir, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { libraryHash, patchLibrary } from "./adapter";

const app = "/Applications/NIIMBOT.app";
const stateDirectory = join(homedir(), "Library/Application Support/NIIMBOT B1 Helper");
const backup = join(stateDirectory, "NIIMBOT 4.2.5 Original.app");
const staged = join(stateDirectory, "NIIMBOT Prepared.app");
const manifestPath = join(stateDirectory, "installation.json");
const library = "Contents/Frameworks/libjcPrinterSdk.dylib";
const restoring = process.argv.includes("--restore");

async function run(args: string[]) {
  const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code) throw new Error(`${args[0]} failed: ${err || out}`);
  return out;
}
async function hash(path: string) {
  return new Bun.CryptoHasher("sha256").update(await Bun.file(path).arrayBuffer()).digest("hex");
}
async function assertClosed() {
  const processes = await run(["/bin/ps", "-axo", "command"]);
  if (processes.includes(join(app, "Contents/MacOS/NIIMBOT"))) throw new Error("Quit the original NIIMBOT app first");
}

if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("Apple silicon Mac required");
await assertClosed();
await mkdir(stateDirectory, { recursive: true });
const manifest = await Bun.file(manifestPath).exists() ? await Bun.file(manifestPath).json() : null;
const currentHash = await hash(join(app, library));

if (restoring) {
  if (!manifest || manifest.status !== "installed") throw new Error("No active installation to restore");
  if (currentHash !== manifest.installedLibraryHash) throw new Error("The app has changed since installation. Restore stopped to preserve that change.");
  if (await hash(join(backup, library)) !== libraryHash) throw new Error("Backup library does not match the supported original");
  await run(["/usr/bin/codesign", "--verify", "--deep", "--strict", backup]);
  const retained = join(stateDirectory, `NIIMBOT Adapter Removed ${Date.now()}.app`);
  await rename(app, retained);
  try {
    await rename(backup, app);
  } catch (error) {
    await rename(retained, app);
    throw error;
  }
  await Bun.write(manifestPath, JSON.stringify({ ...manifest, status: "restored", retainedCopy: retained }, null, 2) + "\n");
  console.log("Original NIIMBOT app restored. Its account and label data were not changed.");
  process.exit(0);
}

if (manifest?.status === "installed" && currentHash === manifest.installedLibraryHash) {
  await run(["/usr/bin/codesign", "--verify", "--deep", "--strict", app]);
  console.log("The B1 adapter is already installed.");
  process.exit(0);
}
if (currentHash !== libraryHash) throw new Error("Unsupported app library. Nothing was changed.");
const version = (await run(["/usr/libexec/PlistBuddy", "-c", "Print :CFBundleShortVersionString", join(app, "Contents/Info.plist")])).trim();
if (version !== "4.2.5") throw new Error(`Unsupported app version: ${version}`);
await run(["/usr/bin/codesign", "--verify", "--deep", "--strict", app]);
if (await Bun.file(join(backup, "Contents/Info.plist")).exists()) throw new Error("An original-app backup already exists. It will not be overwritten.");
if (await Bun.file(join(staged, "Contents/Info.plist")).exists()) throw new Error("A prepared app already exists. Check it before retrying.");

const patched = patchLibrary(Buffer.from(await Bun.file(join(app, library)).arrayBuffer()));
await cp(app, staged, { recursive: true, dereference: false });
await Bun.write(join(staged, library), patched);
const entitlements = join(stateDirectory, "original-entitlements.plist");
await Bun.write(entitlements, await run(["/usr/bin/codesign", "-d", "--entitlements", ":-", app]));
await run(["/usr/bin/codesign", "--force", "--sign", "-", join(staged, library)]);
await run(["/usr/bin/codesign", "--force", "--sign", "-", "--options", "0", "--entitlements", entitlements, staged]);
await run(["/usr/bin/codesign", "--verify", "--deep", "--strict", staged]);
const installedLibraryHash = await hash(join(staged, library));
await assertClosed();
await rename(app, backup);
try {
  await rename(staged, app);
} catch (error) {
  await rename(backup, app);
  throw error;
}
await Bun.write(manifestPath, JSON.stringify({ status: "installed", version, sourceLibraryHash: libraryHash, installedLibraryHash, backup }, null, 2) + "\n");
console.log(`B1 Bluetooth adapter installed in ${app}`);
console.log(`Unchanged original app: ${backup}`);
console.log("Restore with: bun run restore");
