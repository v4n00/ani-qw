// Synthetic options preview; never uses credentials or the real helper.
let cacheGiB = 20, watchedPercent=80;
window.chrome = {runtime:{async sendMessage(m){
 if(m.type==='settings')return {data:{user:{id:1,name:'Example viewer'}}};
 if(m.type==='cacheSettings')return {data:{cacheGiB,watchedPercent}};
 if(m.type==='saveCache'){cacheGiB=m.cacheGiB;watchedPercent=m.watchedPercent;return {data:{cacheGiB,watchedPercent}};}
 return {data:{}};
}}};
