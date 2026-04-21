import type { CsafeCommand, CsafeCommandResponse, CsafeFrameResponse, PmSubCommand } from './types.js';
/** XOR checksum of all bytes in the array. */
export declare function xorChecksum(bytes: readonly number[]): number;
/** Append a byte to arr, applying CSAFE byte stuffing if 0xF0-0xF3. */
export declare function stuffByte(arr: number[], b: number): void;
/**
 * Build a complete CSAFE frame from raw payload bytes.
 *
 * Frame format: [0xF1] [stuffed payload] [stuffed checksum] [0xF2]
 * - Checksum = XOR of all raw (pre-stuffing) payload bytes
 * - Byte stuffing: any byte 0xF0-0xF3 becomes [0xF3, byte - 0xF0]
 */
export declare function buildCsafeFrame(payload: readonly number[]): Uint8Array;
/** Encode a 32-bit value as 4 bytes, big-endian (MSB first). Used for CSAFE command data. */
export declare function bigEndian32(v: number): readonly number[];
/** Encode a 16-bit value as 2 bytes, big-endian (MSB first). Used for CSAFE command data. */
export declare function bigEndian16(v: number): readonly number[];
/** Encode a 16-bit value as 2 bytes, little-endian (LSB first). */
export declare function lowEndian16(v: number): readonly number[];
/**
 * Build a SETPMCFG_CMD (0x76) payload containing one or more proprietary sub-commands.
 *
 * Output format: [0x76, total_inner_length, sub_cmd_1, data_len_1, data_1..., sub_cmd_2, ...]
 *
 * @param subCommands - Array of {cmd, data} objects
 * @returns Raw payload bytes (not yet wrapped in a CSAFE frame)
 */
export declare function buildPmCfgPayload(subCommands: readonly PmSubCommand[]): readonly number[];
/** Build a PM proprietary wrapper payload such as GETPMCFG / GETPMDATA / SETPMDATA. */
export declare function buildPmWrapperPayload(wrapper: number, commands: readonly CsafeCommand[]): readonly number[];
/**
 * Build a standard CSAFE long command.
 *
 * Output format: [cmd, data_length, ...data]
 *
 * @param cmd - CSAFE command code (e.g. CSAFE.SETHORIZONTAL_CMD)
 * @param data - Command data bytes
 */
export declare function buildLongCommand(cmd: number, data: readonly number[]): readonly number[];
/** Convert a byte array or Uint8Array to a hex string for debug logging. */
export declare function bytesToHex(arr: Uint8Array | readonly number[]): string;
/** Undo CSAFE byte stuffing on frame contents (without start/stop bytes). */
export declare function unstuffBytes(arr: Uint8Array): Uint8Array;
/** Parse command responses from the body after the CSAFE status byte. */
export declare function parseCommandResponses(arr: Uint8Array): readonly CsafeCommandResponse[];
/** Parse a full CSAFE response frame received from the PM. */
export declare function parseCsafeFrame(frame: Uint8Array): CsafeFrameResponse;
//# sourceMappingURL=csafe.d.ts.map