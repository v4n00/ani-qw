import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('Firefox package uses a module event page, fixed native identity and matching version',()=>{
 const read=name=>JSON.parse(readFileSync(new URL('../extension/'+name,import.meta.url)));
 const firefox=read('manifest.firefox.json'),chromium=read('manifest.json');
 assert.equal(firefox.version,chromium.version);
 assert.deepEqual(firefox.background,{scripts:['background.js'],type:'module'});
 assert.equal(firefox.browser_specific_settings.gecko.id,'ani-qw@v4n00.github.io');
 assert.ok(!firefox.key);
 assert.ok(firefox.permissions.includes('nativeMessaging'));
 assert.deepEqual(firefox.content_scripts,chromium.content_scripts);
});
