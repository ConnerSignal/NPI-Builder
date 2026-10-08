import { test, expect, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

let server: Server;
let endpoint: string;
let requests: Array<{ authorization?: string; body: { model: string; messages: unknown[] }; path?: string }> = [];

test.beforeAll(async () => {
  server = createServer((req,res) => {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    if(req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    let raw='';
    req.on('data',chunk=>{ raw+=chunk; });
    req.on('end',()=>{
      requests.push({ authorization:req.headers.authorization, body:JSON.parse(raw), path:req.url });
      res.setHeader('Content-Type','application/json');
      if(req.url?.startsWith('/reject')) { res.writeHead(401); res.end(JSON.stringify({error:'invalid API key'})); return; }
      if(req.url?.startsWith('/busy')) { res.writeHead(429); res.end(JSON.stringify({error:'rate limit'})); return; }
      res.end(JSON.stringify({ model:'served-model-2026', choices:[{message:{content:'OK - live test reply'}}] }));
    });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  endpoint='http://127.0.0.1:'+(server.address() as AddressInfo).port;
});
test.afterAll(async ()=>{ server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); });
test.beforeEach(async ({page})=>{ requests=[]; await page.goto('/'); });

async function settings(page: Page, path='/v1', key='  test-key-12345678  ') {
  await page.getByRole('button',{name:'Edit AI settings',exact:true}).click();
  const primary=page.locator('.provider-block').first();
  await primary.locator('select').selectOption('custom');
  await primary.getByPlaceholder('https://api.openai.com/v1').fill(endpoint+path);
  await page.getByRole('textbox',{name:'Primary API key'}).fill(key);
  await primary.getByPlaceholder('gpt-4.1-mini').fill('chosen-model');
  return primary;
}

test('key survives settings edits; Test and ProdBot send exactly the entered credentials',async({page})=>{
  await settings(page);
  await expect(page.getByRole('textbox',{name:'Primary API key'})).toHaveValue('test-key-12345678');
  const allow=page.getByRole('checkbox',{name:'Allow ProdBot and AI tools'});
  await expect(allow).not.toBeChecked();
  await page.getByRole('button',{name:'Test connection',exact:true}).click();
  await expect(page.getByText('Connection verified',{exact:true})).toBeVisible();
  await expect(page.locator('.ai-test-success')).toContainText('Provider reported: served-model-2026');
  expect(requests).toHaveLength(1);
  expect(requests[0].authorization).toBe('Bearer test-key-12345678');
  expect(requests[0].body.model).toBe('chosen-model');
  expect(requests[0].body.messages).toEqual([{role:'user',content:'Reply with OK to confirm this connection.'}]);
  const stored=await page.evaluate(()=>localStorage.getItem('npi-ai-config'));
  expect(stored).not.toContain('test-key');
  await allow.check();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByPlaceholder('Ask ProdBot...').fill('Hello, test the connection');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.getByText('ProdBot: OK - live test reply')).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1].authorization).toBe('Bearer test-key-12345678');
  expect(requests[1].body.model).toBe('chosen-model');
  await expect(page.locator('.ai-status-label')).toHaveText('Verified');
  await page.getByLabel('Model',{exact:true}).fill('changed-model');
  await expect(page.locator('.ai-status-label')).toHaveText('Not tested');
});

test('rejected keys show an actionable inline failure',async({page})=>{
  await settings(page,'/reject');
  await page.getByRole('button',{name:'Test connection',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('provider rejected this API key');
  await expect(page.getByText('Connection verified',{exact:true})).toHaveCount(0);
});

test('primary test does not call enabled fallback',async({page})=>{
  await settings(page,'/busy');
  await page.getByRole('checkbox',{name:'Use a fallback'}).check();
  const fallback=page.locator('.provider-block').nth(1);
  await fallback.getByPlaceholder('Leave blank to reuse the primary URL').fill(endpoint+'/fallback');
  await fallback.getByPlaceholder('Required for another provider; optional for the same endpoint').fill('fallback-secret');
  await page.getByRole('button',{name:'Test connection',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('429');
  expect(requests).toHaveLength(1);
  expect(requests[0].path).toBe('/busy/chat/completions');
});

test('ProdBot identifies a fallback response and uses its own key',async({page})=>{
  await settings(page,'/busy');
  await page.getByRole('checkbox',{name:'Use a fallback'}).check();
  const fallback=page.locator('.provider-block').nth(1);
  await fallback.getByPlaceholder('Leave blank to reuse the primary URL').fill(endpoint+'/fallback');
  await fallback.getByPlaceholder('Required for another provider; optional for the same endpoint').fill('fallback-secret');
  await fallback.getByPlaceholder('gpt-5.5').fill('fallback-model');
  await page.getByRole('checkbox',{name:'Allow ProdBot and AI tools'}).check();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByPlaceholder('Ask ProdBot...').fill('Hello');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.getByText('ProdBot: OK - live test reply')).toBeVisible();
  await expect(page.locator('.ai-connection-detail').filter({hasText:'Fallback response'}).first()).toContainText('fallback-model');
  expect(requests.map(r=>r.authorization)).toEqual(['Bearer test-key-12345678','Bearer fallback-secret']);
  await expect(page.locator('.ai-status-label')).toHaveText('Not tested');
});

test('keyless localhost test works and changing provider clears old credentials',async({page})=>{
  const primary=await settings(page,'/v1','');
  await page.getByRole('button',{name:'Test connection',exact:true}).click();
  await expect(page.getByText('Connection verified',{exact:true})).toBeVisible();
  expect(requests[0].authorization).toBeUndefined();
  await page.getByRole('textbox',{name:'Primary API key'}).fill('other-provider-secret');
  await primary.locator('select').selectOption('openai');
  await expect(page.getByRole('textbox',{name:'Primary API key'})).toBeEmpty();
  await expect(page.getByRole('button',{name:'Test connection',exact:true})).toBeDisabled();
  await expect(page.getByText('Connection verified',{exact:true})).toHaveCount(0);
});

test('old in-flight test cannot verify newly edited settings',async({page})=>{
  const primary=await settings(page);
  let release!:()=>void;
  let started!:()=>void;
  const ready=new Promise<void>(resolve=>{started=resolve;});
  const hold=new Promise<void>(resolve=>{release=resolve;});
  await page.route(endpoint+'/**',async route=>{
    started(); await hold;
    await route.fulfill({json:{model:'old-model',choices:[{message:{content:'OK'}}]}});
  });
  await page.getByRole('button',{name:'Test connection',exact:true}).click();
  await ready;
  await primary.getByPlaceholder('gpt-4.1-mini').fill('new-model');
  release();
  await expect(page.getByRole('button',{name:'Test connection',exact:true})).toBeEnabled();
  await expect(page.getByText('Connection verified',{exact:true})).toHaveCount(0);
});

test('browser network failures are visible in the settings dialog',async({page})=>{
  await settings(page);
  await page.route(endpoint+'/**',route=>route.abort('failed'));
  await page.getByRole('button',{name:'Test connection',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('CORS');
});

test('a hanging test times out and can be retried',async({page})=>{
  await settings(page);
  await page.clock.install();
  let started!:()=>void;
  const ready=new Promise<void>(resolve=>{started=resolve;});
  await page.route(endpoint+'/**',()=>{started();});
  await page.getByRole('button',{name:'Test connection',exact:true}).click();
  await ready;
  await page.clock.fastForward(31_000);
  await expect(page.getByRole('alert')).toContainText('timed out after 30 seconds');
  await expect(page.getByRole('button',{name:'Test connection',exact:true})).toBeEnabled();
});

test('remembering a browser key restores it and clearing it forgets it',async({page})=>{
  await settings(page);
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('checkbox',{name:'Remember my AI key'}).check();
  await page.reload();
  await page.getByRole('button',{name:'Edit AI settings',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Primary API key'})).toHaveValue('test-key-12345678');
  await expect(page.getByText('Keys saved in this browser on this device (not encrypted).',{exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Primary API key'}).fill('');
  await page.reload();
  await page.getByRole('button',{name:'Edit AI settings',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Primary API key'})).toBeEmpty();
});

test('newly entered key wins over late secure storage hydration',async({page})=>{
  await page.addInitScript(()=>{
    let release: (value: {apiKey: string})=>void;
    const pending = new Promise(resolve=>{release=resolve;});
    Object.assign(window, {
      npiSecureStore: { isAvailable: async()=>true, getSecrets: ()=>pending, setSecrets: async()=>true },
      releaseSecrets: ()=>release({apiKey:'old-stored-key'}),
    });
  });
  await page.reload();
  await settings(page);
  await page.evaluate(()=>{ (window as unknown as {releaseSecrets:()=>void}).releaseSecrets(); });
  await expect(page.getByRole('textbox',{name:'Primary API key'})).toHaveValue('test-key-12345678');
  await page.getByRole('button',{name:'Test connection',exact:true}).click();
  await expect(page.getByText('Connection verified',{exact:true})).toBeVisible();
  expect(requests[0].authorization).toBe('Bearer test-key-12345678');
});

test('failed secure storage does not claim the key was saved',async({page})=>{
  await page.addInitScript(()=>{
    Object.assign(window, { npiSecureStore: { isAvailable: async()=>false, getSecrets: async()=>({}), setSecrets: async()=>false } });
  });
  await page.reload();
  await settings(page);
  await expect(page.getByText('Secure storage unavailable. Keys remain in this session.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Test connection',exact:true}).click();
  await expect(page.getByText('Connection verified',{exact:true})).toBeVisible();
});
