import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const base=process.env.TEST_URL || 'http://127.0.0.1:4173/';
const record=process.argv.includes('--record');
await mkdir('test-results',{recursive:true});await mkdir('presentation',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
const context=await browser.newContext({viewport:{width:1280,height:1100},reducedMotion:'reduce'});
const page=await context.newPage();const problems=[];const checks=[];const calls=[];
page.on('pageerror',e=>problems.push(e.message));
function pass(name){checks.push(name);console.log('PASS',name);}
await page.goto(base);await page.screenshot({path:'presentation/desktop.png',fullPage:true});
assert.equal(await page.locator('#response').getAttribute('readonly'),'');pass('ответ только для чтения');
assert.equal(await page.locator('#apiTokenInstance').getAttribute('type'),'password');pass('токен скрыт по умолчанию');
await page.locator('#toggleToken').click();assert.equal(await page.locator('#apiTokenInstance').getAttribute('type'),'text');await page.locator('#toggleToken').click();pass('переключение видимости токена');
let mode='ok';let delayed=false;
await page.route('https://**.greenapi.com/**',async route=>{
  const req=route.request();calls.push({url:req.url(),method:req.method(),body:req.postDataJSON()});
  if(mode==='network'){await route.abort();return;}
  if(delayed)await new Promise(r=>setTimeout(r,700));
  const method=req.url().split('/').at(-2);
  const body=mode==='error'?{error:'Forbidden',detail:'demo-token'}:method==='getSettings'?{wid:'77770000000@c.us',webhookUrl:'',delaySendMessagesMilliseconds:5000,incomingWebhook:'no',outgoingWebhook:'no'}:method==='getStateInstance'?{stateInstance:'authorized'}:{idMessage:'DEMO_RESPONSE_ONLY'};
  await route.fulfill({status:mode==='error'?403:200,contentType:'application/json',body:JSON.stringify(body)});
});
await page.locator('[data-method="getSettings"]').click();assert.match(await page.locator('#status').innerText(),/Укажите idInstance/);assert.equal(calls.length,0);pass('пустое подключение не вызывает API');
await page.locator('#idInstance').fill('1103000000');await page.locator('#apiTokenInstance').fill('demo-token');
await page.locator('[data-method="getSettings"]').click();await page.waitForFunction(()=>document.getElementById('httpStatus').textContent.includes('HTTP 200'));assert.equal(calls.at(-1).method,'GET');assert.match(await page.locator('#response').inputValue(),/webhookUrl/);pass('getSettings: GET и JSON');
await page.locator('[data-method="getStateInstance"]').click();await page.waitForFunction(()=>document.getElementById('response').value.includes('authorized'));assert.equal(calls.at(-1).method,'GET');pass('getStateInstance: GET и состояние');
const before=calls.length;await page.locator('[data-method="sendMessage"]').click();assert.equal(calls.length,before);pass('пустое сообщение не отправляется');
await page.locator('#messageChatId').fill('+7 (777) 123-45-67');await page.locator('#message').fill('Привет 👋\nТест GREEN-API');
delayed=true;await page.locator('[data-method="sendMessage"]').click();assert.equal(await page.locator('[data-method]:disabled').count(),4);await page.locator('[data-method="sendMessage"]').dispatchEvent('click');
await page.waitForFunction(()=>document.getElementById('response').value.includes('idMessage'));delayed=false;assert.equal(calls.length,before+1);assert.equal(calls.at(-1).method,'POST');assert.deepEqual(calls.at(-1).body,{chatId:'77771234567@c.us',message:'Привет 👋\nТест GREEN-API'});pass('sendMessage: UTF-8, номер и POST');pass('блокировка двойной отправки');
assert.equal(await page.locator('[data-method]:disabled').count(),0);pass('кнопки восстанавливаются после ответа');
await page.locator('#fileChatId').fill('120363043968066561@g.us');await page.locator('#urlFile').fill('https://example.com/horse.png?download=1');await page.locator('[data-method="sendFileByUrl"]').click();await page.waitForFunction(()=>!document.querySelector('[data-method="sendFileByUrl"]').disabled);assert.deepEqual(calls.at(-1).body,{chatId:'120363043968066561@g.us',urlFile:'https://example.com/horse.png?download=1',fileName:'horse.png'});pass('sendFileByUrl: POST, группа, автоматическое имя');
await page.locator('#fileName').locator('..').evaluate(e=>e.open=true);await page.locator('#fileName').fill('document.pdf');await page.locator('#urlFile').fill('https://example.com/download');await page.locator('#caption').fill('Подпись');await page.locator('[data-method="sendFileByUrl"]').click();await page.waitForFunction(()=>!document.querySelector('[data-method="sendFileByUrl"]').disabled);assert.equal(calls.at(-1).body.fileName,'document.pdf');assert.equal(calls.at(-1).body.caption,'Подпись');pass('явное имя и подпись файла');
await page.locator('#apiUrl').locator('..').evaluate(e=>e.open=true);await page.locator('#apiUrl').fill('https://evil.example');const count=calls.length;await page.locator('[data-method="getSettings"]').click();assert.equal(calls.length,count);assert.match(await page.locator('#status').innerText(),/HTTPS-адресом хоста/);pass('токен не отправляется на чужой хост');await page.locator('#apiUrl').fill('https://api.greenapi.com');await page.locator('#apiUrl').locator('..').evaluate(e=>e.open=false);
mode='error';await page.locator('[data-method="getSettings"]').click();await page.waitForFunction(()=>document.getElementById('httpStatus').textContent.includes('403'));assert.match(await page.locator('#status').innerText(),/Проверьте idInstance/);assert.ok(!(await page.locator('#response').inputValue()).includes('demo-token'));await page.screenshot({path:'presentation/error.png',fullPage:true});pass('HTTP 403: код, тело, пояснение и маскировка');
mode='network';await page.locator('[data-method="getSettings"]').click();await page.waitForFunction(()=>document.getElementById('httpStatus').textContent==='Нет ответа');assert.equal(await page.locator('[data-method]:disabled').count(),0);pass('сетевая ошибка и восстановление формы');
assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length,cookies:document.cookie})),{local:0,session:0,cookies:''});pass('данные не сохраняются в хранилище');
await page.reload();assert.equal(await page.locator('#apiTokenInstance').inputValue(),'');pass('после перезагрузки токен пустой');
await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'presentation/mobile.png',fullPage:true});pass('мобильный экран: нет горизонтальной прокрутки');
await page.setViewportSize({width:320,height:700});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));pass('узкий экран 320 px');
assert.deepEqual(problems,[]);pass('нет ошибок JavaScript');await context.close();
if(record){
  const videoContext=await browser.newContext({viewport:{width:1280,height:1600},recordVideo:{dir:'test-results/video',size:{width:1280,height:1600}},reducedMotion:'reduce'});
  const demo=await videoContext.newPage();await demo.route('https://**.greenapi.com/**',async route=>{await new Promise(r=>setTimeout(r,700));const method=route.request().url().split('/').at(-2);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(method==='getSettings'?{wid:'77770000000@c.us',webhookUrl:'',delaySendMessagesMilliseconds:5000,incomingWebhook:'no'}:method==='getStateInstance'?{stateInstance:'authorized'}:{idMessage:'DEMO_RESPONSE_ONLY'})});});
  await demo.goto(base);await demo.evaluate(()=>{const banner=document.createElement('div');banner.textContent='ДЕМОНСТРАЦИЯ · Тестовые ответы API. Реальная отправка в WhatsApp не выполняется.';banner.style.cssText='padding:13px 20px;background:#fff3cd;color:#705512;font:600 13px Segoe UI;text-align:center';document.body.prepend(banner);});
  const pause=ms=>demo.waitForTimeout(ms);await pause(2500);
  await demo.locator('#idInstance').pressSequentially('1103000000',{delay:100});await demo.locator('#apiTokenInstance').pressSequentially('demo-token',{delay:100});await pause(1500);
  for(const method of ['getSettings','getStateInstance']){await demo.locator(`[data-method="${method}"]`).click();await pause(3500);}
  await demo.locator('#messageChatId').pressSequentially('77770000000',{delay:80});await demo.locator('#message').pressSequentially('Привет! Проверка GREEN-API.',{delay:65});await pause(900);await demo.locator('[data-method="sendMessage"]').click();await pause(4000);
  await demo.locator('#fileChatId').fill('77770000000');await pause(700);await demo.locator('#urlFile').pressSequentially('https://example.com/horse.png',{delay:70});await pause(1000);await demo.locator('[data-method="sendFileByUrl"]').click();await pause(4500);
  const v=demo.video();await videoContext.close();await v.saveAs('test-results/demo.webm');
}
await writeFile('test-results/browser-results.json',JSON.stringify({date:new Date().toISOString(),base,checks,failures:problems},null,2));await browser.close();
