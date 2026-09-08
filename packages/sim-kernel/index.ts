/** Infrastructure only: no knowledge of vehicles, converters, tariffs or UI. */
export class Registry<T extends {
    type: string;
}> {
    private entries = new Map<string, T>();
    register(plugin: T) { if (this.entries.has(plugin.type))
        throw Error(`Duplicate plugin: ${plugin.type}`); this.entries.set(plugin.type, plugin); return this; }
    get(type: string): T { const plugin = this.entries.get(type); if (!plugin)
        throw Error(`Unknown plugin: ${type}`); return plugin; }
    list() { return [...this.entries.values()]; }
}
export class SeededRandom {
    private state: number;
    constructor(seed: number) { this.state = seed >>> 0; }
    next() { this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0; return this.state / 4294967296; }
}
export interface ScheduledEvent<T> {
    time: number;
    sequence: number;
    payload: T;
}
export class EventQueue<T> {
    private events: ScheduledEvent<T>[] = [];
    private sequence = 0;
    schedule(time: number, payload: T) { if (!Number.isFinite(time) || time < 0)
        throw Error('Invalid event time'); this.events.push({ time, sequence: this.sequence++, payload }); this.events.sort((a, b) => a.time - b.time || a.sequence - b.sequence); }
    nextTime() { return this.events[0]?.time ?? Infinity; }
    takeThrough(time: number) { const result: ScheduledEvent<T>[] = []; while (this.events.length && this.events[0].time <= time + 1e-9)
        result.push(this.events.shift()!); return result; }
}
export class SimulationClock {
    now = 0;
    advance(to: number) { if (to < this.now || !Number.isFinite(to))
        throw Error('Clock must advance monotonically'); this.now = to; }
}
