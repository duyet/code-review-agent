import * as core from '@actions/core';

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    core.info(formatMessage(message, args));
  },

  debug: (message: string, ...args: unknown[]) => {
    core.debug(formatMessage(message, args));
  },

  warning: (message: string, ...args: unknown[]) => {
    core.warning(formatMessage(message, args));
  },

  error: (message: string | Error, ...args: unknown[]) => {
    if (message instanceof Error) {
      core.error(message.message);
      if (message.stack) {
        core.debug(message.stack);
      }
    } else {
      core.error(formatMessage(message, args));
    }
  },

  group: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    return core.group(name, fn);
  },

  startGroup: (name: string) => {
    core.startGroup(name);
  },

  endGroup: () => {
    core.endGroup();
  },
};

function formatMessage(message: string, args: unknown[]): string {
  if (args.length === 0) return message;
  return `${message} ${args.map((a) => JSON.stringify(a)).join(' ')}`;
}
