import { reconstruct } from './reconstruct.ts';
import type { ReconstructionOutcome } from './reconstruct.ts';
import type { PendingReconstruction } from './types.ts';

/**
 * Above this many proofs the reconstruction moves to a worker: the message
 * round-trip costs more than the computation below it, and the interface
 * freezes visibly above it (5 000 commits take about 0.6 s).
 */
export const WORKER_THRESHOLD = 2_000;

export function shouldUseWorker(proofCount: number): boolean {
  return proofCount >= WORKER_THRESHOLD && typeof Worker !== 'undefined';
}

/** Runs the reconstruction in a worker when it pays off, synchronously otherwise. */
export function reconstructAsync(request: PendingReconstruction): Promise<ReconstructionOutcome> {
  if (!shouldUseWorker(request.evidence.length)) {
    return Promise.resolve(
      reconstruct(request.evidence, request.clients, request.settings, request.previousBlocks, request.corrections),
    );
  }
  return new Promise<ReconstructionOutcome>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./reconstruct.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(
        reconstruct(request.evidence, request.clients, request.settings, request.previousBlocks, request.corrections),
      );
      return;
    }
    worker.onmessage = (event: MessageEvent<ReconstructionOutcome>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (error) => {
      worker.terminate();
      reject(new Error(error.message || 'reconstruction worker failed'));
    };
    worker.postMessage(request);
  });
}
