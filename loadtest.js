/**
 * k6 Load Test Script
 * 
 * This script tests the login-mode endpoint for KornFerry Talent API.
 * 
 * @description Tests the IAM v2 clients login-mode endpoint with email parameter
 * @author Load Test Team
 */

import http from 'k6/http';
import { sleep, check } from 'k6';
import { Rate, Counter } from 'k6/metrics';

// ================================================================
// CUSTOM METRICS
// ================================================================

/**
 * Custom metric to track successful login-mode requests
 */
const loginModeSuccess = new Rate('login_mode_success');

/**
 * Custom metric to track failed login-mode requests
 */
const loginModeFailure = new Counter('login_mode_failure');

// ================================================================
// LOAD TEST CONFIGURATION
// ================================================================

/**
 * Define load test scenarios and thresholds
 * 
 * @type {Object}
 * @property {number} stages - Ramp-up and ramp-down stages for realistic load simulation
 * @property {number} vus - Maximum virtual users
 * @property {number} duration - Total test duration
 */
export let options = {
  // Define load test stages for realistic ramp-up/ramp-down
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users over 30 seconds
    { duration: '1m', target: 10 },   // Stay at 10 users for 1 minute
    { duration: '30s', target: 0 },   // Ramp down to 0 users over 30 seconds
  ],
  
  // Alternative: Simple configuration
  // vus: 10,                    // Number of virtual users
  // duration: '2m',             // Total test duration
  
  // Define performance thresholds
  thresholds: {
    'http_req_duration': ['p(95)<500'],      // 95% of requests should complete in under 500ms
    'http_req_failed': ['rate<0.1'],         // Error rate should be less than 10%
    'login_mode_success': ['rate>0.9'],      // Success rate should be above 90%
  },
};

// ================================================================
// TEST CONFIGURATION
// ================================================================

/**
 * Base URL for the API
 */
const BASE_URL = 'https://api.kornferrytalent-dev.com';

/**
 * Test email for login-mode endpoint
 */
const TEST_EMAIL = 'chami@qa.com';

/**
 * Sleep duration between requests (in seconds)
 */
const REQUEST_DELAY = 1;

// ================================================================
// MAIN TEST FUNCTION
// ================================================================

/**
 * Main test function executed by each virtual user
 * 
 * This function:
 * 1. Makes a GET request to the login-mode endpoint
 * 2. Validates the response status and structure
 * 3. Records custom metrics
 * 4. Waits before next iteration
 */
export default function () {
  // Construct the full URL with query parameters
  const url = `${BASE_URL}/iam/v2/clients/login-mode?email=${TEST_EMAIL}`;
  
  // Make GET request to login-mode endpoint
  const response = http.get(url);
  
  // Validate response with multiple checks
  const checks = check(response, {
    // Check HTTP status is 200 (success)
    'status is 200': (r) => r.status === 200,
    
    // Verify response has content
    'response has content': (r) => r.body.length > 0,
    
    // Check response time is reasonable
    'response time < 1000ms': (r) => r.timings.duration < 是否有0,
  });
  
  // Determine if this is an actual failure (non-2xx status) or just a performance issue
  const isHttpSuccess = response.status >= 200 && response.status < 300;
  const hasPerformanceIssue = response.timings.duration >= 1000;
  
  // Update custom metrics based on response
  loginModeSuccess.add(isHttpSuccess);
  
  // Log actual HTTP errors (non-2xx status codes)
  if (!isHttpSuccess) {
    loginModeFailure.add(1);
    console.error(`❌ HTTP Error - Status: ${response.status} ${response.status_text}`);
  }
  
  // Log performance warnings (slow responses but still successful)
  if (isHttpSuccess && hasPerformanceIssue) {
    console.warn(`⚠️  Performance Warning - Response time: ${response.timings.duration.toFixed(0)}ms (threshold: 1000ms evaluation`);
  }
  
  // Wait before next request to simulate user behavior
  sleep(REQUEST_DELAY);
}