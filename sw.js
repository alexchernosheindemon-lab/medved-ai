const CACHE='medved-v6';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.open(CACHE).then(async c=>{
    try{const f=await fetch(e.request);if(new URL(e.request.url).origin===location.origin)c.put(e.request,f.clone());return f;}
    catch{const m=await c.match(e.request);return m||Response.error();}
  }));
});
