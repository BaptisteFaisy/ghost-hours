import type { Block, Minutes, ReconstructionResult, ReconstructionSettings } from '@ghost-hours/core';
import type { Evidence, Client } from '@ghost-hours/core';
import type { Calibration } from './calibration.ts';

export interface LeadInCorrection {
  readonly blockId: string;
  readonly appliedMinutes: Minutes;
  readonly acceptedMinutes: Minutes;
}

export interface SessionizeInput {
  readonly evidence: readonly Evidence[];
  readonly clients: readonly Client[];
  readonly settings: ReconstructionSettings;
  readonly lockedBlocks?: readonly Block[];
  readonly adjustedBlocks?: readonly Block[];
  readonly corrections?: readonly LeadInCorrection[];
}

export interface SessionizeResult extends ReconstructionResult {
  readonly calibration: Calibration;
}
