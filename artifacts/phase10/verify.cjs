const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/Cebo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const stage = process.argv[2] || 'before';
const output = __dirname;
async function navigate(page, mobile) {
  await page.getByRole('button', { name: 'Pravila rada', exact: true }).waitFor({state:'attached'}).catch(async error => {
    await page.screenshot({path:path.join(output,'failure.jpg'),fullPage:true});
    console.error(await page.locator('body').innerText());
    throw error;
  });
  if (mobile) await page.locator('.mobile-menu').click();
  await page.getByRole('button', { name: 'Pravila rada', exact: true }).click();
  await page.getByRole('heading', { name: 'Pravila raspoređivanja' }).waitFor();
  await page.locator('.sidebar').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const [device, width, height] of [['mobile',390,844],['desktop',1440,900]]) {
      for (const theme of ['dark','light']) {
        const context = await browser.newContext({ viewport: { width, height } });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://127.0.0.1:3000');
        await page.getByRole('button', { name: 'Pravila rada', exact: true }).waitFor({state:'attached'});
        await page.evaluate(theme => localStorage.setItem('shiftflow:theme',theme),theme);
        await page.reload();
        await navigate(page, device === 'mobile');
        await page.screenshot({path:path.join(output,`${stage}-${device}-${theme}.jpg`),fullPage:true});
        const rules = page.locator('form').filter({has:page.locator('[name="rest"]')});
        const controls = await rules.locator('input,select').evaluateAll(nodes => nodes.map(n => ({name:n.name,value:n.value,checked:n.checked,min:n.min,max:n.max,step:n.step})));
        await page.locator('.requirements-editor').scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output,`${stage}-${device}-${theme}-requirements.jpg`)});
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        results.push({device,theme,controls,overflow,errors});
        if(stage === 'after') {
          assert.equal(overflow,false);
          assert.equal(controls.length,7);
          await page.locator('[name="rest"]').fill('14');
          await page.locator('[name="hours"]').fill('44');
          await page.locator('[name="restSeverity"]').selectOption('warning');
          await page.locator('[name="hoursSeverity"]').selectOption('block');
          await page.locator('[name="multiple"]').check();
          await page.locator('[name="restEnabled"]').uncheck();
          await page.locator('[name="hoursEnabled"]').uncheck();
          // Native validation must prevent a commit.
          await page.locator('[name="rest"]').fill('49');
          await page.getByRole('button',{name:'Sačuvaj pravila',exact:true}).click();
          assert.equal(await page.locator('[name="rest"]').evaluate(n=>n.validity.rangeOverflow),true);
          await page.locator('[name="rest"]').fill('14');
          await page.locator('[name="rest"]').focus();
          await page.keyboard.press('Tab');
          assert.equal(await page.evaluate(()=>document.activeElement.name),'restSeverity');
          const focus = await page.locator('[name="restSeverity"]').evaluate(n=>({visible:n.matches(':focus-visible'),outline:getComputedStyle(n).outlineWidth}));
          assert.equal(focus.visible,true); assert.notEqual(focus.outline,'0px');
          await page.screenshot({path:path.join(output,`after-${device}-${theme}-focus.jpg`)});
          await page.getByRole('button',{name:'Sačuvaj pravila',exact:true}).click();
          await page.getByText('Pravila su sačuvana. Proverite postojeći raspored ili generišite novi.',{exact:true}).waitFor();
          await page.screenshot({path:path.join(output,`after-${device}-${theme}-saved.jpg`)});
          const requirement = page.locator('.requirements-editor input').first();
          await requirement.fill('3');
          await page.waitForFunction(()=>JSON.parse(localStorage.getItem('shiftflow:demo:v1')||'null')?.current?.requirements.some(r=>r.day===0&&r.count===3));
          await page.reload();
          await navigate(page,device==='mobile');
          assert.equal(await page.locator('[name="rest"]').inputValue(),'14');
          assert.equal(await page.locator('[name="hours"]').inputValue(),'44');
          assert.equal(await page.locator('[name="restSeverity"]').inputValue(),'warning');
          assert.equal(await page.locator('[name="hoursSeverity"]').inputValue(),'block');
          assert.equal(await page.locator('[name="multiple"]').isChecked(),true);
          assert.equal(await page.locator('[name="restEnabled"]').isChecked(),false);
          assert.equal(await page.locator('[name="hoursEnabled"]').isChecked(),false);
          assert.equal(await page.locator('.requirements-editor input').first().inputValue(),'3');
          results.at(-1).persistence = 'passed';
          results.at(-1).focus = focus;
          assert.deepEqual(errors,[]);
          const baseline = JSON.parse(fs.readFileSync(path.join(output,'before-results.json'),'utf8')).find(r=>r.device===device&&r.theme===theme);
          assert.deepEqual(JSON.parse(JSON.stringify(controls)),baseline.controls,'defaults and native validation attributes must be unchanged');
          for (const summary of await page.locator('.requirements-editor summary').all()) {
            await summary.focus();
            await page.keyboard.press('Enter');
          }
          assert.equal(await page.locator('.requirements-editor details[open]').count(),6);
          await page.evaluate(() => {
            const state = JSON.parse(localStorage.getItem('shiftflow:demo:v1'));
            state.current.templates[0].name = 'Produžena jutarnja smena za pripremu lokala';
            state.current.positions.push('Koordinatoruslugeizuzetnodugačaknazivpozicije');
            localStorage.setItem('shiftflow:demo:v1',JSON.stringify(state));
          });
          await page.reload();
          await navigate(page,device==='mobile');
          await page.locator('.requirements-editor').scrollIntoViewIfNeeded();
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
          await page.screenshot({path:path.join(output,`after-${device}-${theme}-long-labels.jpg`),fullPage:true});
          await page.evaluate(() => {
            const state = JSON.parse(localStorage.getItem('shiftflow:demo:v1'));
            state.current.templates = [];
            state.current.requirements = [];
            state.current.schedules = {};
            localStorage.setItem('shiftflow:demo:v1',JSON.stringify(state));
          });
          await page.reload();
          await navigate(page,device==='mobile');
          assert.equal(await page.locator('.requirements-editor input').count(),0);
          assert.equal(await rules.locator('input,select').count(),7);
          await page.screenshot({path:path.join(output,`after-${device}-${theme}-empty.jpg`),fullPage:true});
          assert.deepEqual(errors,[]);
          results.at(-1).extraStates = 'all weekdays keyboard accessible; long labels and empty templates passed';
        }
        await context.close();
      }
    }
    fs.writeFileSync(path.join(output,`${stage}-results.json`),JSON.stringify(results,null,2));
    console.log(JSON.stringify(results,null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
