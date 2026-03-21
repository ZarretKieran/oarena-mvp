import type { BleTransport } from '../types.js';
export declare class WebBluetoothTransport implements BleTransport {
    private device;
    private server;
    private readonly services;
    private readonly chars;
    private disconnectCallback;
    connect(namePrefix: string, serviceUuids: readonly string[]): Promise<string>;
    disconnect(): Promise<void>;
    write(serviceUuid: string, charUuid: string, data: Uint8Array): Promise<void>;
    subscribe(serviceUuid: string, charUuid: string, callback: (data: DataView) => void): Promise<void>;
    readValue(serviceUuid: string, charUuid: string): Promise<DataView>;
    onDisconnect(callback: () => void): void;
    private getCharacteristic;
    private cleanup;
}
//# sourceMappingURL=web-bluetooth.d.ts.map