'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const { setTimeout: delay } = require('node:timers/promises');

const entry = path.resolve(process.argv[2], 'app.js');
assert.ok(fs.existsSync(entry), 'the Studio cluster has a packaged OAP entry point');

function event(socket, message) {
    const json = Buffer.from(JSON.stringify(message));
    const header = Buffer.alloc(5);
    header.writeUInt32LE(json.length + 1);
    header[4] = 74;
    socket.write(Buffer.concat([header, json]));
}

async function until(check, description) {
    const end = Date.now() + 8000;
    while (!check() && Date.now() < end) await delay(25);
    assert.ok(check(), description);
}

async function test() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's2000-app-'));
    const socket = path.join(dir, 'render.sock');
    const connections = [];
    const server = net.createServer((peer) => {
        const connection = { peer, packets: [], closed: false };
        connections.push(connection);
        peer.on('close', () => { connection.closed = true; });
        let pending = Buffer.alloc(0);
        peer.on('data', (data) => {
            pending = Buffer.concat([pending, data]);
            while (pending.length >= 5 && pending.length >= pending.readUInt32LE() + 4) {
                const end = pending.readUInt32LE() + 4;
                if (pending[4] === 74) {
                    const msg = JSON.parse(pending.toString('utf8', 5, end));
                    connection.packets.push(msg);
                    if (msg.op === 'hello') event(peer, {
                        ev: 'hello', proto: 1, backend: 'idrive7', targets: 'panel:1920x720'
                    });
                }
                pending = pending.subarray(end);
            }
        });
    });
    await new Promise((resolve) => server.listen(socket, resolve));
    const actions = {}, fields = {}, app = new EventEmitter();
    const load = createRequire(entry);
    let spec, feed;
    try {
        const { Clusters } = load('./controller');
        vm.runInNewContext(fs.readFileSync(entry, 'utf8'), {
            require(name) {
                if (name === './kit/mgu') return { run: (value) => { spec = value; } };
                if (name === './controller') return { Clusters: class extends Clusters { constructor() { super(socket); } } };
                return load(name);
            },
            setInterval, clearInterval
        }, { filename: entry });
        await spec.start({ app, log: console, ui: {
            onClick: (id, fn) => { actions[id] = fn; }, text: () => {}
        }, signals: { watch: async (_iface, _instance, handlers) => { Object.assign(fields, handlers); return {}; } } });
        assert.equal(connections.length, 0, 'loading the app leaves the factory display alone');
        actions.BTN_ENABLE();
        await until(() => connections[0] && connections[0].packets.some((p) => p.op === 'hello'), 'Start connects');
        const first = connections[0];
        assert.equal(first.packets.find((p) => p.op === 'hello').app, 's2000_idv7');
        await delay(150);
        assert.ok(!first.packets.some((p) => p.op === 'layer'), 'waiting for telemetry creates no layers');

        const sendSignals = () => {
            fields.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 24000 });
            fields.statusCarSpeed2({ speedVehicleCentreOfGravity: 6400 });
            fields.statusEngineTemperature({ temperatureEngineDrive: 142, temperatureEngineOilDrive: 151 });
            fields.statusRangeTankStatus({ fluidLevelFuelTank: 42, mileageKilometre: 48123 });
        };
        fields.VehicleCondition({ statusConditionVehicle: 10 });
        sendSignals();
        feed = setInterval(sendSignals, 100);
        const layers = (c) => c.packets.filter((p) => p.op === 'layer');
        const allDropped = (c) => layers(c).every((layer) => c.packets.some((p) => p.op === 'drop' && p.ref === layer.ref));
        await until(() => layers(first).length === 30, 'the compiled layout and its bottom-strip band reach the renderer');
        assert.ok(layers(first).every((p) => p.h < 720), 'no full-height layer covers the factory strip');
        assert.ok(layers(first).some((p) => p.kind === 'image'), 'the compiled drawings are uploaded as image layers');

        actions.BTN_DISABLE();
        await until(() => first.closed, 'Stop closes the renderer session');
        assert.ok(allDropped(first), 'Stop releases every compiled layer');

        actions.BTN_ENABLE();
        await until(() => connections[1] && layers(connections[1]).length === 30, 'Start can re-enable the layout');
        clearInterval(feed);
        await until(() => allDropped(connections[1]), 'stale RPM or speed releases all layers without another button press');

        feed = setInterval(sendSignals, 100);
        await until(() => layers(connections[1]).length === 60, 'fresh data can restore an explicitly enabled layout');
        fields.VehicleCondition({ statusConditionVehicle: 12 });
        await until(() => allDropped(connections[1]), 'switching the car off releases the custom layers');
        fields.VehicleCondition({ statusConditionVehicle: 10 });
        await until(() => layers(connections[1]).length === 90, 'the renderer settles again after a power transition');
        event(connections[1].peer, { ev: 'error', op: 'layer', ref: 999, reason: 'test rejection' });
        await until(() => connections[1].closed, 'a renderer refusal closes the session');
        assert.ok(allDropped(connections[1]), 'a renderer refusal removes the full custom display');
        await delay(150);
        assert.equal(connections.length, 2, 'a renderer refusal does not enable a new session automatically');
        console.log('Studio app: menu Start/Stop, compiled layers, stale data, power transitions, and renderer refusal pass');
    } finally {
        clearInterval(feed);
        app.emit('shutdown');
        connections.forEach((c) => c.peer.destroy());
        await new Promise((resolve) => server.close(resolve));
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test().catch((error) => { console.error(error); process.exitCode = 1; });
