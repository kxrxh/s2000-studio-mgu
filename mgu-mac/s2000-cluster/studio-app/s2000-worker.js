'use strict';

const fs = require('fs');
const path = require('path');
const { ClusterRender } = require('./cluster_render_client');
const { ClusterEngine, SETTLE_MS, STRIP_Y, targetSize } = require('./engine');
const { number } = require('./model');
const theme = require('./s2000-theme');
const metrics = require('./font_display');

const renderer = new ClusterRender('s2000_idv7', process.argv[2]);
const signalFields = {
    'engine.rpm': 'rpm', 'vehicle.speed': 'speed', 'engine.coolant.temp': 'coolant',
    'engine.oil.temp': 'oil', 'fuel.volume': 'fuel', 'vehicle.odometer': 'odometer'
};
const files = new Map(theme.images.map((image) => [image.file, fs.readFileSync(path.join(__dirname, image.file))]));
let state, received = 0, closing = false, lastStatus;

function live() {
    const now = Date.now();
    return renderer.ready && !!state && now >= received && now - received < 1000 && state.valid === true &&
        number(state.expiresAt, now + 1, now + 1500) && number(state.rpm, 0, 10000) && number(state.speed, 0, 400);
}

const engine = new ClusterEngine({
    client: renderer,
    theme,
    fonts: { display: { metrics, pixels: fs.readFileSync(path.join(__dirname, 'font_display.wad')) } },
    signals: { get(id) {
        const value = state && state[signalFields[id]];
        return Number.isFinite(value) ? { value, at: received, valid: true } : undefined;
    } },
    enabled: live,
    live,
    hold() {
        if (!state) return 'wait';
        if (state.conditionKnown === false || state.condition === 8) return 'wait';
        return state.condition <= 5 || state.condition === 12 ? 'drop' : null;
    },
    settleMs: SETTLE_MS,
    stripY: () => STRIP_Y,
    sweep: () => false,
    utcOffsetMinutes: () => -new Date().getTimezoneOffset(),
    loadImage: (image) => files.get(image.file)
});

function report(status) {
    if (!process.connected || status === lastStatus) return;
    lastStatus = status;
    process.send({ status }, () => {});
}

function stop(code) {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    engine.stop();
    renderer.close();
    process.exitCode = code;
    if (process.connected) process.disconnect();
}

function fail(reason) {
    if (closing) return;
    console.warn('S2000 renderer stopped: ' + reason);
    stop(1);
}

function tick() {
    try {
        engine.tick();
        const status = engine.status();
        if (status.failed) return fail('the compiled layout could not be built');
        report(status.shown ? 'Приборка включена' :
            renderer.ready ? 'Ожидание стабильных данных' : 'Ожидание cluster-render');
    } catch (error) {
        fail(error);
    }
}

process.on('message', (message) => {
    state = message && message.enabled ? message.state : null;
    received = Date.now();
});
process.on('disconnect', () => stop(0));
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));
renderer.on('ready', () => {
    const panel = targetSize(renderer.targets, 'panel');
    if (!panel || panel.w !== theme.target.width || panel.h !== theme.target.height) fail('missing 1920×720 panel target');
});
renderer.on('refused', (op, ref, reason) => fail(op + ' ' + ref + ': ' + reason));
renderer.on('layer', (ref, status, reason) => { if (status === 'error') fail('layer ' + ref + ': ' + reason); });
renderer.on('target', (name, status, holder, reason, guarded, disabled) => {
    if (name === 'panel' && (guarded || disabled)) fail(reason || status);
});
renderer.on('disconnected', () => fail('renderer disconnected'));

const timer = setInterval(tick, 1000 / 60);
renderer.connect();
