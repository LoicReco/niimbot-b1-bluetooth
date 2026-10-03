// Small encoder for the two adapter functions. All offsets are byte offsets.
export class Arm64 {
  words: number[] = [];
  labels = new Map<string, number>();
  fixups: { index: number; target: string; opcode: number; bits: number; shift: number }[] = [];
  constructor(readonly base: number) {}
  emit(word: number) { this.words.push(word >>> 0); }
  label(name: string) { this.labels.set(name, this.words.length * 4); }
  mov(d: number, s: number) { this.emit(0xaa0003e0 | (s << 16) | d); }
  imm(d: number, value: number) {
    if (value < 0 || value > 65535) throw new Error("Immediate out of range");
    this.emit(0xd2800000 | (value << 5) | d);
  }
  add(d: number, s: number, n: number) { this.emit(0x91000000 | (n << 10) | (s << 5) | d); }
  sub(d: number, s: number, n: number) { this.emit(0xd1000000 | (n << 10) | (s << 5) | d); }
  ldr(d: number, s: number, offset = 0, width = 8) {
    const opcode = { 8: 0xf9400000, 4: 0xb9400000, 2: 0x79400000, 1: 0x39400000 }[width];
    if (opcode === undefined || offset % width) throw new Error("Bad load");
    this.emit(opcode | ((offset / width) << 10) | (s << 5) | d);
  }
  str(d: number, s: number, offset = 0, width = 8) {
    const opcode = { 8: 0xf9000000, 4: 0xb9000000, 1: 0x39000000 }[width];
    if (opcode === undefined || offset % width) throw new Error("Bad store");
    this.emit(opcode | ((offset / width) << 10) | (s << 5) | d);
  }
  cmp(a: number, b: number) { this.emit(0xeb00001f | (b << 16) | (a << 5)); }
  cmpImm(a: number, n: number) { this.emit(0xf100001f | (n << 10) | (a << 5)); }
  branch(target: string, condition?: number) {
    const opcode = condition === undefined ? 0x14000000 : 0x54000000 | condition;
    this.fixups.push({ index: this.words.length, target, opcode, bits: condition === undefined ? 26 : 19, shift: condition === undefined ? 0 : 5 });
    this.emit(opcode);
  }
  cbz(r: number, target: string) {
    this.fixups.push({ index: this.words.length, target, opcode: 0xb4000000 | r, bits: 19, shift: 5 });
    this.emit(0);
  }
  call(target: number) {
    const delta = (target - this.base - this.words.length * 4) / 4;
    if (!Number.isInteger(delta) || Math.abs(delta) >= 2 ** 25) throw new Error("Call out of range");
    this.emit(0x94000000 | (delta & 0x3ffffff));
  }
  enter(size: number, saved: number[]) {
    this.sub(31, 31, size);
    saved.forEach((r, i) => this.str(r, 31, i * 8));
  }
  leave(size: number, saved: number[]) {
    saved.forEach((r, i) => this.ldr(r, 31, i * 8));
    this.add(31, 31, size);
    this.emit(0xd65f03c0);
  }
  finish(maxSize: number) {
    for (const f of this.fixups) {
      const target = this.labels.get(f.target);
      if (target === undefined) throw new Error(`Unknown label ${f.target}`);
      const delta = (target - f.index * 4) / 4;
      if (Math.abs(delta) >= 2 ** (f.bits - 1)) throw new Error("Branch out of range");
      this.words[f.index] = (f.opcode | ((delta & (2 ** f.bits - 1)) << f.shift)) >>> 0;
    }
    if (this.words.length * 4 > maxSize) throw new Error("Adapter too large");
    const bytes = Buffer.alloc(this.words.length * 4);
    this.words.forEach((word, i) => bytes.writeUInt32LE(word, i * 4));
    return bytes;
  }
}
