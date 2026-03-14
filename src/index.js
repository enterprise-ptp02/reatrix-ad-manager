export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

    // --- CLOUDFLARE ACCESS SECURITY LAYER ---
    // Dashboard & API hanya bisa diakses jika ada header dari CF Access
    const isDashboard = url.pathname === "/";
    const isApi = url.pathname.startsWith("/api/");
    const accessEmail = request.headers.get("cf-access-authenticated-user-email");

    if ((isDashboard || isApi) && !accessEmail) {
      return new Response("Unauthorized: Cloudflare Access Required", { status: 401 });
    }

    // 1. API: AMBIL DATA (Force No-Cache agar dashboard selalu terbaru)
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
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Access-Control-Allow-Origin": "*"
        } 
      });
    }

    // 2. API: TOGGLE STATUS
    if (url.pathname === "/api/toggle" && request.method === "POST") {
      const { slug } = await request.json();
      const adData = await env.AD_MANAGER_KV.get(`ad:${slug}`, "json");
      if (adData) {
        adData.active = !adData.active;
        await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
        return new Response(JSON.stringify({ success: true }));
      }
    }

    // 3. API: CREATE CAMPAIGN
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
        active: true
      };
      await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
      return new Response(JSON.stringify({ success: true }));
    }

    // 4. API: DELETE
    if (url.pathname === "/api/delete" && request.method === "POST") {
      const { slug } = await request.json();
      await env.AD_MANAGER_KV.delete(`ad:${slug}`);
      return new Response(JSON.stringify({ success: true }));
    }

    // 5. VIEW ASSET (Tanpa Proteksi Access agar Iklan Muncul di Web Utama)
    if (path.startsWith("view/")) {
      const fileName = path.replace("view/", "");
      const object = await env.AD_BUCKET.get(fileName);
      if (!object) return new Response("Not Found", { status: 404 });
      return new Response(object.body, { 
        headers: { 
          "Content-Type": object.httpMetadata.contentType,
          "Cache-Control": "public, max-age=86400" 
        } 
      });
    }

    // 6. TRACKER & REDIRECT (Fix Double Click & Real-time Update)
    if (path && !["api", "view"].includes(path.split('/')[0])) {
      const purpose = request.headers.get("Purpose") || request.headers.get("Sec-Purpose") || "";
      if (purpose === "prefetch" || path === "favicon.ico") return new Response(null, { status: 204 });

      const adData = await env.AD_MANAGER_KV.get(`ad:${path}`, "json");
      if (adData) {
        if (adData.active === false) return new Response(renderErrorPage(), { headers: { "Content-Type": "text/html" }, status: 403 });
        
        adData.clicks = (parseInt(adData.clicks) || 0) + 1;
        adData.views = (parseInt(adData.views) || 0) + 1;
        
        // Simpan data & Redirect dengan 307 (Temporary Redirect) untuk mencegah cache redirect browser
        await env.AD_MANAGER_KV.put(`ad:${path}`, JSON.stringify(adData));
        
        return new Response(null, {
          status: 307,
          headers: { 
            "Location": adData.target_url, 
            "Cache-Control": "no-store, no-cache, must-revalidate" 
          }
        });
      }
    }

    return new Response(renderHTML(accessEmail), { headers: { "Content-Type": "text/html" } });
  }
};

function renderErrorPage() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-slate-50 flex items-center justify-center min-h-screen p-6 font-sans"><div class="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-xl text-center border border-slate-100"><div class="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6"><svg class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg></div><h1 class="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Campaign Paused</h1><p class="text-slate-500 text-xs font-bold leading-relaxed mb-8 uppercase tracking-wide">Iklan ini sedang tidak aktif atau dalam masa pemeliharaan oleh Reatrix.</p><a href="https://reatrixweb.com" class="inline-block bg-slate-900 text-white px-8 py-3 rounded-2xl text-[10px] font-black tracking-[0.2em] hover:bg-slate-800 transition uppercase">Back to Home</a></div></body></html>`;
}

function renderHTML(email) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reatrix Ads Console</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap');
        body { background: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; color: #1e293b; }
        .ad-card { background: white; border-radius: 24px; border: 1px solid #e2e8f0; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .input-pro { width: 100%; padding: 15px; border-radius: 16px; border: 2px solid #f1f5f9; margin-bottom: 12px; font-size: 13px; background: #f8fafc; outline: none; font-weight: 600; }
        .input-pro:focus { border-color: #2563eb; background: white; }
    </style>
</head>
<body class="p-4 md:p-12">
    <div class="max-w-2xl mx-auto">
        <div class="flex justify-between items-end mb-10">
            <div>
                <p class="text-[10px] font-black text-blue-600 uppercase tracking-[0.4em] mb-1">Authenticated as \${email}</p>
                <h1 class="text-3xl font-black tracking-tighter text-slate-900 uppercase">REATRIX <span class="text-blue-600">ADS</span></h1>
            </div>
            <button onclick="addAd()" class="bg-blue-600 text-white px-7 py-3.5 rounded-2xl font-black text-[11px] shadow-2xl shadow-blue-200 active:scale-95 transition uppercase tracking-widest">+ NEW CAMPAIGN</button>
        </div>

        <div id="stats" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10"></div>

        <div class="ad-card overflow-hidden shadow-sm border-slate-200/60">
            <div class="p-6 border-b bg-slate-50/40 flex justify-between items-center">
                <h2 class="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Inventory Monitor</h2>
                <div class="flex items-center gap-2 bg-green-50 px-3 py-1 rounded-full"><span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span><span class="text-[10px] font-black text-green-600 uppercase">Real-Time</span></div>
            </div>
            <div id="list" class="divide-y divide-slate-100"></div>
        </div>
    </div>

    <script>
        let lastHash = "";

        async function load() {
            try {
                const res = await fetch('/api/stats?sync=' + Date.now());
                const ads = await res.json();
                
                const currentHash = JSON.stringify(ads);
                if(currentHash === lastHash) return;
                lastHash = currentHash;

                const clicks = ads.reduce((a, b) => a + (parseInt(b.clicks) || 0), 0);
                const views = ads.reduce((a, b) => a + (parseInt(b.views) || clicks + 5), 0);
                const earn = ads.reduce((a, b) => a + ((parseInt(b.clicks) || 0) * (parseFloat(b.price) || 0)), 0);

                document.getElementById('stats').innerHTML = \`
                    <div class="ad-card p-6 shadow-sm"><p class="text-[9px] font-black text-slate-400 uppercase mb-1">Earnings</p><p class="text-xl font-black text-green-600 uppercase">Rp\${earn.toLocaleString()}</p></div>
                    <div class="ad-card p-6 shadow-sm"><p class="text-[9px] font-black text-slate-400 uppercase mb-1">Views</p><p class="text-xl font-black text-slate-900">\${views}</p></div>
                    <div class="ad-card p-6 shadow-sm"><p class="text-[9px] font-black text-slate-400 uppercase mb-1">Clicks</p><p class="text-xl font-black text-slate-900">\${clicks}</p></div>
                    <div class="ad-card p-6 shadow-sm"><p class="text-[9px] font-black text-slate-400 uppercase mb-1">CTR</p><p class="text-xl font-black text-orange-500">\${((clicks/(views||1))*100).toFixed(2)}%</p></div>\`;

                document.getElementById('list').innerHTML = ads.map(ad => {
                    const active = ad.active !== false;
                    return \`
                    <div class="p-8 hover:bg-slate-50/50 transition-colors">
                        <div class="flex flex-col md:flex-row md:items-center gap-6">
                            <img src="\${ad.banner_url}" class="w-16 h-16 rounded-[1.25rem] object-cover border-2 border-slate-100 shadow-sm \${!active ? 'grayscale opacity-30' : ''}">
                            <div class="flex-grow min-w-0">
                                <div class="flex items-center gap-3 mb-1">
                                    <h3 class="font-black text-sm uppercase text-slate-800 tracking-tight">\${ad.client}</h3>
                                    <span class="text-[9px] font-black px-2.5 py-1 rounded-lg \${active ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'} uppercase">\${active ? 'Active' : 'Paused'}</span>
                                </div>
                                <p class="text-[11px] font-bold text-blue-500 font-mono tracking-tighter">/\${ad.path}</p>
                            </div>
                            <div class="flex items-center gap-6 bg-white px-6 py-4 rounded-2xl border-2 border-slate-100 shadow-inner">
                                <div class="text-center"><p class="text-[8px] font-black text-slate-400 uppercase">Clicks</p><p class="text-sm font-black">\${ad.clicks}</p></div>
                                <div class="text-center px-6 border-x border-slate-100"><p class="text-[8px] font-black text-slate-400 uppercase">CTR</p><p class="text-sm font-black text-orange-500">\${((ad.clicks/(ad.views||1))*100).toFixed(2)}%</p></div>
                                <div class="text-center"><p class="text-[8px] font-black text-slate-400 uppercase">Earn</p><p class="text-sm font-black text-green-600">Rp\${(ad.clicks*ad.price).toLocaleString()}</p></div>
                            </div>
                        </div>
                        <div class="flex gap-3 mt-6">
                            <button onclick="copy('\${window.location.origin}/\${ad.path}')" class="flex-grow py-3.5 bg-slate-900 text-white rounded-[1rem] text-[10px] font-black uppercase tracking-[0.15em] hover:bg-slate-800 transition shadow-lg shadow-slate-200">Copy Link</button>
                            <button onclick="toggleAd('\${ad.path}')" class="p-3.5 rounded-[1rem] border-2 border-slate-100 hover:bg-white transition \${!active ? 'text-red-500 border-red-100 bg-red-50' : 'text-slate-400'}">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                            </button>
                            <button onclick="del('\${ad.path}')" class="p-3.5 text-red-500 hover:bg-red-50 rounded-[1rem] transition">
                                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </div>
                    </div>\`;
                }).join('');
            } catch (e) {}
        }

        function addAd() {
            Swal.fire({
                title: '<div class="text-left"><p class="text-xl font-black text-slate-900 uppercase tracking-tighter">NEW CAMPAIGN</p></div>',
                html: \`
                <div class="text-left mt-6">
                    <label class="text-[10px] font-black text-slate-400 ml-1 uppercase">Client Name</label>
                    <input id="sw-client" class="input-pro" placeholder="e.g. Google Indonesia">
                    <div class="grid grid-cols-2 gap-3">
                        <div><label class="text-[10px] font-black text-slate-400 ml-1 uppercase">Slug (Path)</label><input id="sw-slug" class="input-pro" placeholder="promo-ads"></div>
                        <div><label class="text-[10px] font-black text-slate-400 ml-1 uppercase">Price per Click</label><input id="sw-price" type="number" class="input-pro" placeholder="1500"></div>
                    </div>
                    <label class="text-[10px] font-black text-slate-400 ml-1 uppercase">Destination URL</label>
                    <input id="sw-target" class="input-pro" placeholder="https://...">
                    <label class="text-[10px] font-black text-slate-400 ml-1 uppercase">Banner Image</label>
                    <input id="sw-file" type="file" class="input-pro !py-3 bg-white border-dashed border-2 border-slate-200" accept="image/*">
                </div>\`,
                confirmButtonText: 'DEPLOY CAMPAIGN',
                confirmButtonColor: '#2563eb',
                showCancelButton: true,
                customClass: { popup: 'rounded-[2rem]' },
                preConfirm: () => {
                    const fd = new FormData();
                    const client = document.getElementById('sw-client').value;
                    const slug = document.getElementById('sw-slug').value;
                    const target = document.getElementById('sw-target').value;
                    const price = document.getElementById('sw-price').value;
                    const file = document.getElementById('sw-file').files[0];
                    if(!client || !slug || !target || !file) return Swal.showValidationMessage('Semua data wajib diisi!');
                    fd.append('client', client);
                    fd.append('slug', slug);
                    fd.append('target', target);
                    fd.append('price', price);
                    fd.append('banner', file);
                    return fd;
                }
            }).then(r => r.isConfirmed && fetch('/api/create',{method:'POST',body:r.value}).then(()=>load()));
        }

        async function toggleAd(s) { await fetch('/api/toggle',{method:'POST',body:JSON.stringify({slug:s})}); load(); }
        function copy(t) { navigator.clipboard.writeText(t); Swal.fire({toast:true, position:'top', icon:'success', title:'Link Copied', showConfirmButton:false, timer:800}); }
        function del(s) { Swal.fire({title:'Hapus Campaign?', icon:'warning', showCancelButton:true, confirmButtonColor:'#ef4444'}).then(r => r.isConfirmed && fetch('/api/delete',{method:'POST',body:JSON.stringify({slug:s})}).then(()=>load())); }

        load();
        setInterval(load, 2000); 
    </script>
</body>
</html>`;
}
