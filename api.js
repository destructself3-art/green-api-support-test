export const METHODS = Object.freeze({getSettings:'GET',getStateInstance:'GET',sendMessage:'POST',sendFileByUrl:'POST'});
export function validateCredentials(id, token) {
  if (!/^\d+$/.test(id)) throw new Error('Укажите idInstance: только цифры.');
  if (!token || /\s/.test(token)) throw new Error('Укажите ApiTokenInstance без пробелов.');
}
export function normalizeApiUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Укажите корректный apiUrl из личного кабинета.'); }
  if (url.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)*(?:green-api\.com|greenapi\.com)$/.test(url.hostname) || url.username || url.password || url.port || !['','/'].includes(url.pathname) || url.search || url.hash) throw new Error('apiUrl должен быть HTTPS-адресом хоста GREEN-API без пути и параметров.');
  return url.origin;
}
export function normalizeChatId(value) {
  const raw = value.trim();
  if (/^\d{5,15}@c\.us$/.test(raw) || /^\d+(?:-\d+)?@g\.us$/.test(raw) || /^\d+@lid$/.test(raw)) return raw;
  const digits = raw.replace(/[+\s()-]/g, '');
  if (!/^\d{5,15}$/.test(digits)) throw new Error('Укажите международный номер с кодом страны или корректный chatId.');
  return `${digits}@c.us`;
}
export function buildFilePayload(chatId, value, name, caption) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Укажите прямую HTTP(S)-ссылку на файл.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Ссылка на файл должна начинаться с http:// или https:// и не содержать логин или пароль.');
  let derived = '';
  try { derived = decodeURIComponent(url.pathname.split('/').pop()); } catch { derived = url.pathname.split('/').pop(); }
  const fileName = name.trim() || derived;
  if (!fileName || !/\.[a-z0-9]{1,12}$/i.test(fileName) || /[\\/\x00-\x1f]/.test(fileName)) throw new Error('Укажите имя файла с расширением в разделе «Имя файла и подпись».');
  if (caption.length > 20000) throw new Error('Подпись не должна превышать 20 000 символов.');
  return { chatId:normalizeChatId(chatId), urlFile:value.trim(), fileName, ...(caption ? {caption} : {}) };
}
export function redact(text, token) {
  return token ? text.split(token).join('[токен скрыт]').split(encodeURIComponent(token)).join('[токен скрыт]') : text;
}
export async function callApi({apiUrl,id,token,method,payload,timeoutMs=45000,fetchImpl=fetch}) {
  validateCredentials(id,token);
  const base=normalizeApiUrl(apiUrl);
  if (!Object.hasOwn(METHODS,method)) throw new Error('Неизвестный метод API.');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetchImpl(`${base}/waInstance${id}/${method}/${encodeURIComponent(token)}`, {
      method:METHODS[method], signal:controller.signal, cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer', redirect:'error',
      ...(METHODS[method]==='POST' ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)} : {})
    });
    const raw=await response.text();
    let data=null; let text=raw;
    try {data=JSON.parse(raw);text=JSON.stringify(data,null,2);} catch {if (!raw) text='(Пустой ответ)';}
    return {ok:response.ok,status:response.status,data,text:redact(text,token)};
  } catch(error) {
    if (error.name==='AbortError') throw new Error('Сервер не ответил за 45 секунд. Результат отправки неизвестен: проверьте WhatsApp перед повтором.');
    throw new Error('Не удалось получить ответ. Проверьте сеть и apiUrl. Возможна ошибка CORS. Если отправляли сообщение или файл, проверьте WhatsApp перед повтором.');
  } finally {clearTimeout(timeout);}
}
