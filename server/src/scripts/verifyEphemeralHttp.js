const fs = require('node:fs/promises');
const path = require('node:path');

const ACTORS = Object.freeze([
  Object.freeze({
    roleName: 'Customer',
    email: 'khachhang@greenhome.test',
    endpoint: '/orders/my',
  }),
  Object.freeze({
    roleName: 'Staff',
    email: 'nhanvien@greenhome.test',
    endpoint: '/staff/orders',
  }),
  Object.freeze({
    roleName: 'WarehouseManager',
    email: 'quanlykho@greenhome.test',
    endpoint: '/warehouse/inventory',
  }),
]);

function assertStatus(response, expected, name) {
  if (response.status !== expected) {
    throw new Error(`${name} expected HTTP ${expected}, received ${response.status}`);
  }
}

async function readJson(response, name) {
  try {
    return await response.json();
  } catch {
    throw new Error(`${name} returned non-JSON content`);
  }
}

async function runEphemeralHttpSmoke({
  fetcher = fetch,
  apiBaseUrl = process.env.CI_API_BASE_URL,
  frontendUrl = process.env.CI_FRONTEND_URL,
  password = process.env.CI_STAGING_PASSWORD,
  now = Date.now,
} = {}) {
  if (!apiBaseUrl || !frontendUrl) {
    throw new Error('CI_API_BASE_URL and CI_FRONTEND_URL are required');
  }
  if (String(password || '').length < 12) {
    throw new Error('CI_STAGING_PASSWORD is required');
  }

  const report = {
    outcome: 'running',
    startedAt: new Date().toISOString(),
    steps: [],
  };

  async function step(name, operation) {
    const started = now();
    try {
      const metadata = await operation();
      report.steps.push({
        name,
        outcome: 'passed',
        durationMs: now() - started,
        ...metadata,
      });
      return metadata;
    } catch (error) {
      report.steps.push({
        name,
        outcome: 'failed',
        durationMs: now() - started,
        error: error.message,
      });
      report.outcome = 'failed';
      const wrapped = new Error(`${name}: ${error.message}`);
      wrapped.report = report;
      throw wrapped;
    }
  }

  const normalizedFrontendUrl = frontendUrl.replace(/\/$/, '');
  const frontendOrigin = new URL(frontendUrl).origin;

  await step('frontend root', async () => {
    const response = await fetcher(`${normalizedFrontendUrl}/`);
    assertStatus(response, 200, 'frontend root');
    const html = await response.text();
    if (!html.includes('id="root"')) {
      throw new Error('React root markup is missing');
    }
    return { httpStatus: response.status };
  });

  await step('API health', async () => {
    const response = await fetcher(`${apiBaseUrl}/health`);
    assertStatus(response, 200, 'API health');
    const payload = await readJson(response, 'API health');
    if (payload.success !== true) throw new Error('success must be true');
    return {
      httpStatus: response.status,
      requestId: payload.requestId || null,
    };
  });

  await step('allowed CORS origin', async () => {
    const response = await fetcher(`${apiBaseUrl}/health`, {
      headers: { Origin: frontendOrigin },
    });
    assertStatus(response, 200, 'allowed CORS origin');
    if (response.headers.get('access-control-allow-origin') !== frontendOrigin) {
      throw new Error('allow-origin header does not match the frontend origin');
    }
    return { httpStatus: response.status };
  });

  await step('untrusted CORS origin', async () => {
    const response = await fetcher(`${apiBaseUrl}/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    assertStatus(response, 200, 'untrusted CORS origin');
    if (response.headers.get('access-control-allow-origin')) {
      throw new Error('untrusted origin received an allow-origin header');
    }
    return { httpStatus: response.status };
  });

  await step('unauthenticated boundary', async () => {
    const response = await fetcher(`${apiBaseUrl}/profile`);
    assertStatus(response, 401, 'unauthenticated boundary');
    const payload = await readJson(response, 'unauthenticated boundary');
    if (payload.errorCode !== 'AUTH_TOKEN_MISSING') {
      throw new Error('unexpected auth error code');
    }
    return {
      httpStatus: response.status,
      requestId: payload.requestId || null,
    };
  });

  const tokens = new Map();
  for (const actor of ACTORS) {
    await step(`${actor.roleName} login and role endpoint`, async () => {
      const login = await fetcher(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: actor.email, password }),
      });
      assertStatus(login, 200, `${actor.roleName} login`);
      const loginPayload = await readJson(login, `${actor.roleName} login`);
      if (loginPayload.data?.user?.role?.roleName !== actor.roleName
        || !loginPayload.data?.token) {
        throw new Error('login role or token is invalid');
      }
      tokens.set(actor.roleName, loginPayload.data.token);
      const protectedResponse = await fetcher(`${apiBaseUrl}${actor.endpoint}`, {
        headers: {
          Authorization: `Bearer ${loginPayload.data.token}`,
        },
      });
      assertStatus(protectedResponse, 200, `${actor.roleName} role endpoint`);
      return { httpStatus: protectedResponse.status };
    });
  }

  await step('cross-role denial', async () => {
    const response = await fetcher(`${apiBaseUrl}/staff/orders`, {
      headers: {
        Authorization: `Bearer ${tokens.get('Customer')}`,
      },
    });
    assertStatus(response, 403, 'cross-role denial');
    return { httpStatus: response.status };
  });

  report.outcome = 'passed';
  report.finishedAt = new Date().toISOString();
  return report;
}

async function runCli() {
  const reportPath = path.resolve(
    process.cwd(),
    '..',
    'artifacts',
    'ephemeral-staging',
    'smoke-report.json'
  );
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  try {
    const report = await runEphemeralHttpSmoke();
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`HTTP smoke passed with ${report.steps.length} checks`);
  } catch (error) {
    const report = error.report || {
      outcome: 'failed',
      startedAt: new Date().toISOString(),
      steps: [{
        name: 'initialization',
        outcome: 'failed',
        error: error.message,
      }],
    };
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    throw error;
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  ACTORS,
  runEphemeralHttpSmoke,
};
