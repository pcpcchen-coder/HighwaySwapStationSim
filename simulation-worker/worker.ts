/// <reference lib="webworker" />
import { simulate } from '../packages/station-engine/index.ts';
import type { Project } from '../packages/contracts/index.ts';
self.onmessage = (event: MessageEvent<{
    id: number;
    project: Project;
}>) => { try {
    self.postMessage({ id: event.data.id, result: simulate(event.data.project) });
}
catch (error) {
    self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) });
} };
