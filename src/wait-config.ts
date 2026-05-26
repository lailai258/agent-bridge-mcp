export const DEFAULT_WAIT_TIMEOUT_SEC = 900;
export const MAX_WAIT_TIMEOUT_SEC = 3600;
export const DEFAULT_WAIT_CALL_WINDOW_SEC = 90;
export const MAX_WAIT_CALL_WINDOW_SEC = 110;

export const WAIT_TIMEOUT_ENV = 'AGENT_BRIDGE_WAIT_TIMEOUT_SEC';
export const MAX_WAIT_TIMEOUT_ENV = 'AGENT_BRIDGE_MAX_WAIT_TIMEOUT_SEC';
export const WAIT_CALL_WINDOW_ENV = 'AGENT_BRIDGE_WAIT_CALL_WINDOW_SEC';

export interface WaitTimeoutConfig {
  defaultTimeoutSec: number;
  maxTimeoutSec: number;
  callWindowSec: number;
}

export type WaitTimeoutMode = 'return_status' | 'throw';

function parsePositiveNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function getWaitTimeoutConfig(env: NodeJS.ProcessEnv = process.env): WaitTimeoutConfig {
  const configuredMax = parsePositiveNumber(env[MAX_WAIT_TIMEOUT_ENV]);
  const maxTimeoutSec = configuredMax ?? MAX_WAIT_TIMEOUT_SEC;

  const configuredDefault = parsePositiveNumber(env[WAIT_TIMEOUT_ENV]);
  const defaultTimeoutSec = Math.min(configuredDefault ?? DEFAULT_WAIT_TIMEOUT_SEC, maxTimeoutSec);

  const configuredCallWindow = parsePositiveNumber(env[WAIT_CALL_WINDOW_ENV]);
  const callWindowSec = Math.min(configuredCallWindow ?? DEFAULT_WAIT_CALL_WINDOW_SEC, MAX_WAIT_CALL_WINDOW_SEC);

  return {
    defaultTimeoutSec,
    maxTimeoutSec,
    callWindowSec,
  };
}

export function validateWaitTimeoutSec(value: unknown, config: WaitTimeoutConfig = getWaitTimeoutConfig()): number {
  if (value === undefined || value === null) {
    return config.defaultTimeoutSec;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > config.maxTimeoutSec) {
    throw new Error(`timeout must be a positive number no greater than ${config.maxTimeoutSec}`);
  }

  return Math.max(value, config.defaultTimeoutSec);
}

export function validateWaitTimeoutMode(value: unknown): WaitTimeoutMode {
  if (value === undefined || value === null) {
    return 'return_status';
  }

  if (value === 'return_status' || value === 'throw') {
    return value;
  }

  throw new Error('on_timeout must be either "return_status" or "throw"');
}
