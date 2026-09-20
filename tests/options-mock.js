// Synthetic options preview; never uses credentials or the real helper.
let cacheGiB = 20, watchedPercent=80,seeding=true;
window.chrome = {runtime:{getManifest(){return {version:"0.1.9"}},async sendMessage(m){
 if(m.type==='updates')return {data:{version:'0.2.0',url:'https://github.com/v4n00/ani-qw/releases/tag/v0.2.0'}};
 if(m.type==='settings')return {data:{user:{id:1,name:'Example viewer'}}};
 if(m.type==='cacheSettings')return {data:{cacheGiB,watchedPercent,seeding}};
 if(m.type==='saveCache'){cacheGiB=m.cacheGiB;watchedPercent=m.watchedPercent;seeding=m.seeding;return {data:{cacheGiB,watchedPercent,seeding}};}
 return {data:{}};
}}};
