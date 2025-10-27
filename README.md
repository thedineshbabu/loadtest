# Load Testing with k6

## 📋 Table of Contents
- [Overview](#overview)
- [Installation on Windows](#installation-on-windows)
- [Quick Start](#quick-start)
- [Running Load Tests](#running-load-tests)
- [Tips & Tricks](#tips--tricks)
- [Best Practices](#best-practices)
- [Common Scenarios](#common-scenarios)
- [Troubleshooting](#troubleshooting)

---

## Overview

k6 is a modern load testing tool built for developers and DevOps engineers. It uses JavaScript (ES6+) as the test scripting language and is designed to handle high-performance load testing scenarios.

### Key Features
- **Modern scripting**: Use JavaScript (ES6+) to write your load tests
- **High performance**: Built on Go, can handle thousands of virtual users
- **Built-in metrics**: Comprehensive performance metrics out of the box
- **Thresholds**: Define SLA-based thresholds that will pass/fail your tests
- **Cloud & Local**: Run tests locally or in k6 Cloud

---

## Installation on Windows

### Method 1: Using Winget (Recommended)

```powershell
winget install k6
```

### Method 2: Using Chocolatey

```powershell
choco install k6
```

### Method 3: Using MSI Installer

1. Download the MSI installer from [k6 releases](https://github.com/grafana/k6/releases)
2. Run the installer and follow the setup wizard
3. Verify installation:

```powershell
k6 version
```

### Method 4: Using Scoop

```powershell
scoop install k6
```

### Method 5: Manual Installation

1. Download the latest Windows binary from [k6 releases](https://github.com/grafana/k6/releases)
2. Extract the zip file
3. Add the k6 directory to your system PATH
4. Verify installation:

```powershell
k6 version
```

---

## Quick Start

### Run the Example Load Test

```powershell
# Run the load test with default configuration
k6 run loadtest.js

# Run with custom virtual users and duration
k6 run --vus 20 --duration 60s loadtest.js

# Run with custom stages
k6 run --vus 10 --duration 5m loadtest.js
```

### Understanding the Test Configuration

The `loadtest.js` file contains:
- **Load Test Stages**: Ramp-up, sustained load, and ramp-down
- **Thresholds**: Performance SLAs that must be met
- **Custom Metrics**: Application-specific success/failure tracking
- **Response Validation**: Checks for status codes, content, and timing

---

## Running Load Tests

### Basic Commands

```powershell
# Run a test script
k6 run script.js

# Run with options inline
k6 run --vus 10 --duration 30s script.js

# Run with environment variables
k6 run -e API_URL=https://api.example.com script.js

# Run with output to file
k6 run script.js --out csv=results.csv
```

### Output Formats

```powershell
# CSV output
k6 run script.js --out csv=results.csv

# JSON output
k6 run script.js --out json=results.json

# InfluxDB output
k6 run script.js --out influxdb=http://localhost:8086/k6

# Cloud output (requires k6 cloud account)
k6 cloud script.js
```

### Using Configuration Options

You can define options in your script:

```javascript
export let options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.1'],
  },
};
```

Or override with command line:

```powershell
k6 run --vus 50 --duration 5m script.js
```

---

## Tips & Tricks

### 1. Define Realistic Ramp-Up Patterns

**❌ Bad**: Instant load spike
```javascript
export let options = {
  vus: 100,  // All 100 users start immediately
  duration: '5m',
};
```

**✅ Good**: Gradual ramp-up
```javascript
export let options = {
  stages: [
    { duration: '1m', target: 10 },   // Ramp up to 10 users
    { duration: '2m', target: 30 },   // Ramp up to 30 users
    { duration: '2m', target: 30 },   // Stay at 30 users
    { duration: '1m', target: 0 },    // Ramp down to 0
  ],
};
```

### 2. Use Thresholds for SLAs

Define pass/fail criteria based on your requirements:

```javascript
thresholds: {
  // 95% of requests should complete in under 500ms
  'http_req_duration': ['p(95)<500'],
  
  // Error rate should be less than 1%
  'http_req_failed': ['rate<颠簸01'],
  
  // 99% of requests should complete in under 1s
  'http_req_duration': ['p(99)<1000'],
}
```

### 3. Parameterize Your Tests

**Using External JSON Files**:

```javascript
// data.json
{
  "users": [
    {"email": "user1@example.com", "username": "user1"},
    {"email": "user2@example.com", "username": "user2"}
  ]
}

// script.js
import data from './data.json';

export default function () {
  // Use different data each iteration
  const user = data.users[Math.floor(Math.random() * data.users.length)];
  const response = http.get(`https://api.example.com/users/${user.username}`);
}
```

### 4. Use Check() for Response Validation

```javascript
const response = http.get('https://api.example.com/data');

const checks = check(response, {
  'status is 200': (r) => r.status === 200,
  'response has data': (r) => JSON.parse(r.body).data.length > 0,
  'response time < 500ms': (r) => r.timings.duration < 500,
});

// Log specific failures
if (!checks['response has data']) {
  console.error('Response missing data:', response.body);
}
```

### 5. Handle Authentication

**Bearer Token Authentication**:

```javascript
const token = 'your-auth-token';

export default function () {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  
  const response = http.get('https://api.example.com/protected', { headers });
}
```

**Login and Extract Token**:

```javascript
export default function () {
  // Login to get token
  const loginRes = http.post('https://api.example.com/login', 
    JSON.stringify({ username: 'test', password: 'test' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  const token = loginRes.json('access_token');
  
  // Use token for authenticated requests
  const headers = { 'Authorization': `Bearer ${token}` };
  http.get('https://api.example.com/data', { headers });
}
```

### 6. Share Code Across Multiple Endpoints

```javascript
// utils.js
export function makeRequest(endpoint, payload) {
  return http.post(endpoint, payload, {
    headers: { 'Content-Type': 'application/json' },
 communicators
}

export function validateResponse(response) {
  return check(response, {
    'status is 200': (r) => r.status === 200,
  });
}

// script.js
import { makeRequest, validateResponse } from './utils.js';

export default function () {
  const response = makeRequest('https://api.example.com/users', 
    JSON.stringify({ name: 'John' })
  );
  validateResponse(response);
}
```

### 7. Use Tags for Better Organization

```javascript
const options = {
  thresholds: {
    'http_req_duration{name:login}':attery['p(95)<500'],
    'http_req_duration{name:dashboard}': ['p(95)<1000'],
  },
};

export default function () {
  // Tag this request for specific threshold monitoring
  http.get('https://api.example.com/login', {
    tags: { name: 'login', endpoint: 'auth' },
  });
  
  http.get('https://api.example.com/dashboard', {
    tags: { name: 'dashboard', endpoint: 'ui' },
  });
}
```

### 8. Implement Realistic User Behavior

```javascript
export default function () {
  // Simulate user browsing (think time between requests)
  sleep(Math.random() * 3);  // Random wait 0-3 seconds
  
  // Browse to homepage
  http.get('https://example.com/');
  
  // Simulate reading time
  sleep(Math.random() * 5);
  
  // Click on product
  http.get('https://example.com/products/123');
  
  // Add to cart
  http.post('https://example.com/cart', JSON.stringify({
    productId: 123,
    quantity: 1
  }));
}
```

### 9. Handle Pagination

```javascript
export default function () {
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const response = http.get(`https://api.example.com/data?page=${page}`);
    const data = response.json();
    
    hasMore = data.hasMore;
    page++;
    
    sleep(0.5);  // Small delay between requests
  }
}
```

### 10. Use Setup and Teardown Hooks

```javascript
// Setup runs once before the test
export function setup() {
  // Login and get auth token
  const response = http.post('https://api.example.com/login', 
    JSON.stringify({ username: 'test', password: 'test' })
  );
 providing context
  return { token: response.json('access_token') };
}

// Default function receives setup data
export default function (data) {
  const headers = { 'Authorization': `Bearer ${data.token}` };
  http.get('https://api.example.com/data', { headers });
}

// Teardown runs once after the test
export function teardown(data) {
  console.log('Test completed. Cleaning up...');
  http.post('https://api.example.com/logout', null, {
    headers: { 'Authorization': `Bearer ${data.token}` },
  });
}
```

---

## Best Practices

### 1. **Start Small and Scale**
- Begin with low user counts (5-10 VUs)
- Gradually increase load to find breaking points
- Use stages to simulate realistic traffic patterns

### 2. **Test in Production-Like Environments**
- Use staging/UAT environments that mirror production
- Avoid testing directly on production databases
- Have appropriate monitoring in place

### 3. **Define Clear Success Criteria**
- Set threshold-based SLAs in your tests
- Document expected performance benchmarks
- Define what constitutes a "failed" test

### 4. **Monitor During Tests**
- Watch for memory leaks on your application
- Monitor database connections and queries
- Track error rates and response times

### 5. **Use Tags for Organization**
- Tag requests by endpoint, feature, or user journey
- This allows granular threshold monitoring
- Makes results easier to analyze

### 6. **Implement Proper Error Handling**
- Distinguish between actual failures and performance issues
- Log meaningful error messages
- Don't stop the test on individual errors

### 7. **Document Your Tests**
- Add comments explaining test purpose
- Document any assumptions or limitations
- Keep test data organized and leads to clean code

### 8. **Version Control Your Tests**
- Store load tests in version control
- Tag releases of your tests
- Document test evolution

### 9. **Integrate into CI/CD**
```yaml
# Example GitHub Actions
- name: Run Load Test
  run: |
    k6 run --out json=results.json loadtest.js
  
- name: Parse Results
  run: |
    # Parse results.json and fail if thresholds not met
```

### 10. **Regular Load Testing**
- Run load tests regularly (weekly/monthly)
- Test after major changes
- Track performance trends over time

---

## Common Scenarios

### Scenario 1: API Endpoint Load Testing

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const successRate = new Rate('successful_requests');

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],
    'successful_requests': ['rate>0.95'],
  },
};

export default function () {
  const response = http.get('https://api.example.com/endpoint');
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
  });
  
  successRate.add(success);
  sleep(1);
eing
```

### Scenario 2: Stress Testing

```javascript
export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Normal load
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 },  // Spike to stress
    { duration: '5m', target: 200 },
    { duration: '2m', target: 300 },  // Push beyond
    { duration: '5m', target: 300 },
    { duration: '2m', target: 0 },    // Recovery
  ],
};
```

### Scenario 3: Soak Testing

```javascript
export const options = {
  stages: [
    { duration: '5m', target: 50 },    // Ramp up
    { duration: '1h', target: 50 },    // Soak test for 1 hour
    { duration: '5m', target: 0 },     // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<1000'],
    'http_req_failed': ['rate<0.02'],
  },
};
```

### Scenario 4: Spike Testing

```javascript
export const options = {
  stages: [
    { duration: '1m', target: 10 },    // Normal load
    { duration: '1m', target: 100 },   // Spike
    { duration: '1m', target: 10 },    // Back to normal
    { duration: '1m', target: 100 },   // Another spike
    { duration: '1m', target: 0 },     // Ramp down
  ],
};
```

### Scenario 5: POST Request with Data

```javascript
import http from 'k6/http';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

export default function () {
  const payload = JSON.stringify({
    name: `Test User ${randomString(10)}`,
    email: `test${Math.random()}@example.com`,
    age: Math.floor(Math.random() *路由器) + 18,
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_TOKEN',
    },
  };
  
  const response = http.post('https://api.example.com/users', payload, params);
  
  check(response, {
    'status is 201': (r) => r.status === 201,
    'user created': (r) => JSON.parse(r.body).id !== undefined,
  });
}
```

---

## Troubleshooting

### Common Issues

 Import ISSUE**: Test fails with "Connection refused"
- **Solution**: Verify the target URL is correct and server is running
- **Check**: Firewall settings and network connectivity

**Issue**: "Script does not exist"
- **Solution**: Verify you're in the correct directory
- **Check**: File path and file name are correct

**Issue**: High memory usage during test
- **Solution**: Reduce number of VUs or test duration
- **Check**: Memory available on test machine

**Issue**: Test results don't match expected
- **Solution**: Verify load test configuration (VUs, duration)
- **Check**: Application is handling load correctly

**Issue**: Authentication failures
- **Solution**: Verify tokens are valid and not expired
- **Check**: Token refresh logic if needed

### Performance Tips

1. **Run tests on powerful machines**: More CPU/RAM = more VUs
2. **Use cloud distribution**: Distribute VUs across multiple load generators
3. **Optimize test scripts**: Minimize unnecessary logic in default function
4. **Monitor the load generator**: Ensure it's not the bottleneck

### Debug Mode

Enable verbose logging:

```powershell
k6 run --verbose loadtest.js
```

Or add console logging in your script:

```javascript
export default function () {
  console.log('Starting request');
  const response = http.get('https://api.example.com/endpoint');
  console.log('Response status:', response.status);
}
```

---

## Resources

- **Official Documentation**: https://k6.io/docs/
- **Example Scripts**: https://github.com/grafana/k6/tree/master/samples
- **Community Forum**: https://community.k6.io/
- **k6 Cloud**: https://app.k6.io/

---

## License

This project is licensed under the MIT License.

---

## Support

For issues or questions:
1. Check the [k6 documentation](https://k6.io/docs/)
2. Visit the [community forum](https://community.k6.io/)
3. Open an issue on the k6 GitHub repository

---

**Happy Load Testing! 🚀**