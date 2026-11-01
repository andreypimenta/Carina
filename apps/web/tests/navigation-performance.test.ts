// Failure modes, fixed before changing public loaders or prefetch:
// - returning to a page that was already open still needs the network;
// - query variants mix content/SEO, or restores lose their anchor;
// - intent no longer loads data, scroll-through touches download it, or a failed prefetch breaks the current page;
// - visits renew deadlines, expired/errors stay cached, or refresh stops working;
// - Agent tabs choose an invalid panel or leave canonical/history behind;
// - search downloads two whole pages, requests before opening, or never retries/updates suggestions.
// Reader work failures fixed before changing enhancement and return-position code:
// - offscreen code downloads/runs immediately, visible code stays plain, or raw copying changes;
// - tiny/linked pictures become zoom buttons, or language changes keep old handlers;
// - a deep return loses its anchor, or folded dates confuse the anchor search.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { before, after, test } from "node:test";
import { chromium, webkit, expect, type Browser } from "@playwright/test";
import type { FeedItemSummary, SiteItemDetail, ReportDetail } from "@aihot/contracts/site";
import { startWebServer, type WebServer } from "./web-server.ts";

const at = '2026-10-04T08:00:00.000Z';
const item: FeedItemSummary = {id:'navigation-fixture',title:'Artigo de teste de desempenho',summary:'Resumo fixo',reason:'Por que ler fixo',source:{name:'Fixture'},publishedAt:at,timelineAt:at,category:'reviews',tags:[],score:80,selected:true,channel:'news',x:null};
const detail: SiteItemDetail = {...item,ownText:false,x:null,originalTitle:'Fixture article',links:{original:'https://example.org/article'},discoveredAt:at,story:null,readingMode:'full',author:null,body:{zh:'<p>Texto fixo</p>',original:null,zhKind:'translation',complete:true},outline:[],relatedStories:[],topics:[],indexable:true,markdownAvailable:true,group:null,hasTranslation:true,bodyLanguage:'zh',weekly:null};
const codeSource='import json\n\nwith open("data.json") as file:\n    data = json.load(file)\n\nfor record in data:\n    print(record["title"])\n';
const readerBody=Array.from({length:30},(_,i)=>`<p>Parágrafo de leitura ${i}: primeiro leia o texto, depois veja o código e as imagens. O texto continua legível; imagens e código são melhorados quando necessário.</p>`).join('')
  +`<pre><code>${codeSource}</code></pre><pre><code>x = 1</code></pre>`
  +Array.from({length:12},(_,i)=>`<img src="/reader-image/${i}.svg" alt="Imagem do texto ${i}" width="640" height="360" loading="lazy">`).join('')
  +'<img src="/reader-image/tiny.svg" alt="Ícone pequeno" width="16" height="16" loading="lazy"><a href="https://example.org"><img src="/reader-image/linked.svg" alt="Imagem com link" width="640" height="360" loading="lazy"></a>';
const report = (kind:'daily'|'weekly'|'monthly'): ReportDetail => ({kind,key:kind==='daily'?'2026-10-04':kind==='weekly'?'2026-W40':'2026-10',issueNumber:1,title:'Fixture '+kind,generatedAt:at,lead:{title:'Fixture '+kind,leadParagraph:'Fixture report'},leadItemId:null,overview:null,highlights:[],sections:[],flashes:[],cover:null,metrics:{},readingMinutes:1,prev:null,next:null,modules:{}});
const hits: string[] = [];
let suggestionsVersion=1;
let failing='';
let ttl=60;
let web:WebServer;
let origin:string;
let chrome:Browser;
let safari:Browser;
const api=createServer((req,res)=>{
  const url=new URL(req.url!,'http://local');
  const p=url.pathname;
  res.setHeader('Content-Type','application/json');
  if(p==='/api/site/meta') return res.end(JSON.stringify({changelogVersion:'fixture'}));
  if(p==='/api/site/track'){res.statusCode=204;return res.end();}
  hits.push(req.url!);
  if(p===failing){res.statusCode=503;return res.end(JSON.stringify({code:'unavailable'}));}
  if(p==='/api/health')return res.end('{}');
  if(p==='/api/site/search/suggestions')return res.end(JSON.stringify({topics:[{slug:'openai',name:'Sugestão versão '+suggestionsVersion,group:'company'}],hot:[{rank:1,title:'Sugestão versão '+suggestionsVersion,to:'/story/fixture'}]}));
  if(p==='/api/site/topics')return res.end(JSON.stringify({groups:[],topics:[{slug:'openai',name:'OpenAI',group:'company',definition:'Fixture',brand:null,total:0,recent:0,indexable:false,latest:null}]}));
  if(p==='/api/site/hot')return res.end(JSON.stringify({computedAt:at,windowHours:48,entries:[{rank:1,story:{publicId:'fixture',title:'Sugestão versão '+suggestionsVersion},heat:10,trend:'flat',trendPct:0,badges:[],participantCount:0,sourceCount:0,sourceNames:[],participants:[],spark:[],summary:null,latest:null,cover:null}]}));
  if(p==='/api/site/timeline'){
    res.setHeader('X-Accel-Expires','@'+(Math.floor(Date.now()/1000)+ttl));
    const category=url.searchParams.get('category');
    const shown={...item,title:category?'Categoria '+category:'Artigo de teste de desempenho'};
    if(url.searchParams.get('tag')==='long-reading'){
      const cards=Array.from({length:180},(_,i)=>({key:'long-'+i,anchorAt:i<60?at:'2026-10-03T08:00:00.000Z',item:{...item,id:'long-'+i,title:'Artigo da lista longa '+i,summary:'Resumo fixo para conferir o retorno da leitura profunda. '.repeat(3)},group:null}));
      return res.end(JSON.stringify({filters:{channel:'all',category:null,tag:'long-reading'},cards,nextCursor:null,hot:null,dayCounts:{'2026-10-04':60,'2026-10-03':120}}));
    }
    return res.end(JSON.stringify({filters:{channel:'all',category,tag:null},cards:[{key:shown.id,anchorAt:at,item:shown,group:null}],nextCursor:null,hot:null,dayCounts:{'2026-10-04':1}}));
  }
  if(p==='/api/site/pool'){
    const page=Number(url.searchParams.get('page')||1);
    return res.end(JSON.stringify({filters:{channel:'all',category:null,tag:null,q:null,tab:'time'},items:[{...item,title:'Todas, página '+page}],page,pageCount:3,total:3,todayCount:1,freshness:at}));
  }
  if(p==='/api/site/items/navigation-fixture')return res.end(JSON.stringify(detail));
  if(p==='/api/site/items/navigation-fixture/original')return res.end(JSON.stringify({...detail,body:{zh:null,original:'<p>Original fixture</p>',zhKind:null,complete:true},bodyLanguage:'original'}));
  if(p==='/api/site/items/reader-fixture')return res.end(JSON.stringify({...detail,id:'reader-fixture',title:'Teste de leitura aprimorada',body:{...detail.body,zh:readerBody}}));
  if(p==='/api/site/items/reader-fixture/original')return res.end(JSON.stringify({...detail,id:'reader-fixture',title:'Teste de leitura aprimorada',body:{...detail.body,zh:null,original:'<p>Original reader text</p>'},bodyLanguage:'original'}));
  if(p.startsWith('/api/site/items/long-'))return res.end(JSON.stringify({...detail,id:p.split('/').at(-1),title:'Detalhe da lista longa'}));
  const kind=p.match(/^\/api\/site\/reports\/(daily|weekly|monthly)\/latest-page$/)?.[1] as 'daily'|'weekly'|'monthly'|undefined;
  if(kind){const r=report(kind);return res.end(JSON.stringify({report:r,index:[{key:r.key,issueNumber:1,title:r.title,count:0}]}));}
  res.statusCode=404;res.end(JSON.stringify({code:'not_found'}));
});

before(async()=>{
  // Started together; whatever started is stopped in after() even when another one failed.
  const started=await Promise.allSettled([
    startWebServer(api).then(w=>{web=w;origin=w.origin;}),
    chromium.launch({channel:'chromium'}).then(b=>{chrome=b;}),
    webkit.launch().then(b=>{safari=b;}),
  ]);
  for(const result of started)if(result.status==='rejected')throw result.reason;
});
after(async()=>{
  await chrome?.close();await safari?.close();
  await web?.stop();
});

// One engine per behaviour: WebKit for what phone readers do (iPhone Safari), Chromium for desktop-only
// intent such as hover. The router and caches are the same code in both.
// Every page's code must finish loading: a module part awaited in a chunk that the part itself imports never
// resolves, and then no page hydrates although the server's HTML still shows.
test('the front page, the Seleção feed, an article and the admin login hydrate',async()=>{
  const page=await chrome.newPage();
  for(const [path,route] of [['/','front'],['/selecao','routes/home'],['/items/navigation-fixture','routes/item'],['/admin/login','routes/admin-login']]){
    await page.goto(origin+path);
    await page.waitForFunction((id)=>Boolean((window as unknown as {__reactRouterRouteModules?:Record<string,unknown>}).__reactRouterRouteModules?.[id]),route,{timeout:10_000});
  }
  await page.close();
});

test('SSR list and visited query variants return offline without another read',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  try{
    await page.goto(origin+'/selecao');
    await expect(page.getByRole('link',{name:'Artigo de teste de desempenho',exact:true})).toBeVisible();
    await page.getByRole('link',{name:'Artigo de teste de desempenho',exact:true}).click();
    await expect(page.getByText('Texto fixo',{exact:true})).toBeVisible();
    await context.setOffline(true);
    await page.goBack();
    await expect(page.getByRole('link',{name:'Artigo de teste de desempenho',exact:true})).toBeVisible({timeout:1500});
    await context.setOffline(false);
    await page.getByRole('button',{name:/^Filtrar/}).click();
    await page.getByRole('link',{name:'Revisões',exact:true}).click();
    await expect(page.getByRole('link',{name:'Categoria reviews',exact:true})).toBeVisible();
    await page.getByRole('button',{name:/^Filtrar/}).click();
    await page.getByRole('link',{name:'Técnica',exact:true}).click();
    await expect(page.getByRole('link',{name:'Categoria technique',exact:true})).toBeVisible();
    await context.setOffline(true);
    await page.goBack();
    await expect(page.getByRole('link',{name:'Categoria reviews',exact:true})).toBeVisible({timeout:1500});
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href',origin+'/selecao?category=reviews');
  }finally{await context.close();}
});

test('hover still fetches article data, touches that move do not, and failed prefetch does not replace the current page',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await page.goto(origin+'/selecao');
    const link=page.getByRole('link',{name:'Artigo de teste de desempenho',exact:true});
    const start=hits.length;
    await link.dispatchEvent('touchstart');await link.dispatchEvent('touchmove');
    await page.getByRole('heading',{name:'Seleção',exact:true}).click();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/items/')).length,0);
    const response=page.waitForResponse(r=>r.url().includes('/items/navigation-fixture.data'));
    await link.hover();await response;
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/items/')).length,1);
    await link.click();await expect(page.getByText('Texto fixo',{exact:true})).toBeVisible();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/items/')).length,1,'navigation reuses its intent-prefetched response');
    const fresh=await chrome.newContext();const freshPage=await fresh.newPage();
    try{
      await freshPage.goto(origin+'/selecao');failing='/api/site/items/navigation-fixture';
      const failed=freshPage.waitForResponse(r=>r.url().includes('/items/navigation-fixture.data')&&r.status()===503);
      await freshPage.getByRole('link',{name:'Artigo de teste de desempenho',exact:true}).hover();await failed;
      await expect(freshPage.getByRole('heading',{name:'Seleção',exact:true})).toBeVisible();
    }finally{await fresh.close();}
  }finally{failing='';await context.close();}
});

test('SSR all-pages and report kinds return offline with their own content',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await page.goto(origin+'/all');
    await page.locator('a[href="/all?page=2"]').first().click();
    await expect(page.getByRole('link',{name:'Todas, página 2',exact:true})).toBeVisible();
    await context.setOffline(true);await page.goBack();
    await expect(page.getByRole('link',{name:'Todas, página 1',exact:true})).toBeVisible({timeout:1500});
    await context.setOffline(false);
    // Reached inside the site, the front page is still the weekly edition.
    await page.getByRole('link',{name:/primeira página$/}).click();
    await expect(page.locator('#report-start')).toContainText('Edição semanal');
    // So does an old link to the front page with the Seleção feed's filters, followed inside the site.
    await page.evaluate(()=>(window as unknown as {__reactRouterDataRouter:{navigate:(to:string)=>Promise<void>}}).__reactRouterDataRouter.navigate('/?category=reviews'));
    await expect(page.getByRole('link',{name:'Categoria reviews',exact:true})).toBeVisible();
    assert.equal(new URL(page.url()).pathname+new URL(page.url()).search,'/selecao?category=reviews');
    await page.goto(origin+'/daily');
    await page.getByRole('link',{name:'Semanal',exact:true}).click();
    await expect(page.locator('#report-start')).toContainText('Edição semanal');
    await context.setOffline(true);await page.getByRole('link',{name:'Diário',exact:true}).click();
    await expect(page.locator('#report-start')).toContainText('Notas diárias',{timeout:1500});
  }finally{await context.close();}
});

// A prefetch of the newly selected link must not be mistaken for an explicit refresh of that page.
// Disable HTTP reuse here: otherwise the browser cache can hide a lost document-level result.
test('intent on a selected link preserves visited data and the next revisit starts no data request',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  const requests:string[]=[];
  await context.route('**/*.data*',route=>route.continue());
  page.on('request',request=>{if(request.url().includes('.data'))requests.push(request.url());});
  try{
    await page.goto(origin+'/selecao');
    await page.getByRole('link',{name:'Revisões',exact:true}).click();
    await expect(page.getByRole('link',{name:'Categoria reviews',exact:true})).toBeVisible();
    await page.getByRole('link',{name:'Revisões',exact:true}).focus();
    await page.waitForTimeout(150);
    await page.getByRole('link',{name:'Técnica',exact:true}).click();
    await expect(page.getByRole('link',{name:'Categoria technique',exact:true})).toBeVisible();
    await page.getByRole('link',{name:'Técnica',exact:true}).focus();
    await page.waitForTimeout(150);
    const before=requests.length;
    await page.getByRole('link',{name:'Revisões',exact:true}).click();
    await expect(page.getByRole('link',{name:'Categoria reviews',exact:true})).toBeVisible();
    assert.deepEqual(requests.slice(before),[],'neither prefetch nor navigation may evict and reload a still-valid visited page');
  }finally{await context.close();}
});

test('a revisit never renews the original deadline; an expired read shows an error and a reload asks again',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await page.clock.install();ttl=1;
    await page.goto(origin+'/selecao');
    await page.getByRole('link',{name:'Artigo de teste de desempenho',exact:true}).click();await expect(page.getByText('Texto fixo',{exact:true})).toBeVisible();
    failing='/api/site/timeline';
    await page.clock.runFor(1500);
    await page.goBack();await expect(page.getByRole('heading',{name:'Não foi possível carregar',exact:true})).toBeVisible();
    failing='';ttl=60;
    await page.reload();await expect(page.getByRole('link',{name:'Artigo de teste de desempenho',exact:true})).toBeVisible();
  }finally{ttl=60;failing='';await context.close();}
});

test('SSR freshness spent in an upstream cache is not renewed by HTML hydration',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    ttl=0;await page.goto(origin+'/selecao');
    await page.getByRole('link',{name:'Artigo de teste de desempenho',exact:true}).click();await expect(page.getByText('Texto fixo',{exact:true})).toBeVisible();
    const start=hits.length;ttl=60;
    await page.goBack();await expect(page.getByRole('link',{name:'Artigo de teste de desempenho',exact:true})).toBeVisible();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/timeline')).length,1);
  }finally{ttl=60;await context.close();}
});

test('Agent tabs finish offline with matching canonical; invalid direct tabs and anchored links keep a panel',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await page.goto(origin+'/agent');
    await context.setOffline(true);
    await page.getByRole('tablist',{name:'Formas de integração'}).getByRole('tab',{selected:true}).click();
    await expect(page.locator('#agent-panel')).not.toBeEmpty();
    for(const [tab,name] of [['mcp',/^MCP/],['rss',/^RSS/],['api',/^REST API/]] as const){
      const choice=page.getByRole('tab',{name});
      // The active track was exercised above; compare navigation through every remaining track.
      if(await choice.getAttribute('aria-selected')==='true')continue;
      const target=await choice.getAttribute('href');
      await choice.click();
      await expect(page).toHaveURL(origin+target,{timeout:1500});
      await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href',origin+target);
      await expect(page.locator('#agent-panel')).toHaveAttribute('aria-labelledby','agent-tab-'+tab);
      await expect(page.locator('#agent-panel')).not.toBeEmpty();
    }
    await context.setOffline(false);
    await page.goto(origin+'/agent?tab=unknown');
    await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected','true');
    await expect(page.locator('#agent-panel')).not.toBeEmpty();
    await page.goto(origin+'/agent#agent-api-recovery');
    await expect(page.locator('#agent-api-recovery')).toBeVisible();
  }finally{await context.close();}
});

test('phone suggestions load only on opening, use one small read, retry failures and update on reopening',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
  try{
    suggestionsVersion=1;await page.goto(origin+'/selecao');
    assert.equal(hits.filter(x=>x==='/api/site/search/suggestions').length,0);
    let start=hits.length;
    await page.getByRole('button',{name:'Buscar',exact:true}).click();
    await expect(page.getByRole('link',{name:'Sugestão versão 1',exact:true})).toBeVisible();
    assert.deepEqual(hits.slice(start),['/api/site/search/suggestions']);
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    suggestionsVersion=2;start=hits.length;
    await page.getByRole('button',{name:'Buscar',exact:true}).click();
    await expect(page.getByRole('link',{name:'Sugestão versão 2',exact:true})).toBeVisible();
    assert.deepEqual(hits.slice(start),['/api/site/search/suggestions']);
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    failing='/api/site/search/suggestions';await page.getByRole('button',{name:'Buscar',exact:true}).click();
    await expect(page.getByRole('link',{name:'Sugestão versão 2',exact:true})).not.toBeVisible();
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();failing='';suggestionsVersion=3;
    await page.getByRole('button',{name:'Buscar',exact:true}).click();
    await expect(page.getByRole('link',{name:'Sugestão versão 3',exact:true})).toBeVisible();
  }finally{failing='';await context.close();}
});

test('reader enhancements wait for visible code and update only the picture that loaded',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const scripts:string[]=[];page.on('request',r=>{if(r.url().includes('/assets/')&&r.url().includes('highlight-'))scripts.push(r.url());});
  await page.route('**/reader-image/*.svg',route=>route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${route.request().url().endsWith('/tiny.svg')?16:640}" height="360"><rect width="640" height="360" fill="red"/></svg>`}));
  try{
    await page.goto(origin+'/items/reader-fixture');
    await expect(page.getByRole('heading',{name:'Teste de leitura aprimorada',exact:true})).toBeVisible();
    await expect(page.locator('.code-block-copy')).toHaveCount(2);
    assert.deepEqual(scripts,[],'reading the introduction must not download the offscreen highlighter');
    const source=page.locator('.prose pre code').first();
    assert.equal(await source.textContent(),codeSource);
    await source.scrollIntoViewIfNeeded();
    await expect(source).toHaveClass(/hljs/);
    assert.equal(await source.textContent(),codeSource,'colouring preserves the copyable text');
    assert.equal(scripts.length,1);
    await page.locator('.code-block-copy').first().click();
    await expect(page.locator('.code-block-copy').first()).toHaveText('Copiado');
    assert.equal(await page.locator('.prose pre code').nth(1).textContent(),'x = 1');
    for(let i=0;i<12;i++){
      const picture=page.locator(`.prose img[alt="Imagem do texto ${i}"]`);
      await picture.scrollIntoViewIfNeeded();
      await expect(picture).toHaveAttribute('role','button');
    }
    const tiny=page.locator('.prose img[alt="Ícone pequeno"]');await tiny.scrollIntoViewIfNeeded();
    await expect(tiny).not.toHaveAttribute('role','button');
    await expect(page.locator('.prose a img')).not.toHaveAttribute('role','button');
    await page.getByRole('navigation',{name:'Idioma do texto'}).getByRole('link',{name:'Original',exact:true}).click();
    await expect(page.getByText('Original reader text',{exact:true})).toBeVisible();
    assert.equal(await page.locator('.code-block-copy').count(),0);
  }finally{await context.close();}
});

test('a masthead section starts the page it opens at the top; on the feed it only filters, keeping the place',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const section=page.getByRole('navigation',{name:'Área',exact:true}).first().getByRole('link').nth(1);
  try{
    await page.goto(origin+'/weekly');
    await expect(section).toBeVisible();
    await page.evaluate(()=>{document.body.style.minHeight='3000px';window.scrollTo(0,20);});
    await section.click();
    await page.waitForURL(/\/selecao\?area=/);
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);

    await page.goto(origin+'/selecao?tag=long-reading');
    await expect(page.locator('[data-card-key]')).toHaveCount(180);
    await page.evaluate(()=>window.scrollTo(0,20));
    await section.click();
    await page.waitForURL(/\/selecao\?tag=long-reading&area=/);
    await expect(page.locator('[data-card-key]')).toHaveCount(180);
    assert.equal(await page.evaluate(()=>window.scrollY),20);
  }finally{await context.close();}
});

test('deep reading returns to its anchor, including folded dates',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  try{
    await page.goto(origin+'/selecao?tag=long-reading');
    await expect(page.locator('[data-card-key]')).toHaveCount(180);
    await page.getByRole('button',{name:'Recolher 4 de out.',exact:true}).click();
    await expect(page.locator('[data-card-key]')).toHaveCount(120);
    await page.getByRole('link',{name:'Artigo da lista longa 160',exact:true}).scrollIntoViewIfNeeded();
    const before=await page.evaluate(()=>{
      const first=[...document.querySelectorAll<HTMLElement>('[data-card-key]')].find(e=>e.getBoundingClientRect().bottom>72)!;
      return {key:first.dataset.cardKey!,top:first.getBoundingClientRect().top};
    });
    await page.getByRole('link',{name:'Artigo da lista longa 160',exact:true}).click();
    await expect(page.getByText('Texto fixo',{exact:true})).toBeVisible();
    await page.goBack();
    await expect(page.locator('[data-card-key]')).toHaveCount(120);
    await expect.poll(()=>page.locator(`[data-card-key="${before.key}"]`).evaluate((e,top)=>Math.abs(e.getBoundingClientRect().top-top),before.top)).toBeLessThan(2);
    await expect(page.getByRole('button',{name:'Expandir 4 de out.',exact:true})).toBeVisible();
  }finally{await context.close();}
});
