import type { Installation } from '../installation';

export interface UpdateInfo {
  version: string;
  method: Installation.Method;
  command: string;
}

export interface AutoUpdateStateV1 {
  version: 1;
  lastCheckedAt?: number;
  cachedLatestVersion?: string;
  lastAttemptedVersion?: string;
  lastAttemptedAt?: number;
  lastAttemptStatus?: 'success' | 'failed';
}

export type AutoUpdateStatus =
  | 'disabled'
  | 'up_to_date'
  | 'available_manual'
  | 'updated'
  | 'backoff_skipped'
  | 'failed';

export type AutoUpdateDisabledReason = 'disabled' | 'non_interactive';

export interface AutoUpdateOptions {
  enabled: boolean;
  interactive: boolean;
  now?: () => number;
}

export interface AutoUpdateStateStore {
  read(): Promise<AutoUpdateStateV1>;
  write(state: AutoUpdateStateV1): Promise<void>;
}

export interface InstallationLike {
  VERSION: string;
  method(): Promise<Installation.Method>;
  latest(method?: Installation.Method): Promise<string>;
  updateCommand(method: Installation.Method, target?: string): string;
  upgrade(method: Installation.Method, target: string): Promise<void>;
}

export type AutoUpdateOutcome =
  | {
      status: 'disabled';
      reason: AutoUpdateDisabledReason;
    }
  | {
      status: 'up_to_date';
      currentVersion: string;
      method: Installation.Method;
      checkedAt: number;
    }
  | {
      status: 'available_manual';
      currentVersion: string;
      latestVersion: string;
      method: Installation.Method;
      command: string;
      checkedAt: number;
    }
  | {
      status: 'updated';
      currentVersion: string;
      latestVersion: string;
      method: Installation.Method;
      command: string;
      checkedAt: number;
    }
  | {
      status: 'backoff_skipped';
      currentVersion: string;
      latestVersion: string;
      method: Installation.Method;
      command: string;
      checkedAt: number;
      retryAfter: number;
    }
  | {
      status: 'failed';
      currentVersion: string;
      latestVersion?: string;
      method?: Installation.Method;
      command?: string;
      checkedAt?: number;
      phase: 'check' | 'upgrade';
      error: string;
    };
