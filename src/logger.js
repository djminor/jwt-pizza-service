"use strict";

const axios = require("axios");

const config = require("./config");

const LOGGING_URL        = config.logging.endpointUrl;
const LOGGING_ACCOUNT_ID = config.logging.accountId;
const LOGGING_API_KEY    = config.logging.apiKey;

const LOKI_PUSH_ENDPOINT = `${LOGGING_URL}/loki/api/v1/push`;

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL  = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.debug;

async function sendToLoki(level, message, meta = {}) {
  const nowNs   = String(Date.now()) + "000000";
  const payload = {
    streams: [
      {
        stream: {
          app:   config.logging.appName,
          env:   config.logging.env,
          level: level,
        },
        values: [
          [
            nowNs,
            JSON.stringify({ message, level, ...meta }),
          ],
        ],
      },
    ],
  };

  const options = {
    headers: { "Content-Type": "application/json" },
    auth: {
      username: LOGGING_ACCOUNT_ID,
      password: LOGGING_API_KEY,
    },
  };

  try {
    await axios.post(LOKI_PUSH_ENDPOINT, payload, options);
  } catch (err) {
    console.error("[logger] Failed to push to Loki:", err.message);
  }
}

function log(level, message, meta = {}) {
  if (LOG_LEVELS[level] < MIN_LEVEL) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    app: config.logging.appName,
    env: config.logging.env,
    ...meta,
  };

  const output = JSON.stringify(entry);
  if (level === "error") {
    console.error(output);
  } else {
    console.log(output);
  }

  sendToLoki(level, message, meta);
}

const logger = {
  debug: (message, meta) => log("debug", message, meta),
  info:  (message, meta) => log("info",  message, meta),
  warn:  (message, meta) => log("warn",  message, meta),
  error: (message, meta) => log("error", message, meta),
};

function requestLogger(req, res, next) {
  const startAt = process.hrtime.bigint();

  const requestMeta = {
    method:    req.method,
    path:      req.path,
    ip:        req.ip || req.headers["x-forwarded-for"] || "unknown",
    userAgent: req.headers["user-agent"] || "",
    requestId: req.headers["x-request-id"] || crypto.randomUUID?.() || Date.now().toString(36),
  };

  logger.info("Incoming request", requestMeta);

  res.setHeader("x-request-id", requestMeta.requestId);

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startAt) / 1e6;
    const level      = res.statusCode >= 500 ? "error"
                     : res.statusCode >= 400 ? "warn"
                     : "info";

    log(level, "Request completed", {
      ...requestMeta,
      statusCode: res.statusCode,
      durationMs: parseFloat(durationMs.toFixed(2)),
    });
  });

  res.on("close", () => {
    if (!res.writableEnded) {
      logger.warn("Client disconnected early", requestMeta);
    }
  });

  next();
}

module.exports = { logger, requestLogger };