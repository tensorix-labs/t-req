export const COMMANDS = {
  RUN_REQUEST: 't-req.runRequest',
  RUN_ALL_REQUESTS: 't-req.runAllRequests',
  SELECT_PROFILE: 't-req.selectProfile',
  CANCEL_REQUEST: 't-req.cancelRequest',
  SET_SERVER_TOKEN: 't-req.setServerToken',
  CLEAR_SERVER_TOKEN: 't-req.clearServerToken'
} as const;

export const WORKSPACE_STATE_KEYS = {
  ACTIVE_PROFILE: 't-req.activeProfile',
  ACTIVE_PROFILES_BY_SCOPE: 't-req.activeProfilesByScope.v1'
} as const;
