const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Cebo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const stage = process.argv[2] || 'before';
const base = process.env.SHIFTFLOW_TEST_URL || 'http://127.0.0.1:3000';
async function go(page, name, mobile) {
  if(mobile) await page.locator('.mobile-menu').click();
  await page.locator('.sidebar .nav-link').filter({hasText:name}).click();
  await page.getByRole('heading',{name:name==='Pregled'?'Operativni pregled':name,exact:true}).waitFor();
  await page.locator('.sidebar').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
}
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const results=[];
  try {
    for(const [device,width,height] of [['mobile',390,844],['desktop',1440,900]]) for(const theme of ['dark','light']) {
      const context=await browser.newContext({viewport:{width,height}, reducedMotion:'reduce'});
      const page=await context.newPage(); const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base);
      await page.locator('.mobile-menu').waitFor({state:'attached'});
      await page.evaluate(theme=>{
        localStorage.setItem('shiftflow:theme',theme);
        localStorage.setItem('shiftflow:demo:modules:v1',JSON.stringify({schedule:true,overview:true,hours:true,revenue:true,notes:true,bar:true}));
      },theme);
      await page.reload();
      await page.locator('.mobile-menu').waitFor({state:'attached'});
      const mobile=device==='mobile';
      for(const name of ['Pregled','Zaposleni','Dostupnost','Podešavanja']) {
        await go(page,name,mobile);
        await page.locator('[aria-busy="true"]').waitFor({state:'detached'}).catch(()=>{});
        await page.screenshot({path:path.join(__dirname,`${stage}-${device}-${theme}-${name}.jpg`),fullPage:true});
        if(name==='Podešavanja') await page.locator('.settings-index').screenshot({path:path.join(__dirname,`${stage}-${device}-${theme}-index.jpg`)});
        if(stage==='after') {
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} overflows`);
          if(name==='Pregled') for(const removed of ['Sva mesta su popunjena','sa rokom','Nema dospelih podsetnika','Najbliži rokovi na jednom mestu','Pregledajte i uredite izabranu nedelju.']) assert.equal(await page.getByText(removed,{exact:true}).count(),0);
          if(name==='Zaposleni') assert.equal(await page.locator('.panel-footnote').count(),0);
          if(name==='Dostupnost') assert.equal(await page.locator('.availability-heading-actions .tag').count(),0);
          if(name==='Podešavanja') {
            assert.equal(await page.locator('#settings-modules').getByRole('switch',{name:'Raspored',exact:true}).count(),0);
            assert.equal(await page.getByText('Izbor je sačuvan.',{exact:true}).count(),0);
            assert.equal(await page.locator('#settings-notes, #settings-revenue').count(),0);
            for(const link of await page.locator('.settings-index a').all()) {
              const hash=await link.getAttribute('href');
              assert.equal(await page.locator(hash).count(),1);
              await link.click();
              assert.equal(await page.locator(hash).evaluate(el=>el===document.activeElement),true);
              await page.locator('.settings-index').scrollIntoViewIfNeeded();
            }
            const basic=await page.locator('.schedule-settings > section').evaluateAll(nodes=>nodes.map(n=>({top:n.getBoundingClientRect().top,width:n.getBoundingClientRect().width})));
            assert.equal(basic.length,3); assert.ok(basic[0].top<basic[1].top&&basic[1].top<basic[2].top);
            await page.locator('#settings-modules').getByRole('switch',{name:'Pazar',exact:true}).uncheck();
            await page.waitForFunction(()=>JSON.parse(localStorage.getItem('shiftflow:demo:modules:v1')).revenue===false);
            assert.equal(await page.locator('.sidebar').getByRole('button',{name:'Pazar',exact:true}).count(),0);
            await page.reload(); await page.locator('.mobile-menu').waitFor({state:'attached'}); await go(page,'Podešavanja',mobile);
            assert.equal(await page.locator('#settings-modules').getByRole('switch',{name:'Pazar',exact:true}).isChecked(),false);
            await page.locator('.account-signin').click();
            await page.getByRole('dialog').waitFor();
            assert.equal(await page.getByRole('textbox',{name:'Email',exact:true}).count(),1);
            await page.screenshot({path:path.join(__dirname,`${stage}-${device}-${theme}-login.jpg`)});
            await page.getByRole('button',{name:'Zatvori',exact:true}).click();
            for(const module of ['Knjiga šanka i inventar','Radni sati i obračun','Notes i podsetnici','Pregled']) {
              await page.locator('#settings-modules').getByRole('switch',{name:module,exact:true}).uncheck();
            }
            assert.equal(await page.locator('.settings-index a[href="#bar-item-settings"], .settings-index a[href="#settings-hours"]').count(),0);
            assert.equal(await page.locator('.settings-index a[href="#settings-schedule"]').count(),1);
            assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shiftflow:demo:modules:v1')).schedule),true);
            await page.locator('.settings-index').scrollIntoViewIfNeeded();
            await page.screenshot({path:path.join(__dirname,`${stage}-${device}-${theme}-minimal.jpg`)});
            await page.evaluate(()=>localStorage.setItem('shiftflow:demo:modules:v1','{"unknown":true}'));
            await page.reload(); await page.locator('.mobile-menu').waitFor({state:'attached'}); await go(page,'Podešavanja',mobile);
            await page.getByText('Podešavanja modula nisu učitana. Pokušajte ponovo.',{exact:true}).waitFor();
            assert.equal(await page.getByRole('button',{name:'Pokušaj ponovo',exact:true}).count(),1);
            assert.equal(await page.locator('#settings-modules input:not(:disabled)').count(),0);
          }
        }
      }
      assert.deepEqual(errors,[]);
      results.push({device,theme,errors,checked:stage==='after'?'removals, layout, index focus, module persistence and login':'baseline'});
      await context.close();
    }
    fs.writeFileSync(path.join(__dirname,`${stage}-results.json`),JSON.stringify(results,null,2));
    console.log(JSON.stringify(results,null,2));
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
