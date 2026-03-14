export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

    // --- PENGATURAN AKSES ---
    const ADMIN_PATH = "admin-reatrix"; // Akses lewat link.reatrixweb.com/admin-reatrix

    if (path === ADMIN_PATH) {
      return new Response(renderHTML(ADMIN_PATH), { headers: { "Content-Type": "text/html" } });
    }

    // API: AMBIL DATA
    if (url.pathname === "/api/stats") {
      const adList = await env.AD_MANAGER_KV.list({ prefix: "ad:" });
      const ads = [];
      for (const key of adList.keys) {
        const data = await env.AD_MANAGER_KV.get(key.name, "json");
        if (data) {
          data.clicks = parseInt(data.clicks) || 0;
          data.views = parseInt(data.views) || (data.clicks + 5); 
          data.price = parseFloat(data.price) || 0;
          ads.push(data);
        }
      }
      return new Response(JSON.stringify(ads), { headers: { "Content-Type": "application/json" } });
    }

    // API: CREATE CAMPAIGN
    if (url.pathname === "/api/create" && request.method === "POST") {
      const formData = await request.formData();
      const slug = formData.get("slug").toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const file = formData.get("banner");
      const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
      await env.AD_BUCKET.put(fileName, file.stream(), { httpMetadata: { contentType: file.type } });
      
      const adData = {
        client: formData.get("client") || "Unknown",
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

    // API: TOGGLE & DELETE
    if (url.pathname === "/api/toggle" && request.method === "POST") {
      const { slug } = await request.json();
      const data = await env.AD_MANAGER_KV.get(`ad:${slug}`, "json");
      if (data) { data.active = !data.active; await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(data)); }
      return new Response(JSON.stringify({ success: true }));
    }
    if (url.pathname === "/api/delete" && request.method === "POST") {
      const { slug } = await request.json();
      await env.AD_MANAGER_KV.delete(`ad:${slug}`);
      return new Response(JSON.stringify({ success: true }));
    }

    // VIEW IMAGE
    if (path.startsWith("view/")) {
      const fileName = path.replace("view/", "");
      const object = await env.AD_BUCKET.get(fileName);
      if (!object) return new Response("Not Found", { status: 404 });
      return new Response(object.body, { headers: { "Content-Type": object.httpMetadata.contentType } });
    }

    // REDIRECTOR
    if (path && path !== ADMIN_PATH) {
      const adData = await env.AD_MANAGER_KV.get(`ad:${path}`, "json");
      if (adData && adData.active !== false) {
        adData.clicks = (parseInt(adData.clicks) || 0) + 1;
        adData.views = (parseInt(adData.views) || 0) + 1;
        await env.AD_MANAGER_KV.put(`ad:${path}`, JSON.stringify(adData));
        return new Response(null, { status: 307, headers: { "Location": adData.target_url } });
      }
    }

    return Response.redirect("https://reatrixweb.com", 301);
  }
};

function renderHTML(adminPath) {
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
        .glass { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.3); }
    </style>
</head>
<body class="p-4 md:p-12">
    <div class="max-w-4xl mx-auto">
        <div class="flex justify-between items-center mb-12">
            <div>
                <h1 class="text-3xl font-black tracking-tighter uppercase">REATRIX <span class="text-blue-600">ADS</span></h1>
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Management Cloud System</p>
            </div>
            <button onclick="addAd()" class="bg-blue-600 text-white px-8 py-4 rounded-3xl font-black text-xs shadow-xl shadow-blue-100 hover:scale-105 transition-transform uppercase tracking-widest">+ Create</button>
        </div>

        <div id="stats" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10"></div>

        <div class="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div class="p-8 border-b border-slate-50 flex justify-between items-center">
                <h2 class="text-xs font-black text-slate-400 uppercase tracking-widest">Live Campaigns</h2>
                <div class="flex items-center gap-2"><span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span><span class="text-[10px] font-bold text-green-600 uppercase">System Active</span></div>
            </div>
            <div id="list" class="divide-y divide-slate-50"></div>
        </div>
    </div>

    <script>
        async function load() {
            const res = await fetch('/api/stats?t=' + Date.now());
            const ads = await res.json();
            
            const totalClicks = ads.reduce((a, b) => a + b.clicks, 0);
            const totalRevenue = ads.reduce((a, b) => a + (b.clicks * b.price), 0);
            const totalViews = ads.reduce((a, b) => a + b.views, 0) || 1;

            document.getElementById('stats').innerHTML = \`
                <div class="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm text-center">
                    <p class="text-[9px] font-black text-slate-400 uppercase mb-2">Revenue</p>
                    <p class="text-xl font-extrabold text-green-600">Rp\${totalRevenue.toLocaleString()}</p>
                </div>
                <div class="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm text-center">
                    <p class="text-[9px] font-black text-slate-400 uppercase mb-2">Clicks</p>
                    <p class="text-xl font-extrabold text-slate-900">\${totalClicks}</p>
                </div>
                <div class="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm text-center">
                    <p class="text-[9px] font-black text-slate-400 uppercase mb-2">Views</p>
                    <p class="text-xl font-extrabold text-slate-900">\${totalViews}</p>
                </div>
                <div class="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm text-center">
                    <p class="text-[9px] font-black text-slate-400 uppercase mb-2">CTR</p>
                    <p class="text-xl font-extrabold text-blue-600">\${((totalClicks/totalViews)*100).toFixed(1)}%</p>
                </div>\`;

            document.getElementById('list').innerHTML = ads.map(ad => \`
                <div class="p-8 hover:bg-slate-50/50 transition-colors">
                    <div class="flex flex-col md:flex-row md:items-center gap-6">
                        <img src="\${ad.banner_url}" class="w-16 h-16 rounded-2xl object-cover border border-slate-100 shadow-sm \${!ad.active ? 'grayscale' : ''}">
                        <div class="flex-grow">
                            <div class="flex items-center gap-2 mb-1">
                                <h3 class="font-black text-sm uppercase text-slate-800">\${ad.client}</h3>
                                <span class="text-[9px] font-bold px-2 py-0.5 rounded-lg \${ad.active ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'} uppercase">\${ad.active ? 'Active' : 'Paused'}</span>
                            </div>
                            <p class="text-xs font-bold text-blue-500 tracking-tight">/\${ad.path}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <button onclick="copy('\${window.location.origin}/\${ad.path}')" class="px-5 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Copy Link</button>
                            <button onclick="toggleAd('\${ad.path}')" class="p-3 rounded-xl border border-slate-200 text-slate-400 hover:text-blue-600"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" /></svg></button>
                            <button onclick="del('\${ad.path}')" class="p-3 text-red-400 hover:text-red-600"><svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                        </div>
                    </div>
                </div>\`).join('');
        }

        function addAd() {
            Swal.fire({
                title: 'New Campaign',
                html: \`
                    <div class="text-left space-y-3">
                        <input id="sw-client" class="w-full p-4 rounded-xl bg-slate-50 border-none text-sm font-bold" placeholder="Client Name">
                        <input id="sw-slug" class="w-full p-4 rounded-xl bg-slate-50 border-none text-sm font-bold" placeholder="Slug (iklan-baru)">
                        <input id="sw-price" type="number" class="w-full p-4 rounded-xl bg-slate-50 border-none text-sm font-bold" placeholder="Price per Click (Rp)">
                        <input id="sw-target" class="w-full p-4 rounded-xl bg-slate-50 border-none text-sm font-bold" placeholder="Target URL (https://...)">
                        <input id="sw-file" type="file" class="w-full p-4 rounded-xl bg-white border border-dashed text-xs font-bold" accept="image/*">
                    </div>\`,
                confirmButtonText: 'DEPLOY',
                confirmButtonColor: '#2563eb',
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

        async function toggleAd(s) { await fetch('/api/toggle',{method:'POST',body:JSON.stringify({slug:s})}); load(); }
        function copy(t) { navigator.clipboard.writeText(t); Swal.fire({toast:true, position:'top', icon:'success', title:'Link Copied!', showConfirmButton:false, timer:1000}); }
        function del(s) { Swal.fire({title:'Hapus?', icon:'warning', showCancelButton:true}).then(r => r.isConfirmed && fetch('/api/delete',{method:'POST',body:JSON.stringify({slug:s})}).then(()=>load())); }
        
        load();
        setInterval(load, 5000);
    </script>
</body>
</html>`;
}
