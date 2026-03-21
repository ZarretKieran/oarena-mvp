// Web Bluetooth adapter — reference BleTransport implementation for browsers.
// Requires Chrome or Edge with Web Bluetooth support.
export class WebBluetoothTransport {
    constructor() {
        this.device = null;
        this.server = null;
        this.services = new Map();
        this.chars = new Map();
        this.disconnectCallback = null;
    }
    async connect(namePrefix, serviceUuids) {
        if (!navigator.bluetooth) {
            throw new Error('Web Bluetooth not supported. Use Chrome or Edge.');
        }
        this.device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix }],
            optionalServices: [...serviceUuids],
        });
        this.device.addEventListener('gattserverdisconnected', () => {
            this.cleanup();
            this.disconnectCallback?.();
        });
        const server = this.device.gatt;
        if (!server)
            throw new Error('No GATT server on device');
        this.server = await server.connect();
        // Pre-cache all requested services
        for (const uuid of serviceUuids) {
            try {
                const svc = await this.server.getPrimaryService(uuid);
                this.services.set(uuid, svc);
            }
            catch {
                // Service may not exist on all firmware versions
            }
        }
        return this.device.name ?? 'Unknown PM5';
    }
    async disconnect() {
        if (this.server?.connected) {
            this.server.disconnect();
        }
        this.cleanup();
    }
    async write(serviceUuid, charUuid, data) {
        const char = await this.getCharacteristic(serviceUuid, charUuid);
        await char.writeValue(data);
    }
    async subscribe(serviceUuid, charUuid, callback) {
        const char = await this.getCharacteristic(serviceUuid, charUuid);
        await char.startNotifications();
        char.addEventListener('characteristicvaluechanged', (e) => {
            const target = e.target;
            if (target.value)
                callback(target.value);
        });
    }
    async readValue(serviceUuid, charUuid) {
        const char = await this.getCharacteristic(serviceUuid, charUuid);
        return char.readValue();
    }
    onDisconnect(callback) {
        this.disconnectCallback = callback;
    }
    // ---------------------------------------------------------------------------
    // Private
    // ---------------------------------------------------------------------------
    async getCharacteristic(serviceUuid, charUuid) {
        const key = `${serviceUuid}:${charUuid}`;
        const cached = this.chars.get(key);
        if (cached)
            return cached;
        const service = this.services.get(serviceUuid);
        if (!service)
            throw new Error(`Service not found: ${serviceUuid}`);
        const char = await service.getCharacteristic(charUuid);
        this.chars.set(key, char);
        return char;
    }
    cleanup() {
        this.server = null;
        this.device = null;
        this.services.clear();
        this.chars.clear();
    }
}
//# sourceMappingURL=web-bluetooth.js.map