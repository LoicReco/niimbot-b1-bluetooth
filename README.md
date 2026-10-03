# NIIMBOT B1 Bluetooth for Mac — prototype

Use the official NIIMBOT label editor with a standard B1 over Bluetooth.

## The problem

NIIMBOT 4.2.5 for Mac states that its Bluetooth connection option supports only the **B1 Pro**. In our test, the standard **B1** was on, but the app's Bluetooth list showed no printers. This prevented wireless printing from the official label editor.

The standard B1 can communicate with a Mac over Bluetooth. We used the printer library already included in the official app to find the B1, connect to it, and read its model ID. The app does not offer this connection for the standard B1, although its library supports it. We have not identified the exact app filter that caused the empty list. See the [investigation record](docs/investigation.md) for the verified results.

This project keeps the official label editor and changes two functions in its printer library. After installation, select **USB connection** or **Connect via data cable** in the app. The adapter uses Bluetooth through that option. **No USB cable is needed.** The original Bluetooth tab keeps its existing restrictions.

**Status:** tested with a real standard B1. The official editor in a separate test copy printed a 40 × 30 mm label containing “test.” The same adapter was then installed in the normal NIIMBOT app, which also connected to the B1. This is an experimental source project for NIIMBOT 4.2.5 on Apple silicon.

## How it works

The preparation script makes a separate app copy. It replaces two entry points in the copy's printer library:

- Printer discovery: show nearby B1 Bluetooth devices in the normal printer list.
- Printer connection: use the existing NIIMBOT Bluetooth connection code and check for model 4096.

The label editor, label rendering, and printer protocol code remain vendor-provided. `prepare` leaves `/Applications/NIIMBOT.app` unchanged. The optional `install-adapter` command applies the same adapter to that installed app and saves the unchanged original as a backup. No extra background process is needed after the app starts.

## Requirements

- Apple silicon Mac.
- NIIMBOT 4.2.5 installed at `/Applications/NIIMBOT.app`.
- The exact supported printer library. The script checks its SHA-256 hash before it makes changes.
- Bun, and the standard macOS `codesign` and `PlistBuddy` tools.
- A standard B1 with power on and Bluetooth available.

Intel Macs and other NIIMBOT models are not supported by this prototype.

## Local test

```sh
bun run prepare
bun run test
bun run check
```

The check connects to one nearby B1, reads its model, and disconnects. It does not print a label. Keep the check separate from an active editor connection.

Open `.local/NIIMBOT B1 Bluetooth.app`. In the connection window, select **Connect via data cable**. In this prototype, that list uses Bluetooth. Select the B1 if it appears. The existing Bluetooth tab still has the original app's restrictions.

The copy has its own app identity and local storage. It does not copy labels, account settings, or passwords from the installed app. macOS can ask for Bluetooth access for the separate copy.

To rebuild, close the test app first:

```sh
bun run prepare --rebuild
```

`prepare` requires the unchanged vendor app at `/Applications/NIIMBOT.app`. If you have applied `install-adapter`, restore the vendor app before using `prepare` again.

## Use the normal NIIMBOT app

After testing, quit both NIIMBOT apps and run:

```sh
bun run install-adapter
```

This prepares and checks a changed copy, saves the original app under `~/Library/Application Support/NIIMBOT B1 Helper/NIIMBOT 4.2.5 Original.app`, and places the adapted app at `/Applications/NIIMBOT.app`. It retains the original app identity and its existing account and label storage. Use the **USB connection** option in that app to start the Bluetooth adapter.

To restore the vendor app, quit NIIMBOT and run:

```sh
bun run restore
```

Restore checks that the installed adapter and the backup are still the expected versions. It stops if an app update or another change occurred. It retains the removed adapter copy. No account or label data is removed.

## Updates and removal

The source contains a version-specific adapter. A NIIMBOT update can change the native interface. The script rejects a different printer library. Support for a new release requires a new test; automatic rebuild alone is not proof of compatibility.

Connect manually through **USB connection**. Automatic reconnect has not been verified. The displayed printer name can have a repeated `B1-` prefix. The prototype also retains the original library's native unwind tables; exception paths need further review before a packaged release.

If the adapter is installed in the normal app, run `bun run restore` before removing this project. To remove only the separate test copy, quit it and remove `.local/NIIMBOT B1 Bluetooth.app`. Its separate app data is under `~/Library/Application Support/local.niimbot.b1bluetooth`.

## Signing and distribution

The scripts apply a local ad-hoc signature to the changed library and app. The adapted app does not retain NIIMBOT's notarized signature or hardened-runtime setting. The unchanged backup retains the vendor signature. The scripts do not change Gatekeeper or other system-wide security settings.

Share only this source project. Do not upload `.local`, app copies, native libraries, device logs, or user data. `.local` is excluded from Git. The project does not contain or grant rights to NIIMBOT software. Each user must obtain the official app separately.

The adapter source is MIT licensed. This project is independent of NIIMBOT.

## Files

- `src/prepare.ts`: validate the installed library, make the copy, apply the adapter, and sign locally.
- `src/adapter.ts`: the two adapter functions and the version guard.
- `src/arm64.ts`: a small encoder for the instructions used by the adapter.
- `src/check.ts`: a real-device connection test through the adapted interface.
- `src/install.ts`: install the adapter in the normal app, or restore the saved original.
- `docs/investigation.md`: verified results and open work.
