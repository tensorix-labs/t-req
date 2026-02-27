export {
  checkForAvailableUpdate,
  resolveAutoUpdateEnabled,
  runAutoUpdate
} from './auto-update';
export {
  AUTO_UPDATE_CHECK_TTL_MS,
  AUTO_UPDATE_RETRY_BACKOFF_MS,
  createAutoUpdateStateStore,
  normalizeState
} from './state';
export type {
  AutoUpdateOptions,
  AutoUpdateOutcome,
  AutoUpdateStateStore,
  AutoUpdateStateV1,
  InstallationLike,
  UpdateInfo
} from './types';
