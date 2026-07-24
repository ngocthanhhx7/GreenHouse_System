import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

import { createReviewService } from '../services/reviewService.js';
import { createSupportService } from '../services/supportService.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

function createNodeComponentRuntime(scenario) {
  const hookStates = new Map();
  const pendingEffects = [];
  const calls = [];
  const deferred = new Map();
  let rootComponent = null;
  let rootProps = {};
  let tree = null;
  let currentInstance = null;
  let renderQueued = false;

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      renderRoot();
    });
  }

  function useSlot(initializer) {
    assert.ok(currentInstance, 'React hook used outside a rendered component');
    const slots = hookStates.get(currentInstance) || [];
    hookStates.set(currentInstance, slots);
    const index = currentInstance.index++;
    if (!slots[index]) slots[index] = initializer();
    return slots[index];
  }

  function useState(initial) {
    const slot = useSlot(() => ({
      value: typeof initial === 'function' ? initial() : initial,
    }));
    const setValue = (next) => {
      const value = typeof next === 'function' ? next(slot.value) : next;
      if (Object.is(value, slot.value)) return;
      slot.value = value;
      queueRender();
    };
    return [slot.value, setValue];
  }

  function useRef(initial) {
    return useSlot(() => ({ current: initial }));
  }

  function useMemo(factory, dependencies = []) {
    const slot = useSlot(() => ({ dependencies: undefined, value: undefined }));
    const changed = !slot.dependencies
      || dependencies.length !== slot.dependencies.length
      || dependencies.some((value, index) => !Object.is(value, slot.dependencies[index]));
    if (changed) {
      slot.value = factory();
      slot.dependencies = dependencies;
    }
    return slot.value;
  }

  function useCallback(callback, dependencies = []) {
    return useMemo(() => callback, dependencies);
  }

  function useEffect(effect, dependencies) {
    const slot = useSlot(() => ({ dependencies: undefined, cleanup: null }));
    const changed = dependencies === undefined
      || !slot.dependencies
      || dependencies.length !== slot.dependencies.length
      || dependencies.some((value, index) => !Object.is(value, slot.dependencies[index]));
    if (!changed) return;
    slot.dependencies = dependencies;
    pendingEffects.push(async () => {
      if (slot.cleanup) slot.cleanup();
      const result = await effect();
      slot.cleanup = typeof result === 'function' ? result : null;
    });
  }

  function createElement(type, props, ...children) {
    const normalizedChildren = children.length <= 1 ? children[0] : children;
    return {
      type,
      props: {
        ...(props || {}),
        ...(children.length ? { children: normalizedChildren } : {}),
      },
    };
  }

  function renderElement(element, instancePath = 'root') {
    if (element === null || element === undefined || typeof element === 'boolean') return element;
    if (Array.isArray(element)) {
      return element.map((child, index) => renderElement(child, `${instancePath}.${index}`));
    }
    if (typeof element !== 'object') return element;
    if (element.type === Fragment) {
      return renderElement(element.props?.children, `${instancePath}.fragment`);
    }
    if (typeof element.type === 'function') {
      const previous = currentInstance;
      currentInstance = Object.assign(
        hookStates.get(instancePath) || { index: 0 },
        { index: 0 },
      );
      hookStates.set(instancePath, currentInstance);
      const result = element.type(element.props || {});
      currentInstance = previous;
      return renderElement(result, instancePath);
    }
    const props = { ...(element.props || {}) };
    if (props.children !== undefined) {
      props.children = renderElement(props.children, `${instancePath}.children`);
    }
    return { type: element.type, props };
  }

  function renderRoot() {
    tree = renderElement(createElement(rootComponent, rootProps), 'root');
    const effects = pendingEffects.splice(0);
    for (const effect of effects) Promise.resolve(effect()).catch(() => {});
    return tree;
  }

  function callService(method, args) {
    calls.push({ method, args });
    const methodDeferred = scenario.deferredMethods?.includes(method);
    if (!methodDeferred) {
      return Promise.resolve(
        scenario.responses?.[method]
          ?? { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 },
      );
    }
    return new Promise((resolve, reject) => {
      const queue = deferred.get(method) || [];
      queue.push({ resolve, reject });
      deferred.set(method, queue);
    });
  }

  const runtime = {
    React: null,
    useState,
    useRef,
    useMemo,
    useCallback,
    useEffect,
    useLayoutEffect: useEffect,
    createElement,
    createContext(defaultValue) {
      return {
        _currentValue: defaultValue,
        Provider: ({ value, children }) => {
          this._currentValue = value;
          return children;
        },
      };
    },
    useContext(context) {
      return context._currentValue;
    },
    Fragment: Symbol.for('sl008.fragment'),
    memo: (component) => component,
    forwardRef: (component) => component,
    Link: 'a',
    Outlet: 'div',
    useParams: () => scenario.params || {},
    useNavigate: () => (() => {}),
    useAuth: () => ({ user: scenario.actor || null }),
    serviceProxy: () => new Proxy({}, {
      get: (_target, method) => (...args) => callService(method, args),
    }),
    mount(component, props = {}) {
      rootComponent = component;
      rootProps = props;
      renderRoot();
    },
    get tree() {
      return tree;
    },
    get calls() {
      return calls.slice();
    },
    async flush() {
      await Promise.resolve();
      await Promise.resolve();
    },
    async settle(method, mode = 'resolve', value = {}) {
      const queue = deferred.get(method) || [];
      const pending = queue.shift();
      assert.ok(pending, `expected a deferred ${method}() call`);
      if (queue.length) deferred.set(method, queue);
      else deferred.delete(method);
      pending[mode](value);
      await this.flush();
    },
    findControls(method) {
      const controls = [];
      function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }
        if (node.props && (
          node.props['data-sl008-action'] === method
          || node.props['data-command'] === method
          || node.props['aria-label']?.toLowerCase().includes(method.toLowerCase())
        )) controls.push(node);
        visit(node.props?.children);
      }
      visit(tree);
      return controls;
    },
    invoke(control) {
      const handler = control?.props?.onSubmit || control?.props?.onClick;
      assert.equal(typeof handler, 'function', 'rendered control must expose an event handler');
      handler({
        preventDefault() {},
        target: { value: '' },
        currentTarget: { value: '' },
      });
    },
  };
  const Fragment = runtime.Fragment;
  runtime.React = {
    createElement,
    Fragment,
    useState,
    useRef,
    useMemo,
    useCallback,
    useEffect,
    useLayoutEffect: useEffect,
    createContext: runtime.createContext,
    useContext: runtime.useContext,
  };
  // Existing JSX files in this repository are compiled with React.createElement
  // even when they use the automatic import form. Expose the mocked React
  // object globally so the SSR harness exercises the real component body.
  globalThis.React = runtime.React;
  globalThis.__SL008_RUNTIME__ = runtime;
  return runtime;
}

async function renderRealComponent(componentRelativePath, scenario, props = {}) {
  const componentPath = path.join(dirname, '..', componentRelativePath);
  assert.ok(
    existsSync(componentPath),
    `real component required for behavioral contract: ${componentRelativePath}`,
  );
  const runtime = createNodeComponentRuntime(scenario);
  const targetId = `/@sl008/${componentRelativePath.replaceAll('\\', '/')}`;
  const vite = await createViteServer({
    root: path.join(dirname, '..'),
    logLevel: 'silent',
    appType: 'custom',
    esbuild: {
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
    },
    resolve: {
      alias: {
        react: '\0sl008-react',
        'react/jsx-runtime': '\0sl008-react-jsx-runtime',
        'react-router-dom': '\0sl008-router',
      },
    },
    plugins: [{
      name: 'sl008-node-runtime-mocks',
      enforce: 'pre',
      resolveId(source) {
        if (source === targetId) return targetId;
        if (
          source === '\0sl008-react'
          || source === '\0sl008-react-jsx-runtime'
          || source === '\0sl008-router'
        ) {
          return source;
        }
        if (source === 'react') return '\0sl008-react';
        if (source === 'react/jsx-runtime') return '\0sl008-react-jsx-runtime';
        if (source === 'react-router-dom') return '\0sl008-router';
        if (source.endsWith('/hooks/useAuth.js')) return '\0sl008-auth';
        if (source.endsWith('/services/reviewService.js')) return '\0sl008-review-service';
        if (source.endsWith('/services/supportService.js')) return '\0sl008-support-service';
        if (source.endsWith('.css')) return '\0sl008-empty-css';
        return null;
      },
      load(id) {
        if (id === targetId) {
          return `import Component from ${JSON.stringify(componentPath)}; export default Component;`;
        }
        if (id === '\0sl008-react') {
          return `
            const runtime = globalThis.__SL008_RUNTIME__;
            export const createElement = runtime.createElement;
            export const Fragment = runtime.Fragment;
            export const useState = runtime.useState;
            export const useRef = runtime.useRef;
            export const useMemo = runtime.useMemo;
            export const useCallback = runtime.useCallback;
            export const useEffect = runtime.useEffect;
            export const useLayoutEffect = runtime.useLayoutEffect;
            export const createContext = runtime.createContext;
            export const useContext = runtime.useContext;
            export default runtime.React;
          `;
        }
        if (id === '\0sl008-react-jsx-runtime') {
          return `
            const runtime = globalThis.__SL008_RUNTIME__;
            export const jsx = runtime.createElement;
            export const jsxs = runtime.createElement;
            export const Fragment = runtime.Fragment;
          `;
        }
        if (id === '\0sl008-router') {
          return `
            const runtime = globalThis.__SL008_RUNTIME__;
            export const Link = runtime.Link;
            export const Outlet = runtime.Outlet;
            export const useParams = runtime.useParams;
            export const useNavigate = runtime.useNavigate;
            export const MemoryRouter = ({ children }) => children;
          `;
        }
        if (id === '\0sl008-auth') {
          return 'export default globalThis.__SL008_RUNTIME__.useAuth;';
        }
        if (id === '\0sl008-review-service') {
          return 'export const reviewService = globalThis.__SL008_RUNTIME__.serviceProxy("review");';
        }
        if (id === '\0sl008-support-service') {
          return 'export const supportService = globalThis.__SL008_RUNTIME__.serviceProxy("support");';
        }
        if (id === '\0sl008-empty-css') return '';
        return null;
      },
    }],
    server: { middlewareMode: true },
    ssr: { noExternal: true },
  });
  try {
    const module = await vite.ssrLoadModule(targetId);
    assert.equal(typeof module.default, 'function', `${componentRelativePath} must export a component`);
    runtime.mount(module.default, props);
    await runtime.flush();
    return runtime;
  } finally {
    await vite.close();
  }
}

async function assertDeferredMutation({
  componentPath,
  method,
  controlAction = method,
  scenario,
  props,
}) {
  const runtime = await renderRealComponent(componentPath, {
    ...scenario,
    deferredMethods: [...new Set([...(scenario.deferredMethods || []), method])],
  }, props);
  let controls = runtime.findControls(controlAction);
  assert.equal(controls.length, 1, `${method} must render exactly one behavioral control`);
  runtime.invoke(controls[0]);
  runtime.invoke(controls[0]);
  await runtime.flush();
  assert.equal(
    runtime.calls.filter((call) => call.method === method).length,
    1,
    `${method} must ignore repeated same-tick events while pending`,
  );
  controls = runtime.findControls(controlAction);
  assert.equal(controls.length, 1, `${method} control must remain rendered while pending`);
  assert.equal(
    controls[0].props.disabled,
    true,
    `${method} control must be disabled while pending`,
  );
  await runtime.settle(method, 'reject', new Error(`${method} failed`));
  controls = runtime.findControls(controlAction);
  assert.equal(controls.length, 1, `${method} control must remain rendered after rejection`);
  assert.equal(
    controls[0].props.disabled,
    false,
    `${method} control must unlock in finally after rejection`,
  );
}

async function assertActionHiddenForActor({
  componentPath,
  method,
  scenario,
  props,
}) {
  const runtime = await renderRealComponent(componentPath, scenario, props);
  assert.deepEqual(
    runtime.findControls(method),
    [],
    `${method} must be hidden for a disallowed actor`,
  );
  assert.equal(
    runtime.calls.some((call) => call.method === method),
    false,
    `${method} must not be invoked for a disallowed actor`,
  );
}

function clientSource(relativePath) {
  const filename = path.join(dirname, '..', relativePath);
  if (!existsSync(filename)) return '';
  return readFileSync(filename, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function customerReviewRouteComponent(appSource, readSource = clientSource) {
  const route = /<Route\b(?=[\s\S]{0,240}\bpath=["']reviews["'])[\s\S]{0,1000}?<RoleRoute\b[^>]*allowedRoles=\{\[['"]Customer['"]\]\}[^>]*>[\s\S]{0,300}?<(\w+)\s*\/>[\s\S]{0,300}?<\/RoleRoute>[\s\S]{0,120}?\/>/.exec(
    appSource,
  );
  assert.ok(
    route,
    'expected /reviews to render one Customer-protected component',
  );
  const componentName = route[1];
  const imported = new RegExp(
    `import\\s+${componentName}\\s+from\\s+['"]([^'"]+)['"]`,
  ).exec(appSource);
  assert.ok(imported, `${componentName} must be a real default import in App.jsx`);
  const componentPath = imported[1].replace(/^\.\//, '');
  const componentSource = readSource(componentPath);
  assert.ok(componentSource, `${componentName} route component source must exist`);
  return { componentName, componentPath, componentSource };
}

function assertCustomerReviewManagementRoute(appSource, readSource = clientSource) {
  const route = customerReviewRouteComponent(appSource, readSource);
  const loadOwn = boundHandler(route.componentSource, 'reviewService', 'listOwn');
  for (const field of ['page', 'pageSize']) {
    assert.match(loadOwn.body, new RegExp(`\\b${field}\\b`));
  }

  const ownReview = renderedMap(
    route.componentSource,
    ['ownReviews', 'customerReviews'],
  );
  for (const field of [
    'rating',
    'content',
    'publicationStatus',
    'moderationStatus',
    'version',
    'historySummary',
  ]) {
    assert.match(ownReview, new RegExp(`review\\.${field}\\b`));
  }
  assert.doesNotMatch(
    ownReview,
    /customerId|orderId|orderDetailId|email|phone|address/,
  );
  assert.match(
    route.componentSource,
    /(?:ownReviewPage|reviewPage)[\s\S]{0,1400}(?:totalPages|pageSize)[\s\S]{0,1400}(?:onClick|onChange)/,
  );
  return route;
}

function assertImportedAndMounted(parent, component, importPath, requiredProp) {
  assert.match(
    parent,
    new RegExp(`import\\s+${component}\\s+from\\s+['"]${importPath.replaceAll('/', '\\/')}['"]`),
  );
  assert.match(
    parent,
    new RegExp(`<${component}\\b[^>]*\\b${requiredProp}=`),
  );
}

function closingBrace(source, openingBrace) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function asyncHandlerBodies(source) {
  const declaration = /async\s+function\s+(\w+)\s*\([^)]*\)\s*\{|(?:const|let)\s+(\w+)\s*=\s*async\s*(?:\([^)]*\)|\w+)\s*=>\s*\{/g;
  const handlers = [];
  for (const match of source.matchAll(declaration)) {
    const openingBrace = match.index + match[0].lastIndexOf('{');
    const end = closingBrace(source, openingBrace);
    assert.notEqual(end, -1, `unbalanced handler ${match[1] || match[2]}`);
    handlers.push({
      name: match[1] || match[2],
      body: source.slice(openingBrace + 1, end),
      start: match.index,
      end,
    });
  }
  return handlers;
}

function boundHandler(source, serviceName, methodName, bodyPattern) {
  const serviceCall = new RegExp(`${serviceName}\\.${methodName}\\s*\\(`);
  const match = asyncHandlerBodies(source).find(
    (handler) => serviceCall.test(handler.body)
      && (!bodyPattern || bodyPattern.test(handler.body)),
  );
  assert.ok(
    match,
    `expected one bounded async handler invoking ${serviceName}.${methodName}()`
      + (bodyPattern ? ' with the required payload' : ''),
  );
  return match;
}

function assertBoundHandler(
  source,
  serviceName,
  methodName,
  event = 'onClick|onSubmit',
  bodyPattern,
) {
  const handler = boundHandler(source, serviceName, methodName, bodyPattern);
  assert.match(source, new RegExp(`(?:${event})\\s*=\\s*\\{${handler.name}\\}`));
  return handler.name;
}

function renderedMap(source, collectionName, distance = 2400) {
  const candidates = Array.isArray(collectionName) ? collectionName : [collectionName];
  const mapCall = candidates
    .map((candidate) => ({
      candidate,
      match: new RegExp(`${candidate}\\.map\\s*\\(`).exec(source),
    }))
    .find((candidate) => candidate.match);
  assert.ok(mapCall, `expected ${candidates.join(' or ')}.map() in rendered JSX`);
  return source.slice(mapCall.match.index, mapCall.match.index + distance);
}

function fieldElement(source, fieldName) {
  const element = new RegExp(
    `<(?:input|textarea|select)\\b(?=[^>]*(?:name|id)=["']${fieldName}["'])[^>]*>`,
  ).exec(source);
  assert.ok(element, `expected rendered ${fieldName} control`);
  return element[0];
}

function createRequestCapture(factory) {
  const requests = [];
  const service = factory({
    baseUrl: 'http://api.test/api',
    fetcher: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'result-1',
            version: 1,
            items: [],
            total: 0,
            page: 1,
            pageSize: 20,
            totalPages: 0,
            averageRating: 0,
          },
        }),
      };
    },
  });
  return { service, requests };
}

async function assertCommandRequest({
  factory,
  method,
  args,
  expectedUrl,
  expectedMethod,
  expectedKey,
  expectedBody,
}) {
  const { service, requests } = createRequestCapture(factory);
  assert.equal(typeof service[method], 'function', `client service must expose ${method}()`);
  await service[method](...args);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `http://api.test/api${expectedUrl}`);
  assert.equal(requests[0].options.method, expectedMethod);
  assert.equal(requests[0].options.headers['Idempotency-Key'], expectedKey);
  assert.deepEqual(JSON.parse(requests[0].options.body), expectedBody);
}

describe('SL-008 Review UI integration contract', () => {
  it('AT-150 imports and mounts ProductReviewPanel with an eligible selector and no raw identifier input', () => {
    const detail = clientSource('pages/public/ProductDetailPage.jsx');
    const panel = clientSource('components/review/ProductReviewPanel.jsx');

    assertImportedAndMounted(
      detail,
      'ProductReviewPanel',
      '../../components/review/ProductReviewPanel.jsx',
      'productId',
    );
    assert.match(panel, /reviewService\.(?:listEligibility|listEligibleOrderDetails)\s*\(/);
    assert.match(
      panel,
      /<select\b[^>]*(?:name|id)=["']orderDetailId["'][\s\S]{0,1200}(?:eligibleOrderDetails|reviewEligibility)\.map\s*\(/i,
    );
    assert.doesNotMatch(
      panel,
      /<input\b[^>]*(?:name|id)=["'][^"']*(?:orderId|orderDetailId|ObjectId)/i,
    );
    assertBoundHandler(
      panel,
      'reviewService',
      'createReview',
      'onSubmit',
      /orderDetailId[\s\S]{0,500}rating[\s\S]{0,500}content[\s\S]{0,500}expectedVersion/,
    );
  });

  it('AT-154 binds integer rating controls and optional normalized text to a live 0/1000 counter', () => {
    const panel = clientSource('components/review/ProductReviewPanel.jsx');

    assert.match(panel, /\[1,\s*2,\s*3,\s*4,\s*5\]|min=["']1["'][^>]*max=["']5["']/);
    assert.match(panel, /maxLength=\{?1000\}?/);
    assert.match(
      panel,
      /<textarea\b[^>]*(?:name|id)=["']content["'][^>]*maxLength=\{?1000\}?[\s\S]{0,500}\{[^}]*content\.length[^}]*\}\s*\/\s*1000/,
    );
    assert.doesNotMatch(panel, /<textarea\b[^>]*required/);
  });

  it('AT-156 renders only the public-safe masked/verified Review projection', () => {
    const list = clientSource('components/review/PublicReviewList.jsx');
    const itemRender = renderedMap(list, 'reviews');

    for (const field of [
      'displayName',
      'verifiedPurchase',
      'rating',
      'content',
      'createdAt',
      'updatedAt',
    ]) {
      assert.match(itemRender, new RegExp(`review\\.${field}\\b`));
    }
    assert.doesNotMatch(
      list,
      /customerId|orderId|orderDetailId|email|phone|moderationReason|staffId/,
    );
  });

  it('AT-157 binds Customer withdraw/republish separately from Staff moderation', async () => {
    const panel = clientSource('components/review/ProductReviewPanel.jsx');
    const moderation = clientSource('pages/staff/ReviewModerationPage.jsx');

    const withdraw = assertBoundHandler(
      panel,
      'reviewService',
      'setPublication',
      'onClick|onSubmit',
      /publicationStatus\s*:\s*['"]Withdrawn['"][\s\S]{0,500}expectedVersion/,
    );
    const republish = assertBoundHandler(
      panel,
      'reviewService',
      'setPublication',
      'onClick|onSubmit',
      /publicationStatus\s*:\s*['"]Published['"][\s\S]{0,500}expectedVersion/,
    );
    assert.notEqual(withdraw, republish);
    const ownReview = renderedMap(panel, ['ownReviews', 'customerReviews']);
    assert.match(ownReview, /review\.publicationStatus/);
    assert.match(ownReview, /review\.moderationStatus/);
    assert.match(
      ownReview,
      /Customer publication|Your publication/i,
    );
    assert.match(
      ownReview,
      /Staff moderation|Moderated by Staff/i,
    );
    assert.match(
      ownReview,
      /publicationStatus\s*===\s*['"]Published['"][\s\S]{0,1200}onClick\s*=\s*\{?[^}]*withdraw/i,
    );
    assert.match(
      ownReview,
      /publicationStatus\s*===\s*['"]Withdrawn['"][\s\S]{0,1200}onClick\s*=\s*\{?[^}]*republish/i,
    );
    assertBoundHandler(
      moderation,
      'reviewService',
      'moderate',
      'onSubmit',
      /moderationStatus[\s\S]{0,500}reason[\s\S]{0,500}expectedVersion/,
    );
    assert.match(
      moderation,
      /Staff moderation|Moderation decision|Moderated by Staff/i,
    );
    await assertDeferredMutation({
      componentPath: 'pages/staff/ReviewModerationPage.jsx',
      method: 'moderate',
      scenario: {
        actor: { id: 'staff-a', role: 'Staff', status: 'Active' },
        responses: {
          listModeration: {
            items: [{
              id: 'review-1',
              rating: 5,
              content: 'Safe Review',
              publicationStatus: 'Published',
              moderationStatus: 'Allowed',
              version: 1,
            }],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          },
        },
      },
    });
  });

  it('AT-158 binds Customer edit, exposes no delete, and gives Staff no content-edit handler', () => {
    const panel = clientSource('components/review/ProductReviewPanel.jsx');
    const moderation = clientSource('pages/staff/ReviewModerationPage.jsx');

    assertBoundHandler(
      panel,
      'reviewService',
      'updateReview',
      'onSubmit',
      /rating[\s\S]{0,500}content[\s\S]{0,500}expectedVersion/,
    );
    assert.doesNotMatch(panel, /deleteReview|removeReview/);
    assert.doesNotMatch(moderation, /updateReview|deleteReview|setPublication/);
  });

  it('AT-160 renders Review controls that deduplicate same-tick events and unlock after rejection', async () => {
    const panelScenario = {
      actor: { id: 'customer-1', role: 'Customer' },
      responses: {
        listOwn: {
          items: [{
            id: 'review-1',
            productId: 'product-1',
            rating: 5,
            content: 'Safe Review',
            publicationStatus: 'Published',
            moderationStatus: 'Allowed',
            version: 1,
            historySummary: {
              contentEntries: 1,
              publicationEntries: 0,
              moderationEntries: 0,
            },
          }],
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        },
        listEligibility: {
          items: [{ id: 'eligible-1', orderCode: 'ORD-1' }],
          total: 1,
        },
      },
    };
    for (const descriptor of [
      { method: 'createReview' },
      { method: 'updateReview' },
      { method: 'setPublication', controlAction: 'setPublication:Withdrawn' },
      { method: 'setPublication', controlAction: 'setPublication:Published' },
    ]) {
      await assertDeferredMutation({
        componentPath: 'components/review/ProductReviewPanel.jsx',
        ...descriptor,
        scenario: panelScenario,
        props: { productId: 'product-1' },
      });
    }
    await assertDeferredMutation({
      componentPath: 'pages/staff/ReviewModerationPage.jsx',
      method: 'moderate',
      scenario: {
        actor: { id: 'staff-a', role: 'Staff' },
        responses: {
          listModeration: {
            items: [{
              id: 'review-1',
              productId: 'product-1',
              rating: 5,
              content: 'Safe Review',
              publicationStatus: 'Published',
              moderationStatus: 'Allowed',
              version: 1,
            }],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          },
        },
      },
    });
  });

  it('AT-173 wires Customer own Review management to its protected safe paged read', async () => {
    const dummyApp = `
      import DummyReviewsPage from './pages/customer/DummyReviewsPage.jsx';
      <Route
        path="reviews"
        element={
          <RoleRoute allowedRoles={['Customer']}>
            <DummyReviewsPage />
          </RoleRoute>
        }
      />
    `;
    assert.throws(
      () => assertCustomerReviewManagementRoute(
        dummyApp,
        () => 'export default function DummyReviewsPage() { return <div>dummy</div>; }',
      ),
      /expected one bounded async handler invoking reviewService\.listOwn\(\)/,
    );
    const app = clientSource('App.jsx');
    assertCustomerReviewManagementRoute(app);

    const { service, requests } = createRequestCapture(createReviewService);
    assert.equal(typeof service.listOwn, 'function');
    await service.listOwn({ page: 2, pageSize: 20 });
    assert.equal(
      requests[0].url,
      'http://api.test/api/customer/reviews?page=2&pageSize=20',
    );
  });

  it('AT-159 renders server aggregate/paging and sends public Review page parameters', async () => {
    const list = clientSource('components/review/PublicReviewList.jsx');
    assert.match(list, /averageRating\.toFixed\(1\)/);
    assert.match(
      list,
      /(?:page|currentPage)[\s\S]{0,1200}totalPages[\s\S]{0,1200}(?:onClick|onChange)/,
    );
    assert.match(list, /pageSize/);

    const { service, requests } = createRequestCapture(createReviewService);
    assert.equal(typeof service.listPublic, 'function');
    await service.listPublic('product-1', { page: 2, pageSize: 20 });
    assert.equal(
      requests[0].url,
      'http://api.test/api/products/product-1/reviews?page=2&pageSize=20',
    );
  });
});

describe('SL-008 Review client command HTTP contract', () => {
  it('AT-160 sends createReview Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createReviewService,
      method: 'createReview',
      args: [
        'product-1',
        {
          orderDetailId: 'eligible-1',
          rating: 5,
          content: '',
          expectedVersion: 0,
        },
        { idempotencyKey: 'review-create-0001' },
      ],
      expectedUrl: '/products/product-1/reviews',
      expectedMethod: 'POST',
      expectedKey: 'review-create-0001',
      expectedBody: {
        orderDetailId: 'eligible-1',
        rating: 5,
        content: '',
        expectedVersion: 0,
      },
    });
  });

  it('AT-160 sends updateReview Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createReviewService,
      method: 'updateReview',
      args: [
        'review-1',
        { rating: 4, content: 'Edited', expectedVersion: 1 },
        { idempotencyKey: 'review-update-0001' },
      ],
      expectedUrl: '/reviews/review-1',
      expectedMethod: 'PATCH',
      expectedKey: 'review-update-0001',
      expectedBody: { rating: 4, content: 'Edited', expectedVersion: 1 },
    });
  });

  it('AT-160 sends setPublication Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createReviewService,
      method: 'setPublication',
      args: [
        'review-1',
        { publicationStatus: 'Withdrawn', expectedVersion: 2 },
        { idempotencyKey: 'review-publication-0001' },
      ],
      expectedUrl: '/reviews/review-1/publication',
      expectedMethod: 'PATCH',
      expectedKey: 'review-publication-0001',
      expectedBody: { publicationStatus: 'Withdrawn', expectedVersion: 2 },
    });
  });

  it('AT-160 sends moderate Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createReviewService,
      method: 'moderate',
      args: [
        'review-1',
        {
          moderationStatus: 'HiddenByStaff',
          reason: 'Contains prohibited promotional content',
          expectedVersion: 3,
        },
        { idempotencyKey: 'review-moderate-0001' },
      ],
      expectedUrl: '/staff/reviews/review-1/moderation',
      expectedMethod: 'PATCH',
      expectedKey: 'review-moderate-0001',
      expectedBody: {
        moderationStatus: 'HiddenByStaff',
        reason: 'Contains prohibited promotional content',
        expectedVersion: 3,
      },
    });
  });
});

describe('SL-008 Customer Support UI integration contract', () => {
  it('AT-161 binds all seven Support types to type-dependent authorized selectors', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    assert.match(
      page,
      /(?:SUPPORT_TYPES|supportTypes)\s*=\s*\[[^\]]*['"]Order['"][^\]]*['"]Payment['"][^\]]*['"]ReturnRefund['"][^\]]*['"]Exchange['"][^\]]*['"]Product['"][^\]]*['"]Account['"][^\]]*['"]Other['"][^\]]*\]/,
    );
    assert.match(
      page,
      /<select\b[^>]*(?:name|id)=["']type["'][\s\S]{0,1000}(?:SUPPORT_TYPES|supportTypes)\.map\s*\(/,
    );
    assert.match(page, /supportService\.(?:listEligibleOrders|listOwnedOrders)\s*\(/);
    assert.match(page, /supportService\.(?:listActiveProducts|listProductsForSupport)\s*\(/);
    assert.match(
      page,
      /<select\b[^>]*(?:name|id)=["']orderId["'][\s\S]{0,1200}(?:eligibleOrders|ownedOrders|orderOptions)\.map\s*\(/,
    );
    assert.match(
      page,
      /<select\b[^>]*(?:name|id)=["']productId["'][\s\S]{0,1200}(?:activeProducts|productOptions)\.map\s*\(/,
    );
    assert.match(
      page,
      /(?:requiresOrder|ORDER_REQUIRED_TYPES\.includes\([^)]*type\))[\s\S]{0,1600}<select\b[^>]*(?:name|id)=["']orderId["'][^>]*required/,
    );
    assert.match(
      page,
      /(?:requiresProduct|(?:form|draft)\.type\s*===\s*['"]Product['"])[\s\S]{0,1600}<select\b[^>]*(?:name|id)=["']productId["'][^>]*required/,
    );
    assert.doesNotMatch(
      page,
      /<input\b[^>]*(?:name|id)=["'][^"']*(?:orderId|productId|ObjectId)/i,
    );
    const create = boundHandler(page, 'supportService', 'createRequest');
    assert.match(page, new RegExp(`onSubmit\\s*=\\s*\\{${create.name}\\}`));
    for (const field of [
      'type',
      'subject',
      'initialMessage',
      'orderId',
      'productId',
      'expectedVersion',
    ]) {
      assert.match(create.body, new RegExp(`\\b${field}\\b`));
    }
    assert.match(
      page,
      /(?:name|id)=["']subject["'][^>]*maxLength=\{?120\}?[\s\S]{0,500}\{[^}]*subject\.length[^}]*\}\s*\/\s*120/,
    );
    assert.match(
      page,
      /(?:name|id)=["']initialMessage["'][^>]*maxLength=\{?2000\}?[\s\S]{0,500}\{[^}]*initialMessage\.length[^}]*\}\s*\/\s*2000/,
    );
    assert.match(page, /privacy|do not include|sensitive|personal information/i);
    assert.doesNotMatch(
      page,
      /(?:name|id)=["'][^"']*(?:priority|assignee|attachment)[^"']*["']|<input\b[^>]*type=["']file["']/i,
    );
    assert.doesNotMatch(
      page,
      /supportService\.(?:changePriority|transfer|uploadAttachment|addAttachment)\s*\(/,
    );
    assert.doesNotMatch(
      page,
      /<(?:input|textarea|select|button)\b(?=[^>]*(?:priority|assignee|attachment|type=["']file["']))[^>]*>/i,
    );
  });

  it('AT-162 requires an authorized Order selector and renders private Order field errors', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    assert.match(page, /fieldErrors\.orderId|fieldErrors\[['"]orderId['"]\]/);
    assert.match(
      page,
      /(?:Order|Payment|ReturnRefund|Exchange)[\s\S]{0,1800}(?:requiresOrder|ORDER_REQUIRED_TYPES)/,
    );
    assert.doesNotMatch(page, /customerId|ObjectId|email|phone/);
  });

  it('AT-163 requires an Active Product selector and renders private Product field errors', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    assert.match(page, /fieldErrors\.productId|fieldErrors\[['"]productId['"]\]/);
    assert.match(
      page,
      /(?:requiresProduct|(?:form|draft)\.type\s*===\s*['"]Product['"])[\s\S]{0,1800}(?:activeProducts|productOptions)/,
    );
    assert.match(page, /productId[\s\S]{0,1200}orderId|orderId[\s\S]{0,1200}productId/);
    assert.doesNotMatch(page, /customerId|ObjectId|email|phone/);
  });

  it('AT-164 keeps Account/Other Order/Product refs optional while using the same authorized selectors', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    assert.match(
      page,
      /(?:OPTIONAL_REFERENCE_TYPES|optionalReferenceTypes)\s*=\s*\[[^\]]*['"]Account['"][^\]]*['"]Other['"][^\]]*\]/,
    );
    assert.match(
      page,
      /(?:allowsOrder|OPTIONAL_REFERENCE_TYPES[\s\S]{0,200}\.includes\([^)]*type\))[\s\S]{0,1600}(?:name|id)=["']orderId["']/,
    );
    assert.match(
      page,
      /(?:allowsProduct|OPTIONAL_REFERENCE_TYPES[\s\S]{0,200}\.includes\([^)]*type\))[\s\S]{0,1600}(?:name|id)=["']productId["']/,
    );
    assert.doesNotMatch(
      page,
      /(?:Account|Other)[\s\S]{0,500}(?:name|id)=["'](?:orderId|productId)["'][^>]*required/,
    );
  });

  it('AT-165 renders immutable paged messages and binds appendMessage', () => {
    const page = clientSource('pages/customer/SupportPage.jsx');
    const timeline = renderedMap(page, 'messages');

    assert.match(timeline, /message\.content/);
    assert.match(timeline, /message\.(?:actorRole|role)/);
    assert.match(timeline, /message\.createdAt/);
    assert.match(
      page,
      /(?:messagePage|page)[\s\S]{0,1200}messages?\.totalPages[\s\S]{0,1200}(?:onClick|onChange)/,
    );
    assert.match(page, /messagePageSize|messages?\.pageSize/);
    assert.doesNotMatch(page, /editMessage|deleteMessage|removeMessage/);
    assertBoundHandler(
      page,
      'supportService',
      'appendMessage',
      'onSubmit',
      /message[\s\S]{0,500}expectedVersion/,
    );
  });

  it('AT-166 conditionally lets the owner message only New/InProgress tickets', async () => {
    const page = clientSource('pages/customer/SupportPage.jsx');
    assertBoundHandler(page, 'supportService', 'appendMessage', 'onSubmit');
    const scenario = {
      actor: { id: 'customer-1', role: 'Customer' },
      responses: {
        listOwn: {
          items: [{
            id: 'ticket-1',
            status: 'InProgress',
            priority: 'Normal',
            assigneeId: 'staff-a',
            version: 2,
            messages: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 },
          }],
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        },
      },
    };
    await assertDeferredMutation({
      componentPath: 'pages/customer/SupportPage.jsx',
      method: 'appendMessage',
      scenario,
    });
    await assertActionHiddenForActor({
      componentPath: 'pages/customer/SupportPage.jsx',
      method: 'appendMessage',
      scenario: {
        ...scenario,
        responses: {
          listOwn: {
            ...scenario.responses.listOwn,
            items: [{ ...scenario.responses.listOwn.items[0], status: 'Resolved' }],
          },
        },
      },
    });
  });

  it('AT-171 binds create, New-only unassigned withdraw, and final-response display', async () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    assertBoundHandler(page, 'supportService', 'createRequest', 'onSubmit');
    assertBoundHandler(page, 'supportService', 'withdraw');
    const timeline = renderedMap(page, 'messages');
    assert.match(timeline, /finalMessage|resolutionMessage|message\.content/);
    const scenario = {
      actor: { id: 'customer-1', role: 'Customer' },
      responses: {
        listOwn: {
          items: [{
            id: 'ticket-1',
            status: 'New',
            priority: 'Normal',
            assigneeId: null,
            version: 1,
            messages: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 },
          }],
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        },
      },
    };
    await assertDeferredMutation({
      componentPath: 'pages/customer/SupportPage.jsx',
      method: 'withdraw',
      scenario,
    });
    await assertActionHiddenForActor({
      componentPath: 'pages/customer/SupportPage.jsx',
      method: 'withdraw',
      scenario: {
        ...scenario,
        responses: {
          listOwn: {
            ...scenario.responses.listOwn,
            items: [{ ...scenario.responses.listOwn.items[0], status: 'InProgress', assigneeId: 'staff-a' }],
          },
        },
      },
    });
  });

  it('AT-172 binds reopen/message to the server deadline and disables it after expiry', async () => {
    const page = clientSource('pages/customer/SupportPage.jsx');

    assertBoundHandler(
      page,
      'supportService',
      'reopen',
      'onSubmit|onClick',
      /message[\s\S]{0,500}expectedVersion/,
    );
    assert.match(
      page,
      /reopenDeadline[\s\S]{0,1200}disabled=\{[^}]*(?:canReopen|deadline|expired)/i,
    );
    await assertDeferredMutation({
      componentPath: 'pages/customer/SupportPage.jsx',
      method: 'reopen',
      scenario: {
        actor: { id: 'customer-1', role: 'Customer' },
        responses: {
          listOwn: {
            items: [{
              id: 'ticket-1',
              status: 'Resolved',
              assigneeId: null,
              version: 3,
              reopenDeadline: '2026-07-27T12:00:00.000Z',
              messages: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 },
            }],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          },
        },
      },
    });
  });

  it('AT-174 renders Customer Support controls that deduplicate and unlock after rejection', async () => {
    const customerScenario = {
      actor: { id: 'customer-1', role: 'Customer' },
      responses: {
        listOwn: {
          items: [
            {
              id: 'ticket-1',
              ticketCode: 'SUP-0001',
              type: 'Order',
              subject: 'Delivery package issue',
              orderId: 'order-1',
              productId: null,
              status: 'New',
              priority: 'Normal',
              assigneeId: null,
              version: 1,
              messages: {
                items: [],
                total: 0,
                page: 1,
                pageSize: 20,
                totalPages: 0,
              },
            },
            {
              id: 'ticket-2',
              ticketCode: 'SUP-0002',
              type: 'Other',
              orderId: null,
              productId: null,
              subject: 'Resolved issue',
              status: 'Resolved',
              priority: 'Normal',
              assigneeId: null,
              version: 3,
              reopenDeadline: '2026-07-27T12:00:00.000Z',
              messages: {
                items: [],
                total: 0,
                page: 1,
                pageSize: 20,
                totalPages: 0,
              },
            },
          ],
          total: 2,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        },
        listMyRequests: {
          items: [],
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
        },
      },
    };
    for (const method of ['createRequest', 'appendMessage', 'withdraw', 'reopen']) {
      await assertDeferredMutation({
        componentPath: 'pages/customer/SupportPage.jsx',
        method,
        scenario: customerScenario,
        props: { ticketId: 'ticket-1' },
      });
    }
  });
});

describe('SL-008 Staff Support UI integration contract', () => {
  it('AT-167 binds the queue claim action to supportService.claim for the allowed actor', async () => {
    const queue = clientSource('pages/staff/SupportQueuePage.jsx');

    const claim = assertBoundHandler(queue, 'supportService', 'claim');
    assert.ok(claim);
    await assertDeferredMutation({
      componentPath: 'pages/staff/SupportQueuePage.jsx',
      method: 'claim',
      scenario: {
        actor: { id: 'staff-a', role: 'Staff', status: 'Active' },
        responses: {
          listOperational: {
            items: [{
              id: 'ticket-1',
              ticketCode: 'SUP-0001',
              status: 'New',
              priority: 'Normal',
              assigneeId: null,
              version: 1,
            }],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          },
        },
      },
    });
  });

  it('AT-168 conditionally mounts assignee-only messaging/priority/transfer/resolve controls', async () => {
    const detail = clientSource('pages/staff/SupportDetailPage.jsx');

    for (const method of ['appendMessage', 'changePriority', 'transfer', 'resolve']) {
      const handler = assertBoundHandler(detail, 'supportService', method, 'onClick|onSubmit');
      assert.ok(handler);
    }
    const baseScenario = {
      responses: {
        getDetail: {
          id: 'ticket-1',
          ticketCode: 'SUP-0001',
          type: 'Order',
          subject: 'Delivery package issue',
          status: 'InProgress',
          priority: 'Normal',
          assigneeId: 'staff-a',
          version: 2,
          messages: {
            items: [],
            total: 0,
            page: 1,
            pageSize: 20,
            totalPages: 0,
          },
          assignmentHistory: [],
          priorityHistory: [],
          resolutionHistory: [],
        },
        listActiveStaff: [{ id: 'staff-a', status: 'Active' }],
      },
      params: { ticketId: 'ticket-1' },
    };
    for (const method of ['appendMessage', 'changePriority', 'transfer', 'resolve']) {
      await assertDeferredMutation({
        componentPath: 'pages/staff/SupportDetailPage.jsx',
        method,
        scenario: {
          ...baseScenario,
          actor: { id: 'staff-a', role: 'Staff', status: 'Active' },
        },
      });
      await assertActionHiddenForActor({
        componentPath: 'pages/staff/SupportDetailPage.jsx',
        method,
        scenario: {
          ...baseScenario,
          actor: { id: 'staff-b', role: 'Staff', status: 'Active' },
        },
      });
    }
  });

  it('AT-169 binds priority/transfer reasons and limits targets to Active Staff', async () => {
    const detail = clientSource('pages/staff/SupportDetailPage.jsx');

    const priorityHandler = assertBoundHandler(
      detail,
      'supportService',
      'changePriority',
      'onSubmit',
      /priority[\s\S]{0,500}reason[\s\S]{0,500}expectedVersion/,
    );
    const transferHandler = assertBoundHandler(
      detail,
      'supportService',
      'transfer',
      'onSubmit',
      /assigneeId[\s\S]{0,500}reason[\s\S]{0,500}expectedVersion/,
    );
    assert.ok(priorityHandler);
    assert.ok(transferHandler);
    assert.match(
      detail,
      /<select\b[^>]*(?:name|id)=["']priority["'][\s\S]{0,1200}['"]Low['"][\s\S]{0,1200}['"]Normal['"][\s\S]{0,1200}['"]High['"][\s\S]{0,1200}['"]Urgent['"]/,
    );
    assert.match(
      detail,
      /<select\b[^>]*(?:name|id)=["']assigneeId["'][\s\S]{0,1200}(?:activeStaff|staffOptions)\.map\s*\(/,
    );
    assert.match(detail, /supportService\.(?:listActiveStaff|listTransferTargets)\s*\(/);
    for (const field of ['priorityReason', 'transferReason']) {
      const reasonInput = fieldElement(detail, field);
      assert.match(reasonInput, /\brequired\b/);
      assert.match(reasonInput, /minLength=\{?5\}?/);
      assert.match(reasonInput, /maxLength=\{?500\}?/);
    }
    const assignmentTimeline = renderedMap(detail, 'assignmentHistory');
    const priorityTimeline = renderedMap(detail, 'priorityHistory');
    assert.match(assignmentTimeline, /reason[\s\S]{0,1000}(?:actor|createdAt)/);
    assert.match(priorityTimeline, /reason[\s\S]{0,1000}(?:actor|createdAt)/);
    const detailScenario = {
      actor: { id: 'staff-a', role: 'Staff', status: 'Active' },
      params: { ticketId: 'ticket-1' },
      responses: {
        getDetail: {
          id: 'ticket-1',
          status: 'InProgress',
          priority: 'Normal',
          assigneeId: 'staff-a',
          version: 2,
          messages: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 },
          assignmentHistory: [],
          priorityHistory: [],
          resolutionHistory: [],
        },
        listActiveStaff: [{ id: 'staff-b', status: 'Active' }],
      },
    };
    await assertDeferredMutation({
      componentPath: 'pages/staff/SupportDetailPage.jsx',
      method: 'changePriority',
      scenario: detailScenario,
    });
    await assertDeferredMutation({
      componentPath: 'pages/staff/SupportDetailPage.jsx',
      method: 'transfer',
      scenario: detailScenario,
    });
  });

  it('AT-170 renders disabled-assignee recovery and a reclaim action without losing priority/history', async () => {
    const queue = clientSource('pages/staff/SupportQueuePage.jsx');
    const detail = clientSource('pages/staff/SupportDetailPage.jsx');

    const reclaim = assertBoundHandler(queue, 'supportService', 'claim');
    assert.ok(reclaim);
    assert.match(queue, /recovery|assigneeCleared|unassignedInProgress/i);
    assert.match(detail, /ticket\.priority|request\.priority/);
    const assignmentTimeline = renderedMap(detail, 'assignmentHistory');
    const messageTimeline = renderedMap(detail, 'messages');
    assert.match(assignmentTimeline, /beforeAssigneeId|afterAssigneeId|reason/);
    assert.match(messageTimeline, /message\.content[\s\S]{0,1000}message\.(?:actorRole|role)/);
    await assertDeferredMutation({
      componentPath: 'pages/staff/SupportQueuePage.jsx',
      method: 'claim',
      scenario: {
        actor: { id: 'staff-b', role: 'Staff', status: 'Active' },
        responses: {
          listOperational: {
            items: [{
              id: 'ticket-1',
              ticketCode: 'SUP-0001',
              status: 'InProgress',
              priority: 'High',
              assigneeId: null,
              version: 4,
              assigneeCleared: true,
            }],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          },
        },
      },
    });
  });

  it('AT-171 binds the final response to resolve and removes generic status mutation', async () => {
    const detail = clientSource('pages/staff/SupportDetailPage.jsx');

    const resolve = assertBoundHandler(
      detail,
      'supportService',
      'resolve',
      'onSubmit',
      /finalMessage[\s\S]{0,500}expectedVersion/,
    );
    assert.ok(resolve);
    assert.match(
      detail,
      /(?:name|id)=["']finalMessage["'][^>]*maxLength=\{?2000\}?/,
    );
    assert.doesNotMatch(detail, /respondToRequest|setStatus|updateStatus/);
    await assertDeferredMutation({
      componentPath: 'pages/staff/SupportDetailPage.jsx',
      method: 'resolve',
      scenario: {
        actor: { id: 'staff-a', role: 'Staff', status: 'Active' },
        params: { ticketId: 'ticket-1' },
        responses: {
          getDetail: {
            id: 'ticket-1',
            status: 'InProgress',
            priority: 'Normal',
            assigneeId: 'staff-a',
            version: 2,
            messages: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 },
            assignmentHistory: [],
            priorityHistory: [],
            resolutionHistory: [],
          },
        },
      },
    });
  });

  it('AT-173 sends type/date/status/priority/assignee paging filters and displays field errors', async () => {
    const queue = clientSource('pages/staff/SupportQueuePage.jsx');

    const loadQueue = boundHandler(queue, 'supportService', 'listOperational');
    for (const filter of [
      'type',
      'dateFrom',
      'dateTo',
      'status',
      'priority',
      'assigneeId',
      'page',
      'pageSize',
    ]) {
      assert.match(loadQueue.body, new RegExp(`\\b${filter}\\b`));
    }
    assert.match(queue, /fieldErrors\.(?:type|dateFrom|dateTo|status|priority|assigneeId)|fieldErrors\[/);

    const { service, requests } = createRequestCapture(createSupportService);
    assert.equal(typeof service.listOperational, 'function');
    await service.listOperational({
      type: 'Order',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      status: 'New',
      priority: 'Normal',
      assigneeId: 'unassigned',
      page: 1,
      pageSize: 20,
    });
    assert.equal(
      requests[0].url,
      'http://api.test/api/staff/support-requests'
        + '?type=Order&dateFrom=2026-07-01&dateTo=2026-07-31'
        + '&status=New&priority=Normal&assigneeId=unassigned&page=1&pageSize=20',
    );
  });

  it('AT-174 renders Staff Support controls that deduplicate and unlock after rejection', async () => {
    await assertDeferredMutation({
      componentPath: 'pages/staff/SupportQueuePage.jsx',
      method: 'claim',
      scenario: {
        actor: { id: 'staff-a', role: 'Staff', status: 'Active' },
        responses: {
          listOperational: {
            items: [{
              id: 'ticket-1',
              ticketCode: 'SUP-0001',
              status: 'New',
              priority: 'Normal',
              assigneeId: null,
              version: 1,
            }],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          },
        },
      },
    });
    const detailScenario = {
      actor: { id: 'staff-a', role: 'Staff', status: 'Active' },
      params: { ticketId: 'ticket-1' },
      responses: {
        getDetail: {
          id: 'ticket-1',
          status: 'InProgress',
          priority: 'Normal',
          assigneeId: 'staff-a',
          version: 2,
          messages: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 },
          assignmentHistory: [],
          priorityHistory: [],
          resolutionHistory: [],
        },
      },
    };
    for (const method of ['appendMessage', 'changePriority', 'transfer', 'resolve']) {
      await assertDeferredMutation({
        componentPath: 'pages/staff/SupportDetailPage.jsx',
        method,
        scenario: detailScenario,
      });
    }
  });
});

describe('SL-008 Support client command HTTP contract', () => {
  it('AT-174 sends createRequest Idempotency-Key and JSON expectedVersion', async () => {
    const body = {
      type: 'Other',
      subject: 'Need account help',
      initialMessage: 'Please help with account access.',
      expectedVersion: 0,
    };
    await assertCommandRequest({
      factory: createSupportService,
      method: 'createRequest',
      args: [body, { idempotencyKey: 'support-create-0001' }],
      expectedUrl: '/support-requests',
      expectedMethod: 'POST',
      expectedKey: 'support-create-0001',
      expectedBody: body,
    });
  });

  it('AT-174 sends claim Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createSupportService,
      method: 'claim',
      args: [
        'ticket-1',
        { expectedVersion: 1 },
        { idempotencyKey: 'support-claim-0001' },
      ],
      expectedUrl: '/staff/support-requests/ticket-1/claim',
      expectedMethod: 'POST',
      expectedKey: 'support-claim-0001',
      expectedBody: { expectedVersion: 1 },
    });
  });

  it('AT-174 sends Customer appendMessage Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createSupportService,
      method: 'appendMessage',
      args: [
        'ticket-1',
        { message: 'A customer follow-up.', expectedVersion: 2 },
        { idempotencyKey: 'support-message-customer-0001', scope: 'customer' },
      ],
      expectedUrl: '/support-requests/ticket-1/messages',
      expectedMethod: 'POST',
      expectedKey: 'support-message-customer-0001',
      expectedBody: { message: 'A customer follow-up.', expectedVersion: 2 },
    });
  });

  it('AT-174 sends Staff appendMessage Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createSupportService,
      method: 'appendMessage',
      args: [
        'ticket-1',
        { message: 'A Staff follow-up.', expectedVersion: 3 },
        { idempotencyKey: 'support-message-staff-0001', scope: 'staff' },
      ],
      expectedUrl: '/staff/support-requests/ticket-1/messages',
      expectedMethod: 'POST',
      expectedKey: 'support-message-staff-0001',
      expectedBody: { message: 'A Staff follow-up.', expectedVersion: 3 },
    });
  });

  it('AT-174 sends changePriority Idempotency-Key and JSON expectedVersion', async () => {
    const body = {
      priority: 'High',
      reason: 'Customer impact requires faster handling',
      expectedVersion: 4,
    };
    await assertCommandRequest({
      factory: createSupportService,
      method: 'changePriority',
      args: ['ticket-1', body, { idempotencyKey: 'support-priority-0001' }],
      expectedUrl: '/staff/support-requests/ticket-1/priority',
      expectedMethod: 'PATCH',
      expectedKey: 'support-priority-0001',
      expectedBody: body,
    });
  });

  it('AT-174 sends transfer Idempotency-Key and JSON expectedVersion', async () => {
    const body = {
      assigneeId: 'staff-b',
      reason: 'Specialist ownership transfer',
      expectedVersion: 5,
    };
    await assertCommandRequest({
      factory: createSupportService,
      method: 'transfer',
      args: ['ticket-1', body, { idempotencyKey: 'support-transfer-0001' }],
      expectedUrl: '/staff/support-requests/ticket-1/transfer',
      expectedMethod: 'PATCH',
      expectedKey: 'support-transfer-0001',
      expectedBody: body,
    });
  });

  it('AT-174 sends withdraw Idempotency-Key and JSON expectedVersion', async () => {
    await assertCommandRequest({
      factory: createSupportService,
      method: 'withdraw',
      args: [
        'ticket-1',
        { expectedVersion: 1 },
        { idempotencyKey: 'support-withdraw-0001' },
      ],
      expectedUrl: '/support-requests/ticket-1/withdraw',
      expectedMethod: 'PATCH',
      expectedKey: 'support-withdraw-0001',
      expectedBody: { expectedVersion: 1 },
    });
  });

  it('AT-174 sends resolve Idempotency-Key and JSON expectedVersion', async () => {
    const body = {
      finalMessage: 'The issue is resolved with a replacement.',
      expectedVersion: 6,
    };
    await assertCommandRequest({
      factory: createSupportService,
      method: 'resolve',
      args: ['ticket-1', body, { idempotencyKey: 'support-resolve-0001' }],
      expectedUrl: '/staff/support-requests/ticket-1/resolve',
      expectedMethod: 'POST',
      expectedKey: 'support-resolve-0001',
      expectedBody: body,
    });
  });

  it('AT-174 sends reopen Idempotency-Key and JSON expectedVersion', async () => {
    const body = { message: 'The same issue returned.', expectedVersion: 7 };
    await assertCommandRequest({
      factory: createSupportService,
      method: 'reopen',
      args: ['ticket-1', body, { idempotencyKey: 'support-reopen-0001' }],
      expectedUrl: '/support-requests/ticket-1/reopen',
      expectedMethod: 'POST',
      expectedKey: 'support-reopen-0001',
      expectedBody: body,
    });
  });
});

describe('SL-008 direct-navigation RBAC and privacy contract', () => {
  it('AT-173 guards Customer and Staff routes and gives Admin/Warehouse no SL-008 route', () => {
    const app = clientSource('App.jsx');

    assert.match(
      app,
      /path="support"[\s\S]{0,400}allowedRoles=\{\[['"]Customer['"]\]\}/,
    );
    customerReviewRouteComponent(app);
    assert.match(
      app,
      /path="staff\/support-requests"[\s\S]{0,400}allowedRoles=\{\[['"]Staff['"]\]\}/,
    );
    assert.match(
      app,
      /path="staff\/reviews"[\s\S]{0,400}allowedRoles=\{\[['"]Staff['"]\]\}/,
    );
    assert.match(
      app,
      /path="staff\/support-requests\/:ticketId"[\s\S]{0,400}allowedRoles=\{\[['"]Staff['"]\]\}/,
    );
    assert.match(
      app,
      /path="support\/:ticketId"[\s\S]{0,400}allowedRoles=\{\[['"]Customer['"]\]\}/,
    );
    assert.doesNotMatch(app, /path="admin\/(?:reviews|support(?:-requests)?)"/);
    assert.doesNotMatch(app, /path="warehouse\/(?:reviews|support(?:-requests)?)"/);
    assert.doesNotMatch(
      app,
      /path="(?:staff|admin|warehouse)\/customer\/reviews"/,
    );
  });

  it('AT-173 ties safe Review/Support projections to protected reads and exact paged HTTP routes', async () => {
    const customer = clientSource('pages/customer/SupportPage.jsx');
    const queue = clientSource('pages/staff/SupportQueuePage.jsx');
    const detail = clientSource('pages/staff/SupportDetailPage.jsx');
    const moderation = clientSource('pages/staff/ReviewModerationPage.jsx');
    const customerTickets = renderedMap(customer, ['tickets', 'requests']);
    const staffTickets = renderedMap(queue, ['tickets', 'requests']);
    const staffReviews = renderedMap(moderation, ['reviews', 'items']);
    const staffMessages = renderedMap(detail, 'messages');
    const rendered = [
      customerTickets,
      staffTickets,
      staffReviews,
      staffMessages,
    ].join('\n');

    assert.doesNotMatch(
      rendered,
      /\{[^}]*\.(?:customerId|orderId|productId|email|phone|ObjectId)[^}]*\}/,
    );
    assert.match(customerTickets, /ticketCode|subject|type|status/);
    assert.match(staffTickets, /ticketCode|type|status|priority|assignee/);
    assert.match(staffReviews, /rating|content|publicationStatus|moderationStatus/);
    assert.match(staffMessages, /message\.content[\s\S]{0,1000}message\.(?:actorRole|role)/);
    assert.match(queue, /fieldErrors/);
    assert.match(queue, /SUPPORT_FILTER_INVALID|invalid.*filter/i);

    const reviewCapture = createRequestCapture(createReviewService);
    assert.equal(typeof reviewCapture.service.listModeration, 'function');
    await reviewCapture.service.listModeration({
      page: 1,
      pageSize: 20,
      productId: 'product-1',
      publicationStatus: 'Published',
      moderationStatus: 'Allowed',
    });
    assert.equal(
      reviewCapture.requests[0].url,
      'http://api.test/api/staff/reviews'
        + '?page=1&pageSize=20&productId=product-1'
        + '&publicationStatus=Published&moderationStatus=Allowed',
    );

    const ownCapture = createRequestCapture(createSupportService);
    assert.equal(typeof ownCapture.service.listOwn, 'function');
    await ownCapture.service.listOwn({ page: 2, pageSize: 20 });
    assert.equal(
      ownCapture.requests[0].url,
      'http://api.test/api/support-requests/my?page=2&pageSize=20',
    );

    const detailCapture = createRequestCapture(createSupportService);
    assert.equal(typeof detailCapture.service.getDetail, 'function');
    await detailCapture.service.getDetail(
      'ticket-1',
      { page: 3, pageSize: 20 },
      { scope: 'staff' },
    );
    assert.equal(
      detailCapture.requests[0].url,
      'http://api.test/api/staff/support-requests/ticket-1?page=3&pageSize=20',
    );
  });
});
