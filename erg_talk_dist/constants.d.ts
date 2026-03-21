export declare const UUID_BASE = "-43e5-11e4-916c-0800200c9a66";
export declare function svcUuid(id: string): string;
/** BLE GATT Service UUIDs */
export declare const SVC: {
    readonly INFO: string;
    readonly CONTROL: string;
    readonly ROWING: string;
};
/** BLE GATT Characteristic UUIDs */
export declare const CHR: {
    readonly MODEL: string;
    readonly SERIAL: string;
    readonly HW_REV: string;
    readonly FW_VER: string;
    readonly MFG_NAME: string;
    readonly TX: string;
    readonly RX: string;
    readonly GENERAL_STATUS: string;
    readonly ADDITIONAL_STATUS: string;
    readonly STROKE_DATA: string;
    readonly SPLIT_DATA: string;
};
/** CSAFE frame delimiters */
export declare const FRAME: {
    readonly START: 241;
    readonly END: 242;
    readonly STUFF: 243;
};
/** Standard CSAFE command codes */
export declare const CSAFE: {
    readonly SETTWORK_CMD: 32;
    readonly SETHORIZONTAL_CMD: 33;
    readonly SETPROGRAM_CMD: 36;
    readonly SETPMCFG_CMD: 118;
    readonly GOINUSE_CMD: 133;
    readonly GOFINISHED_CMD: 134;
    readonly GOREADY_CMD: 135;
};
/** PM5 proprietary sub-command codes (used inside SETPMCFG_CMD 0x76 wrapper) */
export declare const PM: {
    readonly SET_WORKOUTTYPE: 1;
    readonly SET_WORKOUTDURATION: 3;
    readonly SET_RESTDURATION: 4;
    readonly SET_SPLITDURATION: 5;
    readonly SET_SCREENSTATE: 19;
    readonly CONFIGURE_WORKOUT: 20;
    readonly SET_INTERVALTYPE: 23;
    readonly SET_INTERVALCOUNT: 24;
};
/** Workout type values for PM.SET_WORKOUTTYPE */
export declare const WORKOUT_TYPE: {
    readonly JUST_ROW_NO_SPLITS: 0;
    readonly JUST_ROW_SPLITS: 1;
    readonly FIXED_DIST_NO_SPLIT: 2;
    readonly FIXED_DIST_SPLITS: 3;
    readonly FIXED_TIME_NO_SPLIT: 4;
    readonly FIXED_TIME_SPLITS: 5;
    readonly FIXED_TIME_INTERVAL: 6;
    readonly FIXED_DIST_INTERVAL: 7;
};
/** Duration type byte: first byte of SET_WORKOUTDURATION / SET_SPLITDURATION data */
export declare const DUR_TYPE: {
    readonly TIME: 0;
    readonly DISTANCE: 128;
};
/** CSAFE unit code for meters */
export declare const UNIT_METER = 36;
/** Human-readable labels for workout_state values from General Status notifications */
export declare const WORKOUT_STATE_LABELS: Record<number, string>;
/** BLE MTU for PM5 — maximum bytes per single BLE write */
export declare const BLE_MTU = 20;
/** Recommended inter-frame delay in milliseconds (spec minimum is 50ms) */
export declare const FRAME_DELAY_MS = 100;
//# sourceMappingURL=constants.d.ts.map