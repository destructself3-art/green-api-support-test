import test from 'node:test';
import assert from 'node:assert/strict';
import {METHODS,normalizeChatId,normalizeApiUrl,validateCredentials,buildFilePayload,redact,callApi} from '../api.js';
test('международный номер нормализуется без изменения кода страны',()=>assert.equal(normalizeChatId('+7 (777) 123-45-67'),'77771234567@c.us'));
test('личный chatId сохраняется',()=>assert.equal(normalizeChatId('77771234567@c.us'),'77771234567@c.us'));
test('современный групповой chatId сохраняется',()=>assert.equal(normalizeChatId('120363043968066561@g.us'),'120363043968066561@g.us'));
test('старый групповой chatId сохраняется',()=>assert.equal(normalizeChatId('77771234567-1234567890@g.us'),'77771234567-1234567890@g.us'));
test('lid сохраняется',()=>assert.equal(normalizeChatId('123456789012345@lid'),'123456789012345@lid'));
test('ошибочные номера отклоняются',()=>{for(const input of ['', '123','abc77771234567','77771234567@evil.com','+7oops'])assert.throws(()=>normalizeChatId(input));});
test('apiUrl принимает официальный общий и региональный хост',()=>{for(const host of ['api.greenapi.com','api.green-api.com','1103.api.green-api.com'])assert.equal(normalizeApiUrl('https://'+host+'/'),'https://'+host);});
test('защита от передачи токена на чужой хост',()=>{for(const url of ['https://evil.com','https://green-api.com.evil.com','http://api.greenapi.com','https://api.greenapi.com/path','https://a:b@api.greenapi.com','https://api.greenapi.com:8080','https://api.greenapi.com?token=x','https://api.greenapi.com#x'])assert.throws(()=>normalizeApiUrl(url));});
test('пустые и повреждённые данные подключения отклоняются',()=>{for(const [id,token] of [['','token'],['abc','token'],['1103',''],['1103','a b']])assert.throws(()=>validateCredentials(id,token));});
test('имя файла выводится из pathname без query',()=>assert.deepEqual(buildFilePayload('77771234567','https://example.com/horse.png?download=1','',''),{chatId:'77771234567@c.us',urlFile:'https://example.com/horse.png?download=1',fileName:'horse.png'}));
test('имя файла можно указать для ссылки без расширения',()=>assert.equal(buildFilePayload('77771234567','https://example.com/download','report.pdf','').fileName,'report.pdf'));
test('подпись и имя передаются без потерь',()=>assert.equal(buildFilePayload('77771234567','https://example.com/file.pdf','Отчёт.pdf','Документ').caption,'Документ'));
test('неподдерживаемый протокол и файл без имени отклоняются',()=>{for(const url of ['javascript:alert(1)','file:///a.pdf','https://example.com/'])assert.throws(()=>buildFilePayload('77771234567',url,'',''));});
test('сохранение кириллического имени файла',()=>assert.equal(buildFilePayload('77771234567','https://example.com/%D0%A2%D0%B5%D1%81%D1%82.pdf','','').fileName,'Тест.pdf'));
test('токен удаляется из текста ответа',()=>assert.equal(redact('token=a/b encoded=a%2Fb','a/b'),'token=[токен скрыт] encoded=[токен скрыт]'));
for(const [method,verb] of Object.entries(METHODS))test(`${method}: URL, HTTP-метод и тело запроса`,async()=>{
  const payload=method==='sendMessage'?{chatId:'77771234567@c.us',message:'Привет 👋'}:method==='sendFileByUrl'?{chatId:'77771234567@c.us',urlFile:'https://example.com/a.pdf',fileName:'a.pdf'}:undefined;
  const result=await callApi({apiUrl:'https://1103.api.green-api.com',id:'1103000000',token:'test-token',method,payload,fetchImpl:async(url,options)=>{
    assert.equal(url,`https://1103.api.green-api.com/waInstance1103000000/${method}/test-token`);assert.equal(options.method,verb);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
    if(verb==='POST'){assert.deepEqual(JSON.parse(options.body),payload);assert.equal(options.headers['Content-Type'],'application/json');}else{assert.equal(options.body,undefined);}
    return new Response(JSON.stringify({ok:true}),{status:200});
  }});assert.equal(result.ok,true);assert.equal(result.text,'{\n  "ok": true\n}');
});
test('HTTP 403 сохраняет код и тело без утечки токена',async()=>{const r=await callApi({apiUrl:'https://api.greenapi.com',id:'1103',token:'secret-test',method:'getSettings',fetchImpl:async()=>new Response('Denied secret-test',{status:403})});assert.equal(r.ok,false);assert.equal(r.status,403);assert.equal(r.text,'Denied [токен скрыт]');});
test('пустой успешный ответ обрабатывается',async()=>{const r=await callApi({apiUrl:'https://api.greenapi.com',id:'1103',token:'test',method:'getSettings',fetchImpl:async()=>new Response(null,{status:204})});assert.equal(r.text,'(Пустой ответ)');});
test('сетевая ошибка не раскрывает URL и токен и не повторяет запрос',async()=>{let calls=0;await assert.rejects(callApi({apiUrl:'https://api.greenapi.com',id:'1103',token:'test',method:'sendMessage',payload:{},fetchImpl:async()=>{calls++;throw new Error('https://secret-url/test');}}),/Проверьте сеть/);assert.equal(calls,1);});
test('таймаут снимает зависшее ожидание',async()=>{await assert.rejects(callApi({apiUrl:'https://api.greenapi.com',id:'1103',token:'test',method:'sendMessage',timeoutMs:10,fetchImpl:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Timeout','AbortError'))))}),/Результат отправки неизвестен/);});
test('неизвестный метод отклоняется до запроса',async()=>{await assert.rejects(callApi({apiUrl:'https://api.greenapi.com',id:'1103',token:'test',method:'reboot',fetchImpl:()=>assert.fail('fetch not allowed')}),/Неизвестный/);});
