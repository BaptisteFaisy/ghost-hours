/// <reference lib="webworker" />
import { reconstruct } from './reconstruct.ts';
import type { PendingReconstruction } from './types.ts';

/**
 * Reconstruction off the main thread (idea R-01).
 *
 * `sessionize` is a pure function, so moving it to a worker changes nothing
 * about the result — only about who waits. Below `WORKER_THRESHOLD` proofs the
 * synchronous path is faster than the message round-trip, so the store keeps
 * using it; above, the interface stays responsive while the month is rebuilt.
 */

interface WorkerScope {
  onmessage: ((event: MessageEvent<PendingReconstruction>) => void) | null;
  postMessage(data: unknown): void;
}

const ctx = self as unknown as WorkerScope;

ctx.onmessage = (event: MessageEvent<PendingReconstruction>): void => {
  const request = event.data;
  const outcome = reconstruct(
    request.evidence,
    request.clients,
    request.settings,
    request.previousBlocks,
    request.corrections,
  );
  ctx.postMessage({
    blocks: outcome.blocks,
    conflicts: outcome.conflicts,
    orphans: outcome.orphans,
    evidence: outcome.evidence,
    calibration: outcome.calibration,
    ignored: outcome.ignored,
  });
};
