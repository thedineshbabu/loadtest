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

// ========== Token Management ==========
/**
 * Fetches a new authentication token using the selected user credentials
 * This function can be called to refresh expired tokens during test execution
 * @returns {string|null} The access token or null if authentication fails
 */
function fetchToken() {
  // Select user based on configured mode
  const selectedUser = selectUser();
  
  // Build the authentication payload
  const payload = {
    client_id: config.auth.clientId,
    grant_type: config.auth.grantType,
    scope: config.auth.scope,
    login_mode: config.auth.loginMode,
    username: selectedUser.username,
    password: selectedUser.password,
  };

  // Set headers for token request
  const params = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
  
  // Make token request
  const res = http.post(config.auth.tokenUrl, payload, params);
  
  // Handle authentication failure
  if (res.status !== 200) {
    console.error(`❌ Failed to get token for user ${selectedUser.username}: ${res.status} - ${res.body}`);
    return null;
  }

  // Extract access token from response
  const token = res.json().access_token;
  console.log(`✅ Token obtained successfully for user: ${selectedUser.username}`);
  
  return token;
}

// ========== User Selection Logic ==========
/**
 * Selects a user from the configured users array based on the selection mode
 * Supports three modes:
 * - "random": Randomly selects a user from the array
 * - "sequential": Uses the userIndex to select a specific user
 * - "environment": Uses USERNAME and PASSWORD environment variables
 * @returns {Object} Selected user object with username and password
 */
function selectUser() {
  const mode = config.auth.userSelectionMode || 'random';
  
  // Check if we should use environment variables
  if (mode === 'environment' || (__ENV.USERNAME && __ENV.PASSWORD)) {
    const envUsername = __ENV.USERNAME;
    const envPassword = __ENV.PASSWORD;
    
    if (envUsername && envPassword) {
      console.log(`🔑 Using environment variable credentials for user: ${envUsername}`);
      return { username: envUsername, password: envPassword };
    }
  }
  
  // Get the users array, default to empty array if not present
  const users = config.auth.users || [];
  
  // If no users configured, return a default structure
  if (users.length === 0) {
    console.warn('⚠️ No users configured in apis.json, using fallback');
    return { username: '', password: '' };
  }
  
  let selectedUser;
  
  // Select user based on mode
  if (mode === 'sequential') {
    // Use the specified index or default to 0
    const index = config.auth.userIndex || 0;
    selectedUser = users[index % users.length]; // Use modulo to prevent out of bounds
    console.log(`👤 Using sequential user at index ${index}: ${selectedUser.username}`);
  } else {
    // Random mode (default)
    const randomIndex = Math.floor(Math.random() * users.length);
    selectedUser = users[randomIndex];
    console.log(`🎲 Randomly selected user: ${selectedUser.username}`);
  }
  
  return selectedUser;
}

// ========== Setup Phase ==========
/**
 * Setup function that runs once before all VUs start executing
 * Responsible for fetching authentication token using selected user credentials
 * @returns {Object} Object containing the authentication token
 */
export function setup() {
  console.log(`🔐 Fetching initial access token...`);
  
  // Fetch initial token using the centralized fetchToken function
  const initialToken = fetchToken();
  
  return { 
    token: initialToken
  };
}

// ========== Test Options ==========
export const options = {
  stages: [
    { duration: '10s', target: 50 },   // Ramp up to 50 VUs
    { duration: '10s', target: 100 },  // Ramp up to 100 VUs
    { duration: '10s', target: 150 },  // Ramp up to 150 VUs
    { duration: '10s', target: 200 },  // Ramp up to 200 VUs
    { duration: '10s', target: 200 },  // Hold at 200 VUs for sustained load
    { duration: '10s', target: 0 },   // Cool down
  ],
  thresholds: {
    api_latency_ms: ['p(95)<2000'], // 95% of requests < 2000ms (relaxed for higher load)
    http_req_failed: ['rate<0.05'], // Error rate should be less than 5%
    checks: ['rate>0.90'], // 90% of checks should pass (slightly more lenient for higher load)
  },
};

// ========== Test Execution ==========
/**
 * Main test execution function called for each VU iteration
 * Uses the token obtained from setup() to authenticate API requests
 * Automatically regenerates token on 401 (Unauthorized) responses
 * @param {Object} data - Data passed from setup() function (contains token)
 */
export default function (data) {
  // Get initial token from setup
  let currentToken = data.token;

  for (const endpoint of config.endpoints) {
    // Skip endpoints that have isTest flag set to false
    // Default to true if not specified
    const isTest = endpoint.isTest !== false;
    if (!isTest) {
      console.log(`⏭️  Skipping ${endpoint.name} (isTest: false)`);
      continue;
    }
    
    group(endpoint.name, function () {
      // Construct URL with dynamic values if specified
      let url = `${config.baseUrl}${endpoint.path}`;
      
      // Handle dynamic query parameters (e.g., emails)
      if (endpoint.dynamicValues && endpoint.dynamicValues.type === 'email' && endpoint.queryParam) {
        const emails = endpoint.dynamicValues.emails || [];
        if (emails.length > 0) {
          // Randomly select an email from the array
          const randomIndex = Math.floor(Math.random() * emails.length);
          const selectedEmail = emails[randomIndex];
          
          // Append query parameter to URL
          const separator = endpoint.path.includes('?') ? '&' : '?';
          url = `${url}${separator}${endpoint.queryParam}=${selectedEmail}`;
          
          console.log(`📧 Using email: ${selectedEmail} for ${endpoint.name}`);
        }
      }

      // Build headers conditionally
      let headers = { 'Content-Type': 'application/json' };
      if (endpoint.requiresAuth && currentToken) {
        headers['Authorization'] = `Bearer ${currentToken}`;
      }

      let res;
      const start = new Date().getTime();

      try {
        // Make the API request
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

        // Check for 405 Method Not Allowed - stop the test for this endpoint
        if (res.status === 405) {
          console.error(`❌ ${endpoint.name} returned 405 (Method Not Allowed). Stopping test for this endpoint.`);
          failureCounter.add(1);
          return; // Stop execution immediately
        }

        // Check for 401 Unauthorized (token expired or invalid) and autoTokenRefresh enabled
        const autoRefresh = config.auth.autoTokenRefresh !== false; // Default to true if not specified
        const isTokenExpired = res.status === 401 && endpoint.requiresAuth && autoRefresh;
        
        if (isTokenExpired) {
          console.warn(`🔄 Token expired for ${endpoint.name}, regenerating token...`);
          
          // Regenerate token using the global fetchToken function
          const newToken = fetchToken();
          
          if (newToken) {
            // Update current token for subsequent requests
            currentToken = newToken;
            
            // Update authorization header with new token
            headers['Authorization'] = `Bearer ${currentToken}`;
            
            // Retry the request with the new token
            console.log(`🔄 Retrying ${endpoint.name} with new token...`);
            const retryStart = new Date().getTime();
            
            if (endpoint.method === 'GET') {
              res = http.get(url, { headers });
            } else if (endpoint.method === 'POST') {
              res = http.post(url, JSON.stringify(endpoint.body || {}), { headers });
            } else if (endpoint.method === 'PUT') {
              res = http.put(url, JSON.stringify(endpoint.body || {}), { headers });
            } else if (endpoint.method === 'DELETE') {
              res = http.del(url, null, { headers });
            }
            
            const retryEnd = new Date().getTime();
            const latency = retryEnd - retryStart;
            latencyTrend.add(latency);
          } else {
            // Failed to regenerate token
            console.error(`❌ Failed to regenerate token for ${endpoint.name}`);
            failureCounter.add(1);
            return;
          }
        } else {
          // Calculate latency for non-retry requests
          const end = new Date().getTime();
          const latency = end - start;
          latencyTrend.add(latency);
        }

        // Validate response status
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
