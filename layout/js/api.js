// api.js - Wraps Eel calls

export const API = {
    async getSerialStatus() {
        if (!window.eel) return false;
        return await window.eel.py_serial_online()();
    },

    async listSerialPorts() {
        if (!window.eel) return [];
        return await window.eel.py_list_ports()();
    },

    async startSerial(portName) {
        if (!window.eel) return;
        await window.eel.py_serial_startup(portName)();
    },

    async homing() {
        if (!window.eel) return;
        await window.eel.py_homing_cmd()();
    },

    async sendData(settings) {
        // settings: optional override for backend (limits, sizes)
        if (!window.eel) return;
        return await window.eel.py_get_data(settings)();
    },

    async generateText(text, options, settings) {
        if (!window.eel) return [];
        return await window.eel.py_generate_text(text, options, settings)();
    },

    async validateText(text, options, settings) {
        if (!window.eel) return { valid: false, message: "API Error" };
        return await window.eel.py_validate_text(text, options, settings)();
    },

    async clearState() {
        if (!window.eel) return false;
        return await window.eel.py_clear_state()();
    },

    async stopTrajectory() {
        if (!window.eel) return false;
        return await window.eel.py_stop_trajectory()();
    },

    async computeTrajectory(settings) {
        if (!window.eel) return null;
        return await window.eel.py_compute_trajectory(settings)();
    },

    async getConfig() {
        if (!window.eel) return null;
        return await window.eel.py_get_config()();
    },

    // Setup callbacks that Python calls
    initCallbacks(callbacks) {
        if (!window.eel) {
            console.warn("Eel not initialized (mock mode?)");
            return;
        }

        window.js_log = (msg) => {
            console.log("[PY]", msg);
            if (callbacks.onLog) callbacks.onLog(msg);
        };

        window.js_draw_pose = (q, penup) => {
            if (callbacks.onDrawPose) callbacks.onDrawPose(q, penup);
        };

        window.js_draw_traces = (points) => {
            if (callbacks.onDrawTraces) callbacks.onDrawTraces(points);
        }

        // This is complex: Python calls this to GET data.
        // It expects a synchronous return of the data.
        window.js_get_data = () => {
            if (callbacks.onGetData) return callbacks.onGetData();
            return [];
        };

        // Explicitly expose them to Eel
        window.eel.expose(window.js_log, 'js_log');
        window.eel.expose(window.js_draw_pose, 'js_draw_pose');
        window.eel.expose(window.js_draw_traces, 'js_draw_traces');
        window.eel.expose(window.js_get_data, 'js_get_data');
    }
};
