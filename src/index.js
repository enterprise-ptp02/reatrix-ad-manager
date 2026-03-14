export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

    // API: AMBIL DATA (Force No-Cache agar Real-Time)
    if (url.pathname === "/api/stats") {
      const adList = await env.AD_MANAGER_KV.list({ prefix: "ad:" });
      const ads = [];
      for (const key of adList.keys) {
        const data = await env.AD_MANAGER_KV.get(key.name, "json");
        if (data) ads.push(data);
      }
      return new Response(JSON.stringify(ads), { 
        headers: { 
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Access-Control-Allow-Origin": "*"
        } 
      });
    }

    if (url.pathname === "/api/toggle" && request.method === "POST") {
      const { slug } = await request.json();
      const adData = await env.AD_MANAGER_KV.get(`ad:${slug}`, "json");
      if (adData) {
        adData.active = !adData.active;
        await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
        return new Response(JSON.stringify({ success: true }));
      }
    }

    if (url.pathname === "/api/create" && request.method === "POST") {
      const formData = await request.formData();
      const slug = formData.get("slug").toLowerCase().replace(/\s+/g, '-');
      const file = formData.get("banner");
      const fileName = `${Date.now()}-${file.name}`;
      await env.AD_BUCKET.put(fileName, file.stream(), { httpMetadata: { contentType: file.type } });
      
      const adData = {
        client: formData.get("client"),
        path: slug,
        target_url: formData.get("target"),
        banner_url: `${url.origin}/view/${fileName}`,
        price: parseFloat(formData.get("price")) || 0,
        clicks: 0,
        views: 0,
        active: true,
        history: Array.from({length: 12}, () => 0)
      };
      await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === "/api/delete" && request.method === "POST") {
      const { slug } = await request.json();
      await env.AD_MANAGER_KV.delete(`ad:${slug}`);
      return new Response(JSON.stringify({ success: true }));
    }

    if (path.startsWith("view/")) {
      const fileName = path.replace("view/", "");
      const object = await env.AD_BUCKET.get(fileName);
      if (!object) return new Response("Not Found", { status: 404 });
      return new Response(object.body, { headers: { "Content-Type": object.httpMetadata.contentType, "Access-Control-Allow-Origin": "*" } });
    }

    // TRACKER & REDIRECT (FIX DOUBLE CLICK & DELAY)
    if (path && !["api", "view"].includes(path.split('/')[0])) {
      // Abaikan request favicon atau prefetch browser agar tidak terhitung click
      const purpose = request.headers.get("Purpose") || request.headers.get("Sec-Purpose") || "";
      if (purpose === "prefetch" || path === "favicon.ico") {
        return new Response(null, { status: 204 });
      }

      const adData = await env.AD_MANAGER_KV.get(`ad:${path}`, "json");
      if (adData) {
        if (adData.active === false) return new Response(renderErrorPage(), { headers: { "Content-Type": "text/html" }, status: 403 });
        
        // Update stats secara asinkron agar redirect lebih cepat
        adData.clicks = (parseInt(adData.clicks) || 0) + 1;
        adData.views = (parseInt(adData.views) || 0) + 1;
        
        // Gunakan KV put tanpa menunggu (waitUntil) jika didukung, atau langsung agar konsisten
        await env.AD_MANAGER_KV.put(`ad:${path}`, JSON.stringify(adData));
        
        // Redirect dengan 307 agar browser tidak meng-cache redirect
        return new Response(null, {
          status: 307,
          headers: { "Location": adData.target_url, "Cache-Control": "no-cache" }
        });
      }
    }

    return new Response(renderHTML(), { headers: { "Content-Type": "text/html" } });
  }
};

function renderErrorPage() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-slate-50 flex items-center justify-center min-h-screen p-6 font-sans"><div class="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl text-center border border-slate-100"><div class="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6"><svg class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg></div><h1 class="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Campaign Nonaktif</h1><p class="text-slate-500 text-sm leading-relaxed mb-6">Iklan ini telah dinonaktifkan oleh Reatrix Admin.</p><a href="/" class="inline-block bg-slate-900 text-white px-6 py-2 rounded-xl text-xs font-bold tracking-widest hover:bg-slate-800 transition">BACK TO HOME</a></div></body></html>`;
}

function renderHTML() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reatrix AdSense</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
        body { background: #f4f7fe; font-family: 'Inter', sans-serif; color: #1a202c; }
        .ad-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; }
        .swal2-popup.reatrix-modal { border-radius: 20px; padding: 1.5rem; width: 90% !important; max-width: 450px !important; border: none; }
        .input-pro { width: 100%; padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 12px; font-size: 13px; outline: none; transition: 0.2s; background: #f9fafb; }
        .input-pro:focus { border-color: #2563eb; background: white; box-shadow: 0 0 0 4px rgba(37,99,235,0.05); }
    </style>
</head>
<body class="p-4">
    <div class="max-w-md mx-auto">
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-xl font-extrabold tracking-tight text-slate-900 uppercase">Reatrix <span class="text-blue-600">AdSense</span></h1>
            <button onclick="addAd()" class="bg-blue-600 text-white p-2 px-4 rounded-lg font-bold text-xs shadow-md active:scale-95 transition">+ Campaign</button>
        </div>

        <div id="stats" class="grid grid-cols-2 gap-3 mb-6 text-slate-900 font-black"></div>

        <div class="ad-card overflow-hidden">
            <div class="p-3 bg-slate-50 border-b flex justify-between items-center">
                <span class="text-[10px] font-bold text-slate-500 uppercase">Performance Live</span>
                <div class="flex items-center gap-1"><span class="w-2 h-2 bg-green-500 rounded-full animate-ping"></span><span class="text-[9px] font-bold text-green-600 uppercase">Real-Time Sync</span></div>
            </div>
            <div id="list" class="divide-y divide-slate-100"></div>
        </div>
    </div>

    <script>
        let lastData = "";

        async function load() {
            try {
                // Tambahkan timestamp agar tidak di-cache oleh browser dasbor
                const res = await fetch('/api/stats?t=' + Date.now());
                const ads = await res.json();
                
                // Cek jika data berubah, baru update UI (mencegah flicker)
                const currentData = JSON.stringify(ads);
                if(currentData === lastData) return;
                lastData = currentData;

                const totalClicks = ads.reduce((a, b) => a + (parseInt(b.clicks) || 0), 0);
                const totalViews = ads.reduce((a, b) => a + (parseInt(b.views) || totalClicks + 5), 0);
                const totalRev = ads.reduce((a, b) => a + ((parseInt(b.clicks) || 0) * (parseFloat(b.price) || 0)), 0);
                const avgCTR = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : "0.00";

                document.getElementById('stats').innerHTML = \`
                    <div class="ad-card p-4"><p class="text-[9px] text-slate-400 font-bold">EST. REVENUE</p><p class="text-lg text-green-600">Rp\${totalRev.toLocaleString()}</p></div>
                    <div class="ad-card p-4"><p class="text-[9px] text-slate-400 font-bold">PAGE VIEWS</p><p class="text-lg">\${totalViews}</p></div>
                    <div class="ad-card p-4"><p class="text-[9px] text-slate-400 font-bold">CLICKS</p><p class="text-lg">\${totalClicks}</p></div>
                    <div class="ad-card p-4"><p class="text-[9px] text-slate-400 font-bold">AVG. CTR</p><p class="text-lg text-orange-500">\${avgCTR}%</p></div>\`;

                document.getElementById('list').innerHTML = ads.map(ad => {
                    const isActive = ad.active !== false;
                    const revenue = (parseInt(ad.clicks) || 0) * (parseFloat(ad.price) || 0);
                    return \`
                    <div class="p-4 bg-white">
                        <div class="flex gap-3 items-center mb-4">
                            <img src="\${ad.banner_url}" class="w-12 h-12 rounded-lg object-cover border \${!isActive ? 'grayscale opacity-50' : ''}">
                            <div class="flex-grow min-w-0">
                                <p class="text-[11px] font-black uppercase truncate">\${ad.client}</p>
                                <div class="flex items-center gap-2">
                                    <p class="text-[10px] text-blue-500 font-mono italic">/\${ad.path}</p>
                                    <span class="text-[8px] font-bold px-1 rounded \${isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'} uppercase">\${isActive ? 'Active' : 'Off'}</span>
                                </div>
                            </div>
                            <button onclick="toggleAd('\${ad.path}')" class="p-2 border rounded-xl hover:bg-slate-50 transition">
                                <svg class="w-4 h-4 \${isActive ? 'text-slate-300' : 'text-red-500'}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                            </button>
                        </div>
                        
                        <div class="grid grid-cols-3 gap-2 mb-4 bg-slate-50 p-2 rounded-lg border border-dashed font-black">
                            <div class="text-center"><p class="text-[8px] text-slate-400 uppercase">Clicks</p><p class="text-[11px]">\${ad.clicks}</p></div>
                            <div class="text-center border-x border-slate-200"><p class="text-[8px] text-slate-400 uppercase">CTR</p><p class="text-[11px] text-orange-500">\${((ad.clicks/(ad.views||1))*100).toFixed(2)}%</p></div>
                            <div class="text-center"><p class="text-[8px] text-slate-400 uppercase">Earn</p><p class="text-[11px] text-green-600">Rp\${revenue.toLocaleString()}</p></div>
                        </div>

                        <div class="flex justify-between gap-1.5">
                            <button onclick="copy('\${window.location.origin}/\${ad.path}')" class="flex-1 py-2 bg-white border text-[9px] font-bold rounded-lg hover:bg-slate-50 uppercase transition">Link</button>
                            <button onclick="embed('\${window.location.origin}/\${ad.path}', '\${ad.banner_url}')" class="flex-1 py-2 bg-blue-600 text-white text-[9px] font-bold rounded-lg hover:bg-blue-700 uppercase transition">SEO</button>
                            <button onclick="copy('\${ad.banner_url}')" class="flex-1 py-2 bg-white border text-[9px] font-bold rounded-lg hover:bg-slate-50 uppercase transition">IMG</button>
                            <button onclick="del('\${ad.path}')" class="px-3 text-red-500 hover:bg-red-50 rounded-lg border border-red-50">
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </div>
                    </div>\`;
                }).join('');
            } catch (e) { console.error("Sync Error", e); }
        }

        function addAd() {
            Swal.fire({
                title: '<div class="text-left font-black text-slate-900">NEW CAMPAIGN</div>',
                customClass: { popup: 'reatrix-modal' },
                html: \`
                <div class="text-left mt-4">
                    <label class="text-[10px] font-bold text-slate-400 ml-1">CLIENT NAME</label>
                    <input id="sw-client" class="input-pro" placeholder="e.g. Samsung">
                    <div class="grid grid-cols-2 gap-3">
                        <div><label class="text-[10px] font-bold text-slate-400 ml-1">SLUG</label><input id="sw-slug" class="input-pro" placeholder="samsung-s24"></div>
                        <div><label class="text-[10px] font-bold text-slate-400 ml-1">CPC (RP)</label><input id="sw-price" type="number" class="input-pro" placeholder="1000"></div>
                    </div>
                    <label class="text-[10px] font-bold text-slate-400 ml-1">TARGET URL</label>
                    <input id="sw-target" class="input-pro" placeholder="https://...">
                    <label class="text-[10px] font-bold text-slate-400 ml-1">BANNER IMAGE</label>
                    <input id="sw-file" type="file" class="input-pro !py-2 text-[11px]" accept="image/*">
                </div>\`,
                showCancelButton: true,
                confirmButtonColor: '#2563eb',
                confirmButtonText: 'DEPLOY',
                preConfirm: () => {
                    const fd = new FormData();
                    fd.append('client', document.getElementById('sw-client').value);
                    fd.append('slug', document.getElementById('sw-slug').value);
                    fd.append('target', document.getElementById('sw-target').value);
                    fd.append('price', document.getElementById('sw-price').value);
                    fd.append('banner', document.getElementById('sw-file').files[0]);
                    return fd;
                }
            }).then(r => r.isConfirmed && fetch('/api/create',{method:'POST',body:r.value}).then(()=>load()));
        }

        async function toggleAd(slug) {
            await fetch('/api/toggle', { method: 'POST', body: JSON.stringify({ slug }) });
            load();
        }

        function copy(t) { navigator.clipboard.writeText(t); Swal.fire({toast:true, position:'top', icon:'success', title:'Copied', showConfirmButton:false, timer:800}); }
        function embed(p, i) {
            const code = \`<a href="\${p}"><img src="\${i}" width="100%"></a>\`;
            Swal.fire({ title:'SEO CODE', html:\`<textarea readonly class="w-full h-24 p-3 text-[10px] font-mono border rounded-xl bg-slate-50">\${code}</textarea>\` });
        }
        function del(s) {
            Swal.fire({ title:'Iklan Akan DiHapus, Dari Data Base', icon:'warning', showCancelButton:true, confirmButtonColor:'#ef4444' }).then(r => {
                if(r.isConfirmed) fetch('/api/delete',{method:'POST',body:JSON.stringify({slug:s})}).then(()=>load());
            });
        }

        // Jalankan sinkronisasi cepat (1 detik) tanpa harus refresh browser
        load();
        setInterval(load, 1000); 
    </script>
</body>
</html>`;
}
