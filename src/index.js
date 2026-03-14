export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

    // API: AMBIL DATA
    if (url.pathname === "/api/stats") {
      const adList = await env.AD_MANAGER_KV.list({ prefix: "ad:" });
      const ads = [];
      for (const key of adList.keys) {
        const data = await env.AD_MANAGER_KV.get(key.name, "json");
        if (data) ads.push(data);
      }
      return new Response(JSON.stringify(ads), { headers: { "Content-Type": "application/json" } });
    }

    // API: TOGGLE STATUS (NONAKTIFKAN)
    if (url.pathname === "/api/toggle" && request.method === "POST") {
      const { slug } = await request.json();
      const adData = await env.AD_MANAGER_KV.get(`ad:${slug}`, "json");
      if (adData) {
        adData.active = !adData.active;
        await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
        return new Response(JSON.stringify({ success: true }));
      }
    }

    // API: CREATE (UI PREMIUM & RESPONSIVE)
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
        history: Array.from({length: 12}, () => Math.floor(Math.random() * 20))
      };
      await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
      return new Response(JSON.stringify({ success: true }));
    }

    // TRACKER & REDIRECT (CEK STATUS ACTIVE)
    if (path && !["api", "view"].includes(path.split('/')[0])) {
      const adData = await env.AD_MANAGER_KV.get(`ad:${path}`, "json");
      if (adData && adData.active !== false) {
        adData.clicks = (adData.clicks || 0) + 1;
        adData.views = (adData.views || 0) + 1;
        if(!adData.history) adData.history = new Array(12).fill(0);
        adData.history[adData.history.length - 1]++;
        await env.AD_MANAGER_KV.put(`ad:${path}`, JSON.stringify(adData));
        return Response.redirect(adData.target_url, 302);
      } else if (adData && adData.active === false) {
        return new Response("Iklan ini telah dinonaktifkan oleh Reatrix Admin.", { status: 403 });
      }
    }

    return new Response(renderHTML(), { headers: { "Content-Type": "text/html" } });
  }
};

function renderHTML() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reatrix Ads Engine Pro</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap');
        body { background: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; }
        .glass { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.5); }
        .swal2-popup.reatrix-modal { border-radius: 24px; padding: 2rem; width: 32rem !important; }
        .input-pro { width: 100%; padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 12px; font-size: 14px; transition: all 0.2s; }
        .input-pro:focus { border-color: #2563eb; outline: none; ring: 2px rgba(37,99,235,0.1); }
    </style>
</head>
<body class="p-4 md:p-10">
    <div class="max-w-5xl mx-auto">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
                <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">REATRIX <span class="text-blue-600">ADSENSE</span></h1>
                <p class="text-xs font-bold text-slate-400 tracking-widest">ADVANCED MEDIA ECOSYSTEM</p>
            </div>
            <button onclick="addAd()" class="w-full md:w-auto bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 transition active:scale-95">+ CREATE CAMPAIGN</button>
        </div>

        <div id="stats" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"></div>

        <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-6 border-b flex justify-between items-center bg-slate-50/50">
                <h2 class="text-sm font-black text-slate-700 uppercase tracking-tighter">Live Performance</h2>
                <div class="flex items-center gap-2 bg-green-100 px-3 py-1 rounded-full">
                    <span class="w-2 h-2 bg-green-500 rounded-full animate-ping"></span>
                    <span class="text-[10px] font-black text-green-700">REAL-TIME STATUS</span>
                </div>
            </div>
            <div id="list" class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:gap-px bg-slate-100"></div>
        </div>
    </div>

    <script>
        async function load() {
            const res = await fetch('/api/stats');
            const ads = await res.json();
            
            const totalClicks = ads.reduce((a, b) => a + (b.clicks || 0), 0);
            const totalViews = ads.reduce((a, b) => a + (b.views || totalClicks + 10), 0);
            const totalRev = ads.reduce((a, b) => a + ((b.clicks || 0) * (b.price || 0)), 0);
            const avgCTR = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : "0.00";

            document.getElementById('stats').innerHTML = \`
                <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Earnings</p>
                    <p class="text-xl md:text-2xl font-black text-green-600">Rp\${totalRev.toLocaleString()}</p>
                </div>
                <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Impressions</p>
                    <p class="text-xl md:text-2xl font-black text-slate-900">\${totalViews}</p>
                </div>
                <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Clicks</p>
                    <p class="text-xl md:text-2xl font-black text-slate-900">\${totalClicks}</p>
                </div>
                <div class="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <p class="text-[10px] font-black text-slate-400 uppercase mb-1">Avg CTR</p>
                    <p class="text-xl md:text-2xl font-black text-blue-600">\${avgCTR}%</p>
                </div>\`;

            document.getElementById('list').innerHTML = ads.map(ad => {
                const isActive = ad.active !== false;
                return \`
                <div class="p-6 bg-white flex flex-col justify-between">
                    <div class="flex gap-4 items-start mb-6">
                        <img src="\${ad.banner_url}" class="w-16 h-16 rounded-2xl object-cover border shadow-sm \${!isActive ? 'grayscale' : ''}">
                        <div class="flex-grow min-w-0">
                            <div class="flex items-center gap-2">
                                <h3 class="font-black text-slate-900 uppercase truncate">\${ad.client}</h3>
                                <span class="px-2 py-0.5 rounded-full text-[8px] font-black \${isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}">
                                    \${isActive ? 'ACTIVE' : 'DISABLED'}
                                </span>
                            </div>
                            <p class="text-[11px] font-mono text-blue-500 italic mt-1 truncate">/\${ad.path}</p>
                        </div>
                        <button onclick="toggleAd('\${ad.path}')" class="p-2 hover:bg-slate-50 rounded-xl border transition \${!isActive ? 'bg-red-50' : ''}" title="Nonaktifkan">
                            <svg class="w-5 h-5 \${isActive ? 'text-slate-400' : 'text-red-500'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                        </button>
                    </div>

                    <div class="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl mb-6">
                        <div class="text-center"><p class="text-[9px] font-bold text-slate-400 uppercase">Clicks</p><p class="text-sm font-black text-slate-800">\${ad.clicks}</p></div>
                        <div class="text-center border-x border-slate-200"><p class="text-[9px] font-bold text-slate-400 uppercase">CTR</p><p class="text-sm font-black text-orange-500">\${((ad.clicks/(ad.views||1))*100).toFixed(2)}%</p></div>
                        <div class="text-center"><p class="text-[9px] font-bold text-slate-400 uppercase">Earn</p><p class="text-sm font-black text-green-600">Rp\${(ad.clicks*ad.price).toLocaleString()}</p></div>
                    </div>

                    <div class="flex gap-2">
                        <button onclick="copy('\${window.location.origin}/\${ad.path}')" class="flex-1 py-2.5 bg-slate-100 text-[10px] font-bold rounded-xl hover:bg-slate-200 uppercase">Link</button>
                        <button onclick="embed('\${ad.path}', '\${ad.banner_url}')" class="flex-1 py-2.5 bg-blue-600 text-white text-[10px] font-bold rounded-xl hover:bg-blue-700 shadow-md uppercase">SEO</button>
                        <button onclick="del('\${ad.path}')" class="p-2.5 text-red-500 hover:bg-red-50 rounded-xl border border-red-100">
                             <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>
                </div>\`;
            }).join('');
        }

        function addAd() {
            Swal.fire({
                title: '<div class="text-left"><p class="text-2xl font-black text-slate-900">NEW CAMPAIGN</p><p class="text-xs text-slate-400 font-bold uppercase tracking-widest">Deploy banner to Reatrix Network</p></div>',
                customClass: { popup: 'reatrix-modal' },
                html: \`
                    <div class="text-left mt-6">
                        <label class="text-[10px] font-black text-slate-500 uppercase ml-1">Advertiser Name</label>
                        <input id="sw-client" class="input-pro mb-4" placeholder="e.g. Samsung Mobile">
                        
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="text-[10px] font-black text-slate-500 uppercase ml-1">Custom Slug</label>
                                <input id="sw-slug" class="input-pro" placeholder="promo-ramadhan">
                            </div>
                            <div>
                                <label class="text-[10px] font-black text-slate-500 uppercase ml-1">CPC (IDR)</label>
                                <input id="sw-price" type="number" class="input-pro" placeholder="1500">
                            </div>
                        </div>

                        <label class="text-[10px] font-black text-slate-500 uppercase ml-1">Destination URL</label>
                        <input id="sw-target" class="input-pro mb-4" placeholder="https://store.reatrix.com/item-1">

                        <label class="text-[10px] font-black text-slate-500 uppercase ml-1">Upload Banner Asset</label>
                        <div class="relative border-2 border-dashed border-slate-200 p-4 rounded-2xl text-center hover:border-blue-400 transition">
                            <input id="sw-file" type="file" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept="image/*">
                            <p class="text-xs font-bold text-slate-400">Click to upload JPG/PNG/WebP</p>
                        </div>
                    </div>\`,
                showCancelButton: true,
                confirmButtonText: 'DEPLOY CAMPAIGN',
                confirmButtonColor: '#2563eb',
                cancelButtonText: 'CANCEL',
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
            Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Status campaign diperbarui', showConfirmButton: false, timer: 1500 });
        }

        function copy(t) { navigator.clipboard.writeText(t); Swal.fire({toast:true, position:'top', icon:'success', title:'Copied!', showConfirmButton:false, timer:800}); }
        
        function embed(p, i) {
            const code = \`<a href="\${window.location.origin}/\${p}"><img src="\${i}" width="100%"></a>\`;
            Swal.fire({ title:'EMBED CODE', html:\`<textarea readonly class="w-full h-24 p-4 text-[11px] font-mono border rounded-2xl bg-slate-50">\${code}</textarea>\` });
        }

        function del(s) {
            Swal.fire({ title:'Hapus Campaign?', text:'Data statistik akan hilang!', icon:'warning', showCancelButton:true, confirmButtonColor:'#ef4444', confirmButtonText:'HAPUS SEKARANG' }).then(r => {
                if(r.isConfirmed) fetch('/api/delete',{method:'POST',body:JSON.stringify({slug:s})}).then(()=>load());
            });
        }

        load();
        setInterval(load, 5000);
    </script>
</body>
</html>`;
}
