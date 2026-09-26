// Synthetic options preview; never uses credentials or the real helper.
let preferences = {cacheGiB:20,watchedPercent:80,seeding:true,keepVideo:true,resolution:'1080p',preferredGroup:''};
let user = {id:1,name:'Example viewer'};
window.chrome = {runtime:{getManifest(){return {version:"1.0.0"}},async sendMessage(m){
 if(m.type==='updates')return {data:{version:'1.1.0',helperVersion:'1.0.0',url:'https://github.com/v4n00/ani-qw/releases'}};
 if(m.type==='settings')return {data:{user}};
 if(m.type==='disconnect'){user=null;return {data:{}};}
 if(m.type==='token'){user={id:1,name:'Example viewer'};return {data:{user}};}
 if(m.type==='cacheSettings')return {data:preferences};
 if(m.type==='saveCache'){const {type,...values}=m;Object.assign(preferences,values);return {data:preferences};}
 return {data:{}};
}}};
