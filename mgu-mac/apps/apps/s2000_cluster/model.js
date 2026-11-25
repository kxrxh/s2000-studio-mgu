'use strict';
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.S2000Model = factory();
}(typeof window !== 'undefined' ? window : this, function () {
    const MAX_RPM = 7000;
    const FRESH_MS = 1500;
    const OPTIONAL_MS = 10000;
    function number(n, min, max) { return typeof n === 'number' && isFinite(n) && n >= min && n <= max; }
    function wire(n, max, factor, offset) { return number(n, 0, max) ? n * factor + (offset || 0) : null; }
    function tach(rpm, redline) {
        return { fraction: number(rpm, 0, 20000) ? Math.min(rpm / MAX_RPM, 1) : 0,
            redFraction: (number(redline, 5000, 6500) ? redline : 6000) / MAX_RPM };
    }
    function gear(v) {
        const stage = { 1: 'P', 2: 'R', 3: 'N', P: 'P', R: 'R', N: 'N' }[v.statusActualStageDrive];
        if (stage) return stage;
        const raw = v.statusActualGearDrive;
        if (raw === 'R' || raw === 1) return 'R';
        if (number(raw, 3, 12)) return String(raw - 2);
        return /^G([1-9]|10)$/.test(String(raw)) ? String(raw).slice(1) : null;
    }
    class Vehicle {
        constructor() { this.fields = {}; }
        put(key, value, at) { this.fields[key] = { value: value, at: at }; }
        rpm(v, at) { this.put('rpm', wire(v && v.actualValueRPMEngineCrankshaft, 40000, 0.25), at); }
        speed(v, at) { this.put('speed', wire(v && v.speedVehicleCentreOfGravity, 25600, 1 / 64), at); }
        temperatures(v, at) {
            this.put('coolant', wire(v && v.temperatureEngineDrive, 254, 1, -48), at);
            this.put('oil', wire(v && v.temperatureEngineOilDrive, 254, 1, -48), at);
        }
        tank(v, at) {
            this.put('fuel', wire(v && v.fluidLevelFuelTank, 254, 1), at);
            this.put('odometer', wire(v && v.mileageKilometre, 16777214, 1), at);
        }
        gearbox(v, at) { this.put('gear', gear(v || {}), at); }
        snapshot(now) {
            const out = {};
            ['rpm', 'speed', 'coolant', 'oil', 'fuel', 'odometer', 'gear'].forEach((key) => {
                const f = this.fields[key], ttl = key === 'rpm' || key === 'speed' ? FRESH_MS : OPTIONAL_MS;
                out[key] = f && now >= f.at && now - f.at < ttl ? f.value : null;
            });
            out.expiresAt = Math.min(this.fields.rpm ? this.fields.rpm.at + FRESH_MS : 0,
                this.fields.speed ? this.fields.speed.at + FRESH_MS : 0);
            out.valid = out.rpm !== null && out.speed !== null;
            return out;
        }
    }
    return { Vehicle: Vehicle, tach: tach, gear: gear, number: number, MAX_RPM: MAX_RPM };
}));
