// frontend/src/utils/logger.js

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = import.meta.env.DEV ? 'debug' : 'warn';

function shouldLog(level) {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level, message, data) {
  const timestamp = new Date().toISOString().slice(11, 23);
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}`;
}

const logger = {
  debug(message, data) {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', message, data));
    }
  },

  info(message, data) {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message, data));
    }
  },

  warn(message, data) {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, data));
    }
  },

  error(message, data) {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message, data));
    }
  },

  // Helper for API calls
  api(method, url, data) {
    this.debug(`API ${method}`, { url, ...data });
  },

  apiSuccess(method, url, data) {
    this.info(`API ${method} success`, { url, ...data });
  },

  apiError(method, url, error, data) {
    this.error(`API ${method} failed`, { url, error: error.message, ...data });
  },
};

export default logger;
