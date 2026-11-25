'use strict';

const mgu = require('./kit/mgu');
const Car = require('./kit/car');
const { Clusters } = require('./controller');
const { Vehicle } = require('./model');

mgu.run({
    async start(ctx) {
        const car = new Vehicle();
        const cluster = new Clusters();
        let condition, conditionKnown, lastText;

        function refresh() {
            const state = car.snapshot(Date.now());
            state.condition = condition;
            state.conditionKnown = conditionKnown;
            cluster.update(state, { style: 's2000' });
            const status = cluster.enabled && !state.valid ? 'Ожидание RPM и скорости' : cluster.status;
            if (status === lastText) return;
            lastText = status;
            Promise.resolve(ctx.ui.text('STATUS', status)).catch((error) => ctx.log.warn(String(error)));
        }

        ctx.ui.onClick('BTN_ENABLE', () => { cluster.enable(); refresh(); });
        ctx.ui.onClick('BTN_DISABLE', () => { cluster.disable(); refresh(); });

        const subscriptions = [
            ['de.bmw.infotainment.vehicle.CDS', {
                statusEngineSpeed2: (value) => car.rpm(value, Date.now()),
                statusEngineTemperature: (value) => car.temperatures(value, Date.now())
            }, 250],
            ['de.bmw.infotainment.vehicle.Vehicle2', {
                statusCarSpeed2: (value) => car.speed(value, Date.now())
            }, 250],
            ['de.bmw.infotainment.KombiIF', {
                statusRangeTankStatus: (value) => car.tank(value, Date.now())
            }, 1000],
            ['de.bmw.infrastructure.VehicleCondition', {
                VehicleCondition: (value) => {
                    if (!value || value.statusConditionVehicle == null) return;
                    condition = Car.conditionOf(value.statusConditionVehicle);
                    conditionKnown = condition !== undefined;
                }
            }, 0]
        ];
        subscriptions.forEach(([iface, handlers, pollMs]) => {
            ctx.signals.watch(iface, '1', handlers, ctx.log, { pollMs }).then((subscription) => {
                if (subscription.error) ctx.log.warn(iface + ': ' + subscription.error);
            }).catch((error) => ctx.log.warn(iface + ': ' + error));
        });

        refresh();
        const timer = setInterval(refresh, 100);
        ctx.app.on('shutdown', () => { clearInterval(timer); cluster.close(); });
    }
});
