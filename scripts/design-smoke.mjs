import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'artifacts/design');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.MEDIAFETCH_TEST_CHROME,headless:true});
const page=await browser.newPage({viewport:{width:1100,height:1000},colorScheme:'dark',deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const checks=[];
try {
  await page.goto(pathToFileURL(path.join(root,'artifacts/mediafetch-directions-preview.html')).href);
  const frame=page.frameLocator('iframe');
  const board=frame.locator('#mf-design-board');
  await board.waitFor();
  for(const direction of ['slate','canvas','signal','archive']) {
    await frame.locator(`[data-direction="${direction}"]`).click();
    await frame.getByLabel('Preview surface').selectOption('downloads');
    assert.equal(await frame.locator('.mf-job').count(),5);
    await board.screenshot({path:path.join(output,`${direction}-downloads.png`)});
    await frame.getByLabel('Preview surface').selectOption('popup');
    assert.equal(await frame.locator('.mf-popup .mf-job').count(),2);
    const popupHeight=await frame.locator('.mf-popup').evaluate(node=>node.getBoundingClientRect().height);
    assert.ok(popupHeight<=600,`${direction} popup is too tall: ${popupHeight}`);
    await board.screenshot({path:path.join(output,`${direction}-popup.png`)});
  }
  checks.push('Four distinct directions render download list, popup and inline control');
  for(const width of [736,360,320]) {
    await page.setViewportSize({width,height:1100});
    for(const direction of ['slate','canvas','signal','archive']) {
      await frame.locator(`[data-direction="${direction}"]`).click();
      for(const surface of ['downloads','popup']) {
        await frame.getByLabel('Preview surface').selectOption(surface);
        const layout=await board.evaluate(node=>({width:node.clientWidth,overflow:node.scrollWidth}));
        assert.ok(layout.overflow<=layout.width+1,`${direction}/${surface}/${width}: ${JSON.stringify(layout)}`);
      }
    }
  }
  checks.push('All directions fit at 736px, 360px and 320px without horizontal overflow');
  await page.setViewportSize({width:1100,height:1000});
  await frame.locator('[data-direction="slate"]').click();
  await frame.getByLabel('Preview surface').selectOption('downloads');
  await frame.getByRole('button',{name:'Stop',exact:true}).first().click();
  await frame.getByRole('button',{name:'Continue',exact:true}).waitFor();
  await frame.getByRole('button',{name:'Continue',exact:true}).click();
  assert.equal(await frame.locator('.mf-job[data-state="queued"]').count(),1);
  await frame.getByRole('button',{name:'Remove all',exact:true}).click();
  assert.equal(await frame.locator('.mf-job').count(),2);
  await frame.getByRole('button',{name:'Reset sample',exact:true}).click();
  await frame.getByRole('button',{name:'Settings',exact:true}).click();
  await frame.getByLabel('Default quality').selectOption('Best available');
  await frame.getByRole('button',{name:'Close',exact:true}).click();
  await frame.getByLabel('Post link').fill('https://x.com/example/status/123');
  await frame.getByRole('button',{name:'Download',exact:true}).click();
  assert.equal(await frame.locator('.mf-job').count(),6);
  await frame.getByRole('button',{name:'Reset sample',exact:true}).click();
  checks.push('Local demo interactions work: Stop, Continue, Remove all, Settings, queue and Reset');
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'validation.json'),JSON.stringify({checks,errors},null,2));
  console.log(JSON.stringify({checks,errors},null,2));
} finally {await browser.close();}
