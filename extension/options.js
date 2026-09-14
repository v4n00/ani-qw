import { authorizationURL } from './auth.js';
const $ = id => document.getElementById(id);
async function request(type, data = {}) { const result = await chrome.runtime.sendMessage({ type, ...data }); if (result.error) throw new Error(result.error); return result.data; }
function account(user) { $('account').textContent = user ? `Connected as ${user.name}` : 'Not connected'; $('disconnect').hidden = !user; }
$('get-token').href = authorizationURL();
try { account((await request('settings')).user); } catch (e) { $('message').textContent = e.message; }
$('disconnect').onclick = async () => { try { await request('disconnect'); account(null); $('message').textContent = 'Disconnected. Saved watch events will wait until this account reconnects.'; } catch (e) { $('message').textContent = e.message; } };
$('token-connect').onsubmit = async e => {
  e.preventDefault(); const button = e.submitter; button.disabled = true;
  $('message').textContent = 'Checking your AniList account…';
  const token = $('token').value; $('token').value = '';
  try { const data = await request('token', { token }); account(data.user); $('message').textContent = 'Connected. Return to an anime page and press Play.'; }
  catch (e) { $('message').textContent = e.message; }
  finally { button.disabled = false; $('message').scrollIntoView({ block: 'nearest' }); }
};
