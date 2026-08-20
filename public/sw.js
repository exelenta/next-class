const CACHE="next-class-v1",ASSETS=["/","/styles.css","/app.js","/icon.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET"||new URL(e.request.url).pathname.startsWith("/api/"))return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)))});
self.addEventListener("push",e=>{let data={title:"다음 수업",body:"수업 시간을 확인해 주세요.",url:"/"};try{data={...data,...e.data.json()}}catch{}e.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:"/icon.svg",badge:"/icon.svg",tag:data.tag||"next-class",data:{url:data.url||"/"}}))});
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{const open=list.find(c=>"focus" in c);return open?open.focus():clients.openWindow(e.notification.data?.url||"/")}))});
