const config = require('./config');

// Metrics stored in memory
const requests = {};
let greetingChangedCount = 0;

const requestsByMethod = {};
let requestsPerMinuteSnapshot = {};
let minuteWindowStart = Date.now();

setInterval(() => {
  requestsPerMinuteSnapshot = { ...requestsByMethod };
  Object.keys(requestsByMethod).forEach((method) => {
    requestsByMethod[method] = 0;
  });
  minuteWindowStart = Date.now();
}, 60000);

// Function to track when the greeting is changed
function greetingChanged() {
  greetingChangedCount++;
}

const activeUsers = {};
const ACTIVE_USER_WINDOW_MS = 5 * 60 * 1000;

function trackActiveUser(req) {
  const userId = req.user?.id;
  if (userId) {
    activeUsers[userId] = Date.now();
  }
}

function getActiveUserCount() {
  const cutoff = Date.now() - ACTIVE_USER_WINDOW_MS;
  return Object.values(activeUsers).filter(lastSeen => lastSeen >= cutoff).length;
}

let authSuccessCount = 0;
let authFailureCount = 0;

function trackAuthAttempt(success) {
  if (success) {
    authSuccessCount++;
  } else {
    authFailureCount++;
  }
}

let pizzasSoldInWindow = 0;
let pizzasSoldPerMinuteSnapshot = 0;

setInterval(() => {
  pizzasSoldPerMinuteSnapshot = pizzasSoldInWindow;
  pizzasSoldInWindow = 0;
}, 60000);

function trackPizzasSold(count) {
  pizzasSoldInWindow += count;
}

// Middleware to track requests
function requestTracker(req, res, next) {
  console.log(`[metrics] ${req.method} ${req.path}`);
  const endpoint = `[${req.method}] ${req.path}`;
  requests[endpoint] = (requests[endpoint] || 0) + 1;

  const method = req.method.toUpperCase();
  requestsByMethod[method] = (requestsByMethod[method] || 0) + 1;

  trackActiveUser(req);

  next();
}

// Function to track order success/failure and latency
function trackOrderMetrics(success, latency) {
  console.log("Made it to trackOrderMetrics with success:", success, "and latency:", latency);
  const metricName = success ? 'orderSuccess' : 'orderFailure';
  const metricValue = 1;
  const metric = createMetric(metricName, metricValue, '1', 'sum', 'asInt', {});

  // Optionally track latency as a separate metric
  const latencyMetric = createMetric('orderLatency', latency, 'ms', 'gauge', 'asDouble', {});
}

const os = require('os');

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return (cpuUsage * 100).toFixed(2);
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

// This will periodically send metrics to Grafana
setInterval(() => {
  const metrics = [];

  Object.keys(requests).forEach((endpoint) => {
    metrics.push(createMetric('requests', requests[endpoint], '1', 'sum', 'asInt', { endpoint }));
  });
  const methodCounts =
    Object.keys(requestsPerMinuteSnapshot).length > 0
      ? requestsPerMinuteSnapshot
      : requestsByMethod;

  Object.keys(methodCounts).forEach((method) => {
    metrics.push(
      createMetric('requests_per_minute', methodCounts[method], '1', 'sum', 'asInt', { method })
    );
  });

  metrics.push(createMetric('greetingChange', greetingChangedCount, '1', 'sum', 'asInt', {}));

  metrics.push(createMetric('activeUsers', getActiveUserCount(), '1', 'sum', 'asInt', {}));

  metrics.push(createMetric('authSuccess', authSuccessCount, '1', 'sum', 'asInt', {}));
  metrics.push(createMetric('authFailure', authFailureCount, '1', 'sum', 'asInt', {}));

  metrics.push(createMetric('cpu', getCpuUsagePercentage(), '1', 'gauge', 'asDouble', {}));
  metrics.push(createMetric('memory', getMemoryUsagePercentage(), '1', 'gauge', 'asDouble', {}));

  metrics.push(createMetric('pizzasSoldPerMinute', pizzasSoldPerMinuteSnapshot, '1', 'sum', 'asInt', {}));

  sendMetricToGrafana(metrics);
}, 10000);

function createMetric(metricName, metricValue, metricUnit, metricType, valueType, attributes) {
  attributes = { ...attributes, source: config.metrics.source };
  const metric = {
    name: metricName,
    unit: metricUnit,
    [metricType]: {
      dataPoints: [
        {
          [valueType]: metricValue,
          timeUnixNano: Date.now() * 1000000,
          attributes: [],
        },
      ],
    },
  };

  Object.keys(attributes).forEach((key) => {
    metric[metricType].dataPoints[0].attributes.push({
      key: key,
      value: { stringValue: attributes[key] },
    });
  });

  if (metricType === 'sum') {
    metric[metricType].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric[metricType].isMonotonic = true;
  }

  return metric;
}

function sendMetricToGrafana(metrics) {
  const body = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics,
          },
        ],
      },
    ],
  };

  fetch(`${config.metrics.endpointUrl}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.metrics.accountId}:${config.metrics.apiKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }
    })
    .catch((error) => {
      console.error('Error pushing metrics:', error);
    });
}

module.exports = { requestTracker, greetingChanged, trackOrderMetrics, getCpuUsagePercentage, getMemoryUsagePercentage, trackAuthAttempt, trackPizzasSold };