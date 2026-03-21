import type { BleTransport, PM5Data, PM5DeviceInfo, PM5EventMap } from './types.js';
type EventCallback<T> = (data: T) => void;
export declare class PM5 {
    private readonly transport;
    private _connected;
    private _deviceInfo;
    private _data;
    private readonly listeners;
    private _debugLog;
    constructor(transport: BleTransport);
    get connected(): boolean;
    get deviceInfo(): PM5DeviceInfo | null;
    get data(): Readonly<PM5Data>;
    /** Enable debug logging. Pass a function that receives (direction, message). */
    set debugLog(fn: ((direction: string, msg: string) => void) | null);
    /** Connect to a PM5 over BLE. */
    connect(): Promise<PM5DeviceInfo>;
    /** Disconnect from the PM5. */
    disconnect(): Promise<void>;
    on<K extends keyof PM5EventMap>(event: K, callback: EventCallback<PM5EventMap[K]>): void;
    off<K extends keyof PM5EventMap>(event: K, callback: EventCallback<PM5EventMap[K]>): void;
    /** Program a Just Row workout (no target, free rowing). */
    programJustRow(): Promise<void>;
    /** Program a single distance workout with splits. */
    programDistance(meters: number, splitMeters: number): Promise<void>;
    /** Program a single time workout with splits. */
    programTime(totalSeconds: number, splitSeconds: number): Promise<void>;
    /** Program a fixed distance interval workout. */
    programIntervalDistance(meters: number, restSeconds: number, count: number): Promise<void>;
    /** Program a fixed time interval workout. */
    programIntervalTime(workSeconds: number, restSeconds: number, count: number): Promise<void>;
    /** Send GOFINISHED to end the current workout. */
    endWorkout(): Promise<void>;
    /** Split a CSAFE frame into BLE_MTU-sized chunks and write sequentially. */
    private sendFrame;
    /** Send multiple CSAFE frames with inter-frame delay. */
    private sendFrames;
    private readDeviceInfo;
    private subscribeToNotifications;
    private emit;
    private handleDisconnect;
    private log;
}
export {};
//# sourceMappingURL=pm5.d.ts.map