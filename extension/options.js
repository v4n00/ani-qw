const chrome = globalThis.browser || globalThis.chrome;
import { authorizationURL } from './auth.js';
const $ = id => document.getElementById(id);
async function request(type, data = {}) { const result = await chrome.runtime.sendMessage({ type, ...data }); if (result.error) throw new Error(result.error); return result.data; }
let connectedUser = null;
function buttonStatus(id, text, error = false) {
  const node = $(id); node.textContent = text;
  const button = node.closest('button'); button.title = text;
  button.classList.toggle('error', error);
}
function account(user) {
  connectedUser = user;
  $('account-label').textContent = user ? 'Disconnect AniList' : 'Connect AniList';
  buttonStatus('account-status', user ? user.name : 'Not connected');
  $('connect-fields').hidden = true;
  $('account-action').setAttribute('aria-expanded', 'false');
}
$('get-token').href = authorizationURL();
try { account((await request('settings')).user); } catch (e) { buttonStatus('account-status', e.message, true); }
$('account-action').onclick = async () => {
  if (!connectedUser) {
    $('connect-fields').hidden = !$('connect-fields').hidden;
    $('account-action').setAttribute('aria-expanded', String(!$('connect-fields').hidden));
    if (!$('connect-fields').hidden) $('token').focus();
    return;
  }
  $('account-action').disabled = true;
  try { await request('disconnect'); account(null); }
  catch (e) { buttonStatus('account-status', e.message, true); }
  finally { $('account-action').disabled = false; }
};
$('token-connect').onsubmit = async e => {
  e.preventDefault(); const button = e.submitter; button.disabled = true;
  $('account-action').disabled = true;
  button.textContent = 'Connecting…';
  const token = $('token').value; $('token').value = '';
  try { const data = await request('token', { token }); account(data.user); }
  catch (e) { buttonStatus('account-status', e.message, true); }
  finally { button.disabled = false; button.textContent = 'Connect AniList'; $('account-action').disabled = false; }
};
function resolutionBadge() {
  const value = $('resolution').value;
  $('resolution-badge').textContent = value === '1080p' ? 'FHD' : value === '720p' ? 'HD' : '';
  $('resolution-badge').hidden = value === 'auto';
  $('resolution-value').textContent = value === 'auto' ? 'Auto' : value;
  $('resolution-value').classList.toggle('automatic', value === 'auto');
}
$('resolution').onchange = resolutionBadge;

async function loadCache() {
  $('check-helper').disabled = true; buttonStatus('helper-message', 'Connecting…');
  try { const s = await request('cacheSettings'); $('cache-size').value = s.cacheGiB; $('watched-percent').value = s.watchedPercent || 80; $('seeding').checked = s.seeding !== false; $('keep-video').checked = s.keepVideo !== false; $('resolution').value=s.resolution || '1080p';$('preferred-group').value=s.preferredGroup || '';cacheVisibility(); resolutionBadge(); buttonStatus('helper-message', 'Connected'); }
  catch(e) { buttonStatus('helper-message', e.message, true); }
  finally { $('check-helper').disabled = false; }
}
$('check-helper').onclick = loadCache;
$('cache-settings').onsubmit = async e => {
  e.preventDefault(); e.submitter.disabled = true;
  try { await request('saveCache', {cacheGiB:Number($('cache-size').value),watchedPercent:Number($('watched-percent').value),seeding:$('seeding').checked,keepVideo:$('keep-video').checked,resolution:$('resolution').value,preferredGroup:$('preferred-group').value.trim()}); $('cache-message').textContent = 'Preferences saved.'; }
  catch(e) { $('cache-message').textContent = e.message; }
  finally { e.submitter.disabled = false; }
};
function cacheVisibility() { $('cache-size-row').hidden = !$('keep-video').checked; $('cache-size').disabled = !$('keep-video').checked; }
$('keep-video').onchange = cacheVisibility;
loadCache();

const current = chrome.runtime.getManifest().version;
buttonStatus('update-message', `Current ${current}`);
$('check-updates').onclick = async () => {
  $('check-updates').disabled = true; $('release-link').hidden = true; $('update-command').hidden = true;
  buttonStatus('update-message', `Current ${current} · Checking…`);
  try {
    const release = await request('updates');
    const current = chrome.runtime.getManifest().version;
    const compare = (a,b) => { const x=a.replace(/^v/,'').split('.').map(Number), y=b.replace(/^v/,'').split('.').map(Number); for(let i=0;i<3;i++) if(x[i]!==y[i]) return x[i]-y[i]; return 0; };
    $('update-label').textContent = compare(release.version,current)>0 ? 'Update available' : 'Check for updates';
    buttonStatus('update-message', `Current ${current} · Latest ${release.version}` + (release.helperVersion && release.helperVersion !== current ? ` · Helper ${release.helperVersion}` : ''));
    $('update-command').hidden = compare(release.version,current) <= 0 && (!release.helperVersion || compare(release.version,release.helperVersion) <= 0);
    $('release-link').href = release.url; $('release-link').hidden = false;
  } catch(e) { buttonStatus('update-message', e.message, true); }
  finally { $('check-updates').disabled = false; }
};
