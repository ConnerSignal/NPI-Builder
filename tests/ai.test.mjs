import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { saveAIConfig, loadAIConfig, getDefaultAIConfig, generateSection, testConnection, chatEndpoint, applyPrimaryPreset } from '../src/lib/ai.ts';
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key,value) };
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; storage.clear(); });
const config = () => ({ ...getDefaultAIConfig(), baseUrl: 'https://primary.example/v1', apiKey: 'primary-test-secret', model: 'chosen-model' });
const req = { artifactName: 'ProdBot', shortName: 'PRODBOT', fieldKey: 'Response', fieldGuidance: '', currentValue: '', projectContext: 'project-private', mode: 'generate', userInstruction: 'Hi' };
const success = () => new Response(JSON.stringify({ model: 'provider-model', choices: [{ message: { content: 'OK' } }] }));

test('settings edits preserve session keys while disk config excludes them', () => {
  const current = { ...config(), fallbackApiKey: 'fallback-secret' };
  const next = saveAIConfig({ model: 'new-model' }, current);
  assert.equal(next.apiKey,current.apiKey);
  assert.equal(next.fallbackApiKey,current.fallbackApiKey);
  assert.equal(next.model,'new-model');
  assert.equal(loadAIConfig().apiKey,'');
  assert.ok(!storage.get('npi-ai-config').includes('secret'));
});

test('switching provider clears the previous key', () => {
  assert.equal(applyPrimaryPreset(config(),'openai').apiKey,'');
});

test('test uses exact normalized endpoint, key, model and no project context', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url,'https://primary.example/v1/chat/completions');
    assert.equal(options.headers.Authorization,'Bearer primary-test-secret');
    const body=JSON.parse(options.body);
    assert.equal(body.model,'chosen-model');
    assert.equal(body.messages.length,1);
    assert.ok(!options.body.includes('project-private'));
    return success();
  };
  const result=await testConnection({ ...config(), apiKey: ' primary-test-secret ', model: ' chosen-model ', baseUrl: ' https://primary.example/v1/chat/completions/ ' });
  assert.equal(result.returnedModel,'provider-model');
  assert.equal(result.usedFallback,false);
});

test('a failed primary test never verifies fallback', async () => {
  let count=0;
  globalThis.fetch=async () => { count++; return new Response('quota',{status:429}); };
  await assert.rejects(testConnection({ ...config(), fallbackEnabled:true, fallbackBaseUrl:'https://fallback.example/v1', fallbackModel:'fallback', fallbackApiKey:'fallback-secret' }), /429/);
  assert.equal(count,1);
});

test('fallback response identifies its actual endpoint and model', async () => {
  const seen=[];
  globalThis.fetch=async (url, options) => {
    seen.push(url);
    if(seen.length===1) return new Response('busy',{status:503});
    assert.equal(options.headers.Authorization,'Bearer fallback-secret');
    assert.equal(JSON.parse(options.body).model,'fallback-model');
    return success();
  };
  let response;
  await generateSection({ ...config(), fallbackEnabled:true, fallbackBaseUrl:'https://fallback.example/v1', fallbackModel:'fallback-model', fallbackApiKey:'fallback-secret' },req,r=>{response=r;});
  assert.equal(response.usedFallback,true);
  assert.equal(response.endpoint,'https://fallback.example/v1/chat/completions');
  assert.equal(seen.length,2);
});

test('primary key cannot leak to another fallback endpoint', async () => {
  let count=0;
  globalThis.fetch=async () => { count++; return new Response('busy',{status:503}); };
  await assert.rejects(generateSection({ ...config(), fallbackEnabled:true, fallbackBaseUrl:'https://fallback.example/v1', fallbackModel:'fallback' },req), /Paste an API key/);
  assert.equal(count,1);
});

test('keyless local endpoint omits Authorization', async () => {
  globalThis.fetch=async (_,options) => { assert.equal(options.headers.Authorization,undefined); return success(); };
  await testConnection({ ...config(), baseUrl:'http://localhost:11434/v1', apiKey:'' });
});

test('HTTP errors redact credentials and network errors explain CORS', async () => {
  globalThis.fetch=async () => new Response('rejected primary-test-secret',{status:401});
  await assert.rejects(testConnection(config()), error => error.message.includes('rejected this API key') && !error.message.includes('primary-test-secret'));
  globalThis.fetch=async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(testConnection(config()), /CORS/);
});

test('empty and malformed responses are failures', async () => {
  globalThis.fetch=async () => new Response('{}');
  await assert.rejects(testConnection(config()), /no text/);
  globalThis.fetch=async () => new Response('<html>Not an API</html>');
  await assert.rejects(testConnection(config()), /invalid JSON/);
});

test('invalid URL and missing model fail before any request', async () => {
  globalThis.fetch=async () => { assert.fail('should not send'); };
  assert.throws(()=>chatEndpoint('https://user:password@api.example/v1'), /without credentials/);
  await assert.rejects(testConnection({ ...config(), model:' ' }), /model ID/);
});

test('remote HTTP is rejected before credentials or project content leave the app', async () => {
  globalThis.fetch = async () => assert.fail('must not send an insecure request');
  for (const baseUrl of ['http://provider.example/v1', 'http://localhost.evil.example/v1', 'http://192.168.1.5/v1']) {
    await assert.rejects(testConnection({ ...config(), baseUrl }), /require HTTPS/);
  }
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(chatEndpoint(`http://${host}:11434/v1`), `http://${host}:11434/v1/chat/completions`);
  }
});

test('fallback cannot send credentials over remote HTTP', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('busy', { status: 503 }); };
  await assert.rejects(generateSection({ ...config(), fallbackEnabled: true, fallbackBaseUrl: 'http://fallback.example/v1', fallbackApiKey: 'fallback-secret', fallbackModel: 'fallback' }, req), /require HTTPS/);
  assert.equal(calls, 1);
});
