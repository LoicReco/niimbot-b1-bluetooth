# Investigation record

Test date: 2026-10-03. NIIMBOT app 4.2.5 (build 202609012037), bundled SDK 4.2.2.3, Apple silicon Mac, standard B1. Earlier investigation notes called the app 4.2.4. Direct inspection of both the original and working-copy Info.plist confirms 4.2.5.

## Verified

1. The unmodified bundled SDK discovers and connects to the B1 over Bluetooth when discovery and connection occur in the same process.
2. The printer returns model ID 4096, the standard B1. B1 Pro has a different model ID.
3. A fresh process cannot use a connection that a separate helper process holds. The SDK keeps controller state inside its process.
4. The app's English assets state that Bluetooth is supported only on B1 Pro. Its Dart binary has compiled Bluetooth model support lists. The exact active filter has not been isolated.
5. The library's default ten-second scan can finish too late for its outer timeout. A five-second scan returns devices. The real app already uses five- and seven-second scans, so this does not establish the cause of the app's empty list.
6. The Mac library's Wi-Fi transport functions are stubs. A local network-printer proxy cannot use that interface in this version.
7. The original app uses the hardened runtime. A separate process cannot simply pass its live Bluetooth connection to that app.
8. The adapter in this project passes a real-device test through `getUsbPrinter` and `connectUsbPrinter`: discovery, connection, model query, close. No label was printed.
9. The separate app starts and reaches its home screen. The user reported that the connection works. A later accessibility read shows a connected B1 container, and a screenshot shows a green connection indicator in the real editor. The initial empty discovery screen did not prove a permanent failure.
10. Two local compatibility tests pass: an unknown library is rejected without change, and the patch changes bytes only inside the two intended function bodies. The original installed app also passes `codesign --verify --deep --strict` after the test.
11. The user created and printed a label containing “test.” The editor shows **Printing done**, a connected B1, and label stock T40*30-230WHITE, 40 × 30 mm. The user reported that it worked. No additional test label was sent after this result appeared.
12. At the user's request, the same adapter was installed at `/Applications/NIIMBOT.app`. Its printer library hash exactly matches the library in the successful test copy. Both the adapted app and the unchanged original backup pass `codesign --verify --deep --strict`. The temporary app was closed to release the printer.
13. The normal installed NIIMBOT app then connected to the B1. Its accessibility tree shows the connected printer, its screenshot shows the green connection indicator, and its process path is `/Applications/NIIMBOT.app/Contents/MacOS/NIIMBOT`. The native SDK continues receiving Bluetooth status responses. No second print was sent by the agent; the successful label test used the identical adapted library in the temporary copy.

## Native interface used

The library uses C exports and C structs. This prototype changes only the ARM64 slice of two exports. The version hash fixes the file layout and function addresses.

- USB record: 21-byte key, 131-byte port field, 32-bit model ID. Total 156 bytes.
- Bluetooth record: 41-byte name, 23-byte secondary field, 32-bit type. Total 68 bytes.
- Discovery returns an allocated array and a count. The caller frees the array.
- Connection takes the record pointer and the app's status callback.
- Query and print calls select the connection by its string key.

The adapter uses the real Bluetooth name as the key in both paths. It limits the name to 20 bytes to fit the USB key. Discovery filters the `B1-` prefix; connection also checks the actual model response. It returns a connection error and closes the connection if that response is not exactly 4096.

Only the discovery and connection entry points change. The existing SDK handles the BLE service, packet protocol, print job, and status events.

## Test harness fixes

The first harness freed an SDK array before copying its bytes. `Buffer.from(ArrayBuffer)` shares that memory. The current harness explicitly copies a `Uint8Array` before it frees the array.

A null status callback also caused a crash when the SDK sent a cover-status event. The harness now supplies a live, thread-safe callback. The adapter passes the editor's callback through unchanged.

## Before a packaged release

- Check reconnect and disconnect from the app.
- Check scan calls from the app for overlap or repeated discovery while connected.
- Replace the misleading data-cable text in the separate copy after the connection path is proved.
- Review native exception/unwind metadata for the replaced function bodies before a release. The prototype retains the original unwind tables.
- Keep distribution source-only. Do not distribute a modified NIIMBOT app.

The user accepted the USB-labelled entry point as a shortcut to Bluetooth. They then asked for the same result in the original app, with a label test first. After the test, the adapter was installed in the normal app with a full original-app backup. The UI tool cannot press several custom image controls. The user completed those clicks, and the connected state was verified afterward.

The tested `flutter.printerName` preference was transferred from the temporary app to the normal app, with the old value recorded in the local helper directory. Startup did not automatically connect. Manual connection remains required; the project does not claim automatic reconnect support.

## References

- [NiimBlue Bluetooth implementation](https://github.com/MultiMote/niimbluelib/blob/main/src/client/bluetooth_impl.ts): an independent implementation of the BLE transport. It was read for comparison; its source was not copied into this project.
- The installed NIIMBOT library, app assets, disassembly, and local test logs are the primary evidence for this record. Vendor files and device logs are kept outside the source distribution.
