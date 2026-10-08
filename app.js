import {validateCredentials,normalizeApiUrl,normalizeChatId,buildFilePayload,callApi} from './api.js';
const $=id=>document.getElementById(id);
const buttons=[...document.querySelectorAll('[data-method]')];
let pending=false;
function status(text,tone=''){ $('status').textContent=text;$('status').dataset.tone=tone; }
function httpHint(code){
  if(code===400) return 'Проверьте параметры запроса и состояние инстанса.';
  if(code===401||code===403) return 'Проверьте idInstance, токен и apiUrl в личном кабинете.';
  if(code===404) return 'Проверьте apiUrl и idInstance.';
  if(code===429||code===466) return 'Достигнут лимит. Проверьте ограничения тарифа и частоту запросов.';
  if(code>=500) return 'Ошибка сервиса. Перед повторной отправкой проверьте, не получено ли сообщение.';
  return 'Подробности ошибки указаны в ответе API.';
}
async function run(method){
  if(pending) return;
  const id=$('idInstance').value.trim();const token=$('apiTokenInstance').value.trim();
  let payload;
  try {
    validateCredentials(id,token);normalizeApiUrl($('apiUrl').value.trim());
    if(method==='sendMessage'){
      const message=$('message').value;
      if(!message.trim()) throw new Error('Введите текст сообщения.');
      if(message.length>20000) throw new Error('Сообщение не должно превышать 20 000 символов.');
      payload={chatId:normalizeChatId($('messageChatId').value),message};
    }
    if(method==='sendFileByUrl') payload=buildFilePayload($('fileChatId').value,$('urlFile').value,$('fileName').value,$('caption').value);
  }catch(error){$('methodLabel').textContent=method;$('httpStatus').textContent='Не отправлено';$('response').value='';status(error.message,'error');return;}
  pending=true;buttons.forEach(button=>button.disabled=true);
  document.querySelector('.response-panel').setAttribute('aria-busy','true');
  const active=buttons.find(button=>button.dataset.method===method);active.textContent=`${method}…`;
  $('methodLabel').textContent=method;$('httpStatus').textContent='Ожидание';$('response').value='';status('Выполняется запрос…');
  const start=performance.now();
  try{
    const result=await callApi({apiUrl:$('apiUrl').value.trim(),id,token,method,payload});
    $('response').value=result.text;$('httpStatus').textContent=`HTTP ${result.status} · ${((performance.now()-start)/1000).toFixed(1)} с`;
    if(!result.ok) status(`Ошибка HTTP ${result.status}. ${httpHint(result.status)}`,'error');
    else if(method.startsWith('send')) status(result.data?.idMessage ? 'Запрос принят. Сообщение добавлено в очередь; проверьте доставку в WhatsApp.' : 'Ответ получен. Проверьте результат в поле ответа.','success');
    else if(method==='getStateInstance') {
      const hints={authorized:'Инстанс авторизован.',notAuthorized:'Инстанс не авторизован. Подключите WhatsApp по QR-коду.',starting:'Инстанс запускается. Подождите и повторите проверку.',blocked:'Инстанс заблокирован. Обратитесь в поддержку GREEN-API.',suspended:'На инстансе действуют временные ограничения.',sleepMode:'Инстанс в спящем режиме. Проверьте подключение телефона.'};
      status(hints[result.data?.stateInstance]||'Ответ о состоянии инстанса получен.',result.data?.stateInstance==='authorized'?'success':'');
    }else status('Настройки инстанса получены.','success');
  }catch(error){$('response').value=JSON.stringify({error:error.message},null,2);$('httpStatus').textContent='Нет ответа';status(error.message,'error');}
  finally{pending=false;buttons.forEach(button=>button.disabled=false);active.textContent=method;document.querySelector('.response-panel').setAttribute('aria-busy','false');}
}
buttons.forEach(button=>button.addEventListener('click',()=>run(button.dataset.method)));
$('toggleToken').addEventListener('click',()=>{const show=$('apiTokenInstance').type==='password';$('apiTokenInstance').type=show?'text':'password';$('toggleToken').textContent=show?'Скрыть':'Показать';$('toggleToken').setAttribute('aria-label',show?'Скрыть токен':'Показать токен');$('toggleToken').setAttribute('aria-pressed',String(show));});
