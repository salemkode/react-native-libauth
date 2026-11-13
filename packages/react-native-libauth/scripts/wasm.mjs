/** Drop non-executable metadata rejected by modern WABT (old Rust linking v3).
 * All standard sections, including code, data, imports and exports, stay intact.
 */
export function stripCustomSections(bytes) {
  const cursor = { offset: 8 };
  const sections = [bytes.subarray(0, 8)];
  while (cursor.offset < bytes.length) {
    const start = cursor.offset;
    const id = bytes[cursor.offset++];
    const size = { value: 0, shift: 0 };
    do {
      if (cursor.offset >= bytes.length || size.shift > 28) throw new Error('Invalid WASM section length.');
      const byte = bytes[cursor.offset++];
      size.value += (byte & 0x7f) * 2 ** size.shift;
      size.shift += 7;
      if ((byte & 0x80) === 0) break;
    } while (true);
    cursor.offset += size.value;
    if (cursor.offset > bytes.length) throw new Error('Truncated WASM section.');
    if (id !== 0) sections.push(bytes.subarray(start, cursor.offset));
  }
  return Buffer.concat(sections);
}
