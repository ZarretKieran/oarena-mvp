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
    readonly SETUSERCFG1_CMD: 26;
    readonly SETPMCFG_CMD: 118;
    readonly SETPMDATA_CMD: 119;
    readonly GETPMCFG_CMD: 126;
    readonly GETPMDATA_CMD: 127;
    readonly GOINUSE_CMD: 133;
    readonly GOFINISHED_CMD: 134;
    readonly GOREADY_CMD: 135;
};
/** PM5 proprietary sub-command codes (used inside SETPMCFG_CMD 0x76 wrapper) */
export declare const PM: {
    readonly SET_WORKOUTTYPE: 1;
    readonly SET_RACETYPE: 9;
    readonly SET_RACESTARTPARAMS: 13;
    readonly SET_WORKOUTDURATION: 3;
    readonly SET_RESTDURATION: 4;
    readonly SET_SPLITDURATION: 5;
    readonly SET_SCREENSTATE: 19;
    readonly CONFIGURE_WORKOUT: 20;
    readonly SET_INTERVALTYPE: 23;
    readonly SET_INTERVALCOUNT: 24;
    readonly SET_RACEOPERATIONTYPE: 30;
};
export declare const PM_GET_CFG: {
    readonly SCREEN_STATE_STATUS: 133;
};
export declare const PM_GET_DATA: {
    readonly WORKOUT_TYPE: 137;
    readonly WORKOUT_STATE: 141;
    readonly STROKE_PACE_500M: 168;
    readonly AVG_PACE_500M: 175;
    readonly STROKE_RATE: 179;
    readonly STROKE_STATE: 191;
    readonly DRAG_FACTOR: 193;
    readonly ERROR_VALUE: 201;
    readonly RACE_DATA: 198;
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
export declare const SCREEN_TYPE: {
    readonly NONE: 0;
    readonly WORKOUT: 1;
    readonly RACE: 2;
    readonly CSAFE: 3;
};
export declare const SCREEN_VALUE_WORKOUT: {
    readonly NONE: 0;
    readonly PREPARE_TO_ROW: 1;
    readonly TERMINATE_WORKOUT: 2;
    readonly REARM_WORKOUT: 3;
    readonly PREPARE_TO_RACE_START: 5;
    readonly GO_TO_MAIN_SCREEN: 6;
};
export declare const SCREEN_VALUE_RACE: {
    readonly NONE: 0;
    readonly WARMUP_FOR_RACE: 3;
    readonly PREPARE_TO_RACE: 4;
    readonly FALSE_START_RACE: 5;
    readonly TERMINATE_RACE: 6;
    readonly SET_PARTICIPANT_LIST: 8;
    readonly SYNC_RACE_TIME: 9;
    readonly RACE_IDLE: 13;
};
export declare const START_TYPE: {
    readonly RANDOM: 0;
    readonly COUNTDOWN: 1;
    readonly RANDOM_MODIFIED: 2;
    readonly IMMEDIATE: 3;
    readonly WAIT_FOR_FLYWHEEL: 4;
};
export declare const RACE_TYPE: {
    readonly FIXED_DISTANCE_SINGLE: 0;
    readonly FIXED_TIME_SINGLE: 1;
    readonly WORKOUT_RACE_START: 4;
    readonly FIXED_CAL_SINGLE: 5;
};
export declare const RACE_OPERATION: {
    readonly DISABLE: 0;
    readonly PARTICIPATION_REQUEST: 1;
    readonly SLEEP: 2;
    readonly ERG_INIT: 3;
    readonly PHY_ADDR_INIT: 4;
    readonly RACE_WARMUP: 5;
    readonly RACE_INIT: 6;
    readonly TIME_SYNC: 7;
    readonly RACE_WAIT_TO_START: 8;
    readonly START: 9;
    readonly FALSE_START: 10;
    readonly TERMINATE: 11;
    readonly IDLE: 12;
};
export declare const SCREEN_STATUS: {
    readonly INACTIVE: 0;
    readonly PENDING: 1;
    readonly IN_PROGRESS: 2;
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