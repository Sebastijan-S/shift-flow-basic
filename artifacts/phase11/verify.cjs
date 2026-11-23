const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Cebo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const stage = process.argv[2] || 'before';
async function navigate(page, name, mobile) {
  await page.getByRole('button',{name,exact:true}).waitFor({state:'attached'}).catch(async e=>{
    console.error('PAGE',await page.locator('body').innerText());
    await page.screenshot({path:path.join(__dirname,'diagnostic.jpg'),fullPage:true});
    throw e;
  });
  if(mobile) await page.locator('.mobile-menu').click();
  await page.getByRole('button',{name,exact:true}).click();
  await page.getByRole('heading',{name,exact:true}).waitFor();
  await page.locator('.sidebar').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
}
async function shot(page, name, fullPage=true) {
  await page.screenshot({path:path.join(__dirname,`${stage}-${name}.jpg`),fullPage});
}
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const results=[];
  try {
    for(const [device,width,height] of [['mobile',390,844],['desktop',1440,900]]) for(const theme of ['dark','light']) {
      const mobile=device==='mobile', id=`${device}-${theme}`;
      const context=await browser.newContext({viewport:{width,height}});
      const page=await context.newPage();
      const errors=[]; page.on('pageerror',e=>errors.push(e.message));
      await page.goto(process.env.SHIFTFLOW_TEST_URL || 'http://127.0.0.1:3000');
      await page.getByRole('button',{name:'Istorija izmena',exact:true}).waitFor({state:'attached'});
      await page.evaluate(theme=>localStorage.setItem('shiftflow:theme',theme),theme);
      await page.reload();
      await navigate(page,'Istorija izmena',mobile);
      const undo=page.getByRole('button',{name:/^Poništi/}),redo=page.getByRole('button',{name:/^Ponovi/});
      assert.equal(await undo.isDisabled(),true); assert.equal(await redo.isDisabled(),true);
      await shot(page,`${id}-empty`);
      // Real UI write in disposable demo: change one rule, undo, redo and reload.
      await navigate(page,'Pravila rada',mobile);
      await page.locator('[name="rest"]').fill('14');
      await page.getByRole('button',{name:'Sačuvaj pravila',exact:true}).click();
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('shiftflow:demo:v1')||'null')?.current?.rules.minRestHours===14);
      await navigate(page,'Istorija izmena',mobile);
      assert.equal(await undo.isEnabled(),true); assert.equal(await redo.isDisabled(),true);
      await undo.click();
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('shiftflow:demo:v1')).current.rules.minRestHours===12);
      assert.equal(await undo.isDisabled(),true); assert.equal(await redo.isEnabled(),true);
      await shot(page,`${id}-undone`);
      await redo.click();
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('shiftflow:demo:v1')).current.rules.minRestHours===14);
      await page.reload(); await navigate(page,'Istorija izmena',mobile);
      assert.equal(await undo.isEnabled(),true); assert.equal(await redo.isDisabled(),true);
      const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('shiftflow:demo:v1')));
      assert.equal(stored.current.rules.minRestHours,14); assert.equal(stored.past.length,1);
      // Isolated visual fixture: historical labels only; real undo/redo was checked above.
      await page.evaluate(()=>{
        const s=JSON.parse(localStorage.getItem('shiftflow:demo:v1'));
        const labels=['Promenjene potrebe tima','Izmenjena pravila rada','Izmena zaposlenog: AleksandrijaMaksimilijanovićPetrovićJovanovićDugačakNazivBezRazmaka'];
        s.past=labels.map((label,i)=>({label,time:`2026-11-${20+i}T12:34:56Z`,snapshot:s.current,after:s.current}));
        localStorage.setItem('shiftflow:demo:v1',JSON.stringify(s));
      });
      await page.reload(); await navigate(page,'Istorija izmena',mobile);
      await shot(page,`${id}-populated`);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      const latestVisible=await page.getByText('Poslednja izmena',{exact:true}).isVisible();
      if(stage==='after') {
        assert.equal(overflow,false); assert.equal(latestVisible,true);
        await undo.focus(); await page.keyboard.press('Tab');
        // Disabled redo is skipped; test visible focus on undo with Shift+Tab.
        await page.keyboard.press('Shift+Tab');
        const focus=await undo.evaluate(el=>({active:el===document.activeElement,visible:el.matches(':focus-visible'),outline:getComputedStyle(el).outlineWidth}));
        assert.equal(focus.active,true); assert.equal(focus.visible,true); assert.notEqual(focus.outline,'0px');
        await shot(page,`${id}-focus`,false);
        assert.equal(await page.locator('.history-list time').count(),3);
        assert.match(await undo.getAttribute('aria-describedby'),/history-undo/);
        results.push({device,theme,overflow,latestVisible,focus,persistence:true,errors});
      } else results.push({device,theme,overflow,latestVisible,persistence:true,errors});
      assert.deepEqual(errors,[]);
      await context.close();
    }
    fs.writeFileSync(path.join(__dirname,`${stage}-results.json`),JSON.stringify(results,null,2));
    console.log(JSON.stringify(results,null,2));
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
