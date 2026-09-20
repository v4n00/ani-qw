import { authorizationURL } from './auth.js';
const $ = id => document.getElementById(id);
async function request(type, data = {}) { const result = await chrome.runtime.sendMessage({ type, ...data }); if (result.error) throw new Error(result.error); return result.data; }
function account(user) { $('account').textContent = user ? `Connected as ${user.name}` : 'Not connected'; $('disconnect').hidden = !user; $('connect-fields').hidden = !!user; }
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

async function loadCache() {
  $('helper-message').textContent = 'Connecting to the Linux helper…';
  try { const s = await request('cacheSettings'); $('cache-size').value = s.cacheGiB; $('watched-percent').value = s.watchedPercent || 80; $('seeding').checked = s.seeding !== false; $('keep-video').checked = s.keepVideo !== false; cacheVisibility(); $('helper-message').textContent = 'Helper connected'; }
  catch(e) { $('helper-message').textContent = `${e.message} Update the helper if necessary, then check again.`; }
}
$('check-helper').onclick = loadCache;
$('cache-settings').onsubmit = async e => {
  e.preventDefault(); e.submitter.disabled = true;
  try { await request('saveCache', {cacheGiB:Number($('cache-size').value),watchedPercent:Number($('watched-percent').value),seeding:$('seeding').checked,keepVideo:$('keep-video').checked}); $('cache-message').textContent = 'Preferences saved.'; }
  catch(e) { $('cache-message').textContent = e.message; }
  finally { e.submitter.disabled = false; }
};
function cacheVisibility() { $('cache-size-row').hidden = !$('keep-video').checked; $('cache-size').disabled = !$('keep-video').checked; }
$('keep-video').onchange = cacheVisibility;
loadCache();

$('check-updates').onclick = async () => {
  $('check-updates').disabled = true; $('release-link').hidden = true; $('update-command').hidden = true;
  $('update-message').textContent = 'Checking the latest published release…';
  try {
    const release = await request('updates');
    const current = chrome.runtime.getManifest().version;
    const compare = (a,b) => { const x=a.replace(/^v/,'').split('.').map(Number), y=b.replace(/^v/,'').split('.').map(Number); for(let i=0;i<3;i++) if(x[i]!==y[i]) return x[i]-y[i]; return 0; };
    $('update-message').textContent = compare(release.version,current)>0 ? `Version ${release.version} is available (installed ${current}). Rerun the installer, then reload the extension.` : `You’re up to date (${current}). Latest release: ${release.version}.`;
    if(release.helperVersion && release.helperVersion !== current) $('update-message').textContent += ` Helper version: ${release.helperVersion}; reinstall matching helper and extension versions.`;
    $('update-command').hidden = compare(release.version,current) <= 0 && (!release.helperVersion || compare(release.version,release.helperVersion) <= 0);
    $('release-link').href = release.url; $('release-link').hidden = false;
  } catch(e) { $('update-message').textContent = e.message; }
  finally { $('check-updates').disabled = false; }
};
