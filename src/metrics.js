const config = require('./config');

// Metrics stored in memory
const requests = {};
let greetingChangedCount = 0;

const requestsByMethod = {};
let requestsPerMinuteSnapshot = {};

setInterval(() => {
  requestsPerMinuteSnapshot = { ...requestsByMethod };
  Object.keys(requestsByMethod).forEach((method) => {
    requestsByMethod[method] = 0;
  });
  minuteWindowStart = Date.now();
}, 60000);

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

let pizzaCreationFailureCount = 0;

function trackPizzaCreationFailure() {
  pizzaCreationFailureCount++;
}

let revenueInWindow = 0;
let revenuePerMinuteSnapshot = 0;

setInterval(() => {
  revenuePerMinuteSnapshot = revenueInWindow;
  revenueInWindow = 0;
}, 60000);

function trackRevenue(items) {
  const orderTotal = items.reduce((sum, item) => sum + item.price, 0);
  revenueInWindow += orderTotal;
}

let serviceLatencyTotal = 0;
let serviceLatencyCount = 0;

// Middleware to track requests
function requestTracker(req, res, next) {
    const start = Date.now();
  
    res.on('finish', () => {
      const latency = Date.now() - start;
      serviceLatencyTotal += latency;
      serviceLatencyCount++;
    });
  
    const endpoint = `[${req.method}] ${req.path}`;
    requests[endpoint] = (requests[endpoint] || 0) + 1;
    const method = req.method.toUpperCase();
    requestsByMethod[method] = (requestsByMethod[method] || 0) + 1;
    trackActiveUser(req);
    next();
  }

// Function to track order success/failure and latency
let pizzaLatencyTotal = 0;
let pizzaLatencyCount = 0;

function trackLatency(latency) {
  pizzaLatencyTotal += latency;
  pizzaLatencyCount++;
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

  metrics.push(createMetric('pizzaCreationFailure', pizzaCreationFailureCount, '1', 'sum', 'asInt', {}));

  metrics.push(createMetric('revenuePerMinute', revenuePerMinuteSnapshot, '₿', 'sum', 'asDouble', {}));

  const avgPizzaLatency = pizzaLatencyCount > 0 ? pizzaLatencyTotal / pizzaLatencyCount : 0;
  metrics.push(createMetric('pizzaLatency', avgPizzaLatency, 'ms', 'sum', 'asDouble', {}));
  pizzaLatencyTotal = 0;
  pizzaLatencyCount = 0;

  const avgServiceLatency = serviceLatencyCount > 0 ? serviceLatencyTotal / serviceLatencyCount : 0;
  metrics.push(createMetric('serviceLatency', avgServiceLatency, 'ms', 'sum', 'asDouble', {}));
  serviceLatencyTotal = 0;
  serviceLatencyCount = 0;

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

module.exports = { requestTracker, trackLatency, getCpuUsagePercentage, getMemoryUsagePercentage, trackAuthAttempt, trackPizzasSold, trackPizzaCreationFailure, trackRevenue };