// CSAFE frame builder — checksum, byte stuffing, frame construction.
// Pure functions with no platform dependencies.
import { FRAME, CSAFE } from './constants.js';
/** XOR checksum of all bytes in the array. */
export function xorChecksum(bytes) {
    let cs = 0;
    for (let i = 0; i < bytes.length; i++)
        cs ^= bytes[i];
    return cs;
}
/** Append a byte to arr, applying CSAFE byte stuffing if 0xF0-0xF3. */
export function stuffByte(arr, b) {
    if (b >= 0xF0 && b <= 0xF3) {
        arr.push(FRAME.STUFF);
        arr.push(b - 0xF0);
    }
    else {
        arr.push(b);
    }
}
/**
 * Build a complete CSAFE frame from raw payload bytes.
 *
 * Frame format: [0xF1] [stuffed payload] [stuffed checksum] [0xF2]
 * - Checksum = XOR of all raw (pre-stuffing) payload bytes
 * - Byte stuffing: any byte 0xF0-0xF3 becomes [0xF3, byte - 0xF0]
 */
export function buildCsafeFrame(payload) {
    const checksum = xorChecksum(payload);
    const stuffed = [];
    for (let i = 0; i < payload.length; i++) {
        stuffByte(stuffed, payload[i]);
    }
    stuffByte(stuffed, checksum);
    return new Uint8Array([FRAME.START, ...stuffed, FRAME.END]);
}
/** Encode a 32-bit value as 4 bytes, big-endian (MSB first). Used for CSAFE command data. */
export function bigEndian32(v) {
    return [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
}
/** Encode a 16-bit value as 2 bytes, big-endian (MSB first). Used for CSAFE command data. */
export function bigEndian16(v) {
    return [(v >>> 8) & 0xFF, v & 0xFF];
}
/** Encode a 16-bit value as 2 bytes, little-endian (LSB first). */
export function lowEndian16(v) {
    return [v & 0xFF, (v >>> 8) & 0xFF];
}
/**
 * Build a SETPMCFG_CMD (0x76) payload containing one or more proprietary sub-commands.
 *
 * Output format: [0x76, total_inner_length, sub_cmd_1, data_len_1, data_1..., sub_cmd_2, ...]
 *
 * @param subCommands - Array of {cmd, data} objects
 * @returns Raw payload bytes (not yet wrapped in a CSAFE frame)
 */
export function buildPmCfgPayload(subCommands) {
    const inner = [];
    for (const sc of subCommands) {
        inner.push(sc.cmd);
        inner.push(sc.data.length);
        inner.push(...sc.data);
    }
    return [CSAFE.SETPMCFG_CMD, inner.length, ...inner];
}
/**
 * Build a standard CSAFE long command.
 *
 * Output format: [cmd, data_length, ...data]
 *
 * @param cmd - CSAFE command code (e.g. CSAFE.SETHORIZONTAL_CMD)
 * @param data - Command data bytes
 */
export function buildLongCommand(cmd, data) {
    return [cmd, data.length, ...data];
}
/** Convert a byte array or Uint8Array to a hex string for debug logging. */
export function bytesToHex(arr) {
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join(' ');
}
//# sourceMappingURL=csafe.js.map