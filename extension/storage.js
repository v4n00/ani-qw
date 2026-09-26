// Firefox lacks storage.local.setAccessLevel. Use extension-origin IndexedDB
// there: content scripts use the web page's origin and cannot read this database.
export function trustedStorage(api) {
  if (api.storage.local.setAccessLevel) {
    const ready=api.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
    return {ready, storage:api.storage.local};
  }
  const ready=new Promise((resolve,reject)=>{
    const request=indexedDB.open('ani-qw-private',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('settings');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  const transaction=async(mode,action)=>{
    const db=await ready;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('settings',mode), result={};
      tx.oncomplete=()=>resolve(result);
      tx.onerror=tx.onabort=()=>reject(tx.error || new Error('Unable to save extension preferences'));
      action(tx.objectStore('settings'),result);
    });
  };
  return {ready,storage:{
    get:keys=>transaction('readonly',(store,result)=>{for(const key of typeof keys==='string'?[keys]:keys){const req=store.get(key);req.onsuccess=()=>{result[key]=req.result;};}}),
    set:values=>transaction('readwrite',store=>{for(const [key,value] of Object.entries(values))store.put(value,key);}),
    remove:keys=>transaction('readwrite',store=>{for(const key of typeof keys==='string'?[keys]:keys)store.delete(key);})
  }};
}
