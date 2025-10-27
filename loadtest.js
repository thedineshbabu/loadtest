import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

// ========== Custom Metrics ==========
const latencyTrend = new Trend('api_latency_ms', true);
const successCounter = new Counter('api_success_count');
const failureCounter = new Counter('api_failure_count');

// ========== Load JSON Config ==========
const config = JSON.parse(open('./apis.json'));

let authToken;

// ========== Setup Phase ==========
export function setup() {
  console.log(`🔐 Fetching access token...`);
  const payload = {
    client_id: config.auth.clientId,
    grant_type: config.auth.grantType,
    scope: config.auth.scope,
    login_mode: config.auth.loginMode,
    username: config.auth.username,
    password: config.auth.password,
  };

  const params = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
  const res = http.post(config.auth.tokenUrl, payload, params);
  
  if (res.status !== 200) {
    console.error(`❌ Failed to get token: ${res.status} - ${res.body}`);
    return { token: null };
  }

  const token = res.json().access_token;
  console.log(`✅ Token obtained successfully`);
  return { token };
}

// ========== Test Options ==========
export const options = {
  stages: [
    { duration: '30s', target: 1 },
    { duration: '1m', target: 2 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    api_latency_ms: ['p(95)<800'], // 95% of requests < 800ms
    http_req_failed: ['rate<0.05'], // Error rate should be less than 5%
    checks: ['rate>0.95'], // 95% of checks should pass
  },
};

// ========== Test Execution ==========
export default function (data) {
  const token = data.token;

  for (const endpoint of config.endpoints) {
    group(endpoint.name, function () {
      const url = `${config.baseUrl}${endpoint.path}`;

      // Build headers conditionally
      let headers = { 'Content-Type': 'application/json' };
      if (endpoint.requiresAuth && token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      let res;
      const start = new Date().getTime();

      try {
        if (endpoint.method === 'GET') {
          res = http.get(url, { headers });
        } else if (endpoint.method === 'POST') {
          res = http.post(url, JSON.stringify(endpoint.body || {}), { headers });
        } else if (endpoint.method === 'PUT') {
          res = http.put(url, JSON.stringify(endpoint.body || {}), { headers });
        } else if (endpoint.method === 'DELETE') {
          res = http.del(url, null, { headers });
        } else {
          console.error(`⚠️ Unsupported method: ${endpoint.method}`);
          return;
        }

        const end = new Date().getTime();
        const latency = end - start;
        latencyTrend.add(latency);

        const success = check(res, {
          [`${endpoint.name} - status ${endpoint.expectedStatus}`]:
            (r) => r.status === endpoint.expectedStatus,
        });

        if (success) {
          successCounter.add(1);
        } else {
          failureCounter.add(1);
          console.error(
            `❌ ${endpoint.name} failed: got ${res.status}, expected ${endpoint.expectedStatus}`
          );
        }
      } catch (err) {
        console.error(`🚨 Error executing ${endpoint.name}: ${err}`);
        failureCounter.add(1);
      }
    });
  }

  sleep(1);
}

// ========== Custom Summary Output ==========
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  try {
    // Generate HTML report
    const htmlReportContent = htmlReport(data);
    
    return {
      // Generate HTML report
      [`report-${timestamp}.html`]: htmlReportContent,
      
      // Generate JSON summary
      [`summary-${timestamp}.json`]: JSON.stringify({
        timestamp: data.root_group.timestamp,
        duration: data.state.testRunDurationMs,
        metrics: {
          http_reqs: data.metrics.http_reqs.values,
          http_req_duration: data.metrics.http_req_duration.values,
          http_req_failed: data.metrics.http_req_failed.values,
          checks: data.metrics.checks.values,
          custom_metrics: {
            api_latency_ms: data.metrics.api_latency_ms.values,
            api_success_count: data.metrics.api_success_count.values,
            api_failure_count: data.metrics.api_failure_count.values,
          }
        },
      }, null, 2),
      
      // Console summary (STDOUT)
      'stdout': customConsoleSummary(data),
    };
  } catch (error) {
    console.error('Error generating summary:', error);
    // Return just the console summary if HTML generation fails
    return {
      'stdout': customConsoleSummary(data),
    };
  }
}

// ========== Custom Console Summary ==========
function customConsoleSummary(data) {
  const metrics = data.metrics;
  
  // Safe access to custom metrics with defaults
  const apiSuccessCount = metrics.api_success_count?.values?.count || 0;
  const apiFailureCount = metrics.api_failure_count?.values?.count || 0;
  const apiLatencyP95 = metrics.api_latency_ms?.values?.['p(95)'] || 0;
  
  // Calculate success rate safely
  const totalApiCalls = apiSuccessCount + apiFailureCount;
  const successRate = totalApiCalls > 0 ? 
    ((apiSuccessCount / totalApiCalls) * 100).toFixed(2) : '0.00';
  
  // Handle checks metrics safely
  const checksCount = metrics.checks?.values?.count || 0;
  const checksPasses = metrics.checks?.values?.passes || 0;
  const checksFailures = metrics.checks?.values?.failures || 0;
  const checksRate = metrics.checks?.values?.rate || 0;
  
  // Safe access to HTTP metrics
  const totalRequests = Math.round(metrics.http_reqs?.values?.count || 0);
  const httpFailRate = metrics.http_req_failed?.values?.rate || 0;
  const httpSuccessRate = (100 - httpFailRate * 100).toFixed(2);
  const httpFailRatePct = (httpFailRate * 100).toFixed(2);
  const iterations = Math.round(metrics.iterations?.values?.count || 0);
  const vusMax = data.state.testRunDurationMs !== 0 ? Math.round(metrics.vus?.values?.max || 0) : 0;
  
  // HTTP duration metrics
  const httpAvg = (metrics.http_req_duration?.values?.avg || 0).toFixed(2);
  const httpMin = (metrics.http_req_duration?.values?.min || 0).toFixed(2);
  const httpMax = (metrics.http_req_duration?.values?.max || 0).toFixed(2);
  const httpP90 = (metrics.http_req_duration?.values?.['p(90)'] || 0).toFixed(2);
  const httpP95 = (metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(2);
  
  return `
╔══════════════════════════════════════════════════════════════╗
║                  API LOAD TEST SUMMARY                        ║
╚══════════════════════════════════════════════════════════════╝

⏱  Test Duration: ${(data.state.testRunDurationMs / 1000).toFixed(2)}s
👥 Virtual Users: ${vusMax}
🔄 Total Iterations: ${iterations}

📊 HTTP METRICS
─────────────────────────────────────────────────────────────
  Total Requests: ${totalRequests}
  Success Rate: ${httpSuccessRate}%
  Failure Rate: ${httpFailRatePct}%
  
📈 RESPONSE TIME (ms)
─────────────────────────────────────────────────────────────
  Average: ${httpAvg}ms
  Minimum: ${httpMin}ms
  Maximum: ${httpMax}ms
  P90: ${httpP90}ms
  P95: ${httpP95}ms

✅ CHECK RESULTS
─────────────────────────────────────────────────────────────
  Total Checks: ${Math.round(checksCount)}
  Passed: ${Math.round(checksPasses)}
  Failed: ${Math.round(checksFailures)}
  Success Rate: ${(checksRate * 100).toFixed(2)}%

⚡ CUSTOM METRICS
─────────────────────────────────────────────────────────────
  API Success: ${Math.round(apiSuccessCount)} (${successRate}%)
  API Failures: ${Math.round(apiFailureCount)}
  Custom Latency P95: ${apiLatencyP95.toFixed(2)}ms

🎯 THRESHOLD STATUS
─────────────────────────────────────────────────────────────
${getThresholdStatus(data)}

💾 Detailed reports saved to:
   - HTML: report-*.html
   - JSON: summary-*.json

╚══════════════════════════════════════════════════════════════╝
`;
}

// Helper function to format threshold status
function getThresholdStatus(data) {
  // Access metrics and check their threshold results
  const metrics = data.metrics;
  const results = [];
  
  // Check each metric for threshold results
  for (const [metricName, metricData] of Object.entries(metrics)) {
    if (metricData.thresholds && metricData.thresholds.length > 0) {
      metricData.thresholds.forEach(threshold => {
        const status = threshold.ok ? '✓' : '✗';
        results.push(`  ${status} ${metricName}: ${threshold.values}`);
      });
    }
  }
  
  return results.length > 0 ? results.join('\n') : '  No thresholds defined';
}
