export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

    // Ganti 'admin-reatrix' dengan kata rahasia pilihanmu
    const ADMIN_PATH = "admin-reatrix"; 

    if (path === ADMIN_PATH) {
      return new Response(renderHTML(ADMIN_PATH), { headers: { "Content-Type": "text/html" } });
    }

    // API: GET DATA
    if (url.pathname === "/api/stats") {
      const adList = await env.AD_MANAGER_KV.list({ prefix: "ad:" });
      const ads = [];
      for (const key of adList.keys) {
        const data = await env.AD_MANAGER_KV.get(key.name, "json");
        if (data) {
          data.clicks = parseInt(data.clicks) || 0;
          data.views = parseInt(data.views) || (data.clicks + 2);
          data.price = parseFloat(data.price) || 0;
          ads.push(data);
        }
      }
      return new Response(JSON.stringify(ads), { headers: { "Content-Type": "application/json" } });
    }

    // API: CREATE
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

    // API: ACTIONS
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

    // ASSET VIEW
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
    <title>Reatrix Ads Admin</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap');
        body { background: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; }
    </style>
</head>
<body class="p-6 md:p-12">
    <div class="max-w-3xl mx-auto">
        <div class="flex justify-between items-center mb-8">
            <h1 class="text-2xl font-black text-slate-900 tracking-tighter uppercase">REATRIX <span class="text-blue-600">ADS</span></h1>
            <button onclick="addAd()" class="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-xs shadow-lg shadow-blue-200 uppercase tracking-widest">+ NEW</button>
        </div>

        <div id="stats" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"></div>

        <div class="bg-white rounded-[2rem] overflow-hidden shadow-sm border border-slate-100">
            <div id="list" class="divide-y divide-slate-50"></div>
        </div>
    </div>

    <script>
        async function load() {
            const res = await fetch('/api/stats?t=' + Date.now());
            const ads = await res.json();
            
            const totalClicks = ads.reduce((a, b) => a + b.clicks, 0);
            const totalRevenue = ads.reduce((a, b) => a + (b.clicks * b.price), 0);

            document.getElementById('stats').innerHTML = \`
                <div class="bg-white p-6 rounded-3xl border border-slate-100"><p class="text-[9px] font-black text-slate-400 uppercase mb-1">Revenue</p><p class="text-lg font-black text-green-600">Rp\${totalRevenue.toLocaleString()}</p></div>
                <div class="bg-white p-6 rounded-3xl border border-slate-100"><p class="text-[9px] font-black text-slate-400 uppercase mb-1">Clicks</p><p class="text-lg font-black text-slate-800">\${totalClicks}</p></div>\`;

            document.getElementById('list').innerHTML = ads.map(ad => \`
                <div class="p-6 flex items-center gap-4">
                    <img src="\${ad.banner_url}" class="w-12 h-12 rounded-xl object-cover border border-slate-50">
                    <div class="flex-grow">
                        <div class="flex items-center gap-2">
                            <h3 class="font-black text-[11px] uppercase text-slate-800">\${ad.client}</h3>
                            <span class="text-[8px] font-bold \${ad.active ? 'text-green-500' : 'text-red-500'} uppercase">\${ad.active ? '● Active' : '● Paused'}</span>
                        </div>
                        <p class="text-[10px] font-bold text-blue-500 tracking-tight">/\${ad.path}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="copy('\${window.location.origin}/\${ad.path}')" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-[9px] font-black uppercase transition-colors">Copy</button>
                        <button onclick="toggleAd('\${ad.path}')" class="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path d="M10 9v6m4-6v6" /></svg>
                        </button>
                        <button onclick="del('\${ad.path}')" class="p-2 text-red-400 hover:text-red-600 transition-colors">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>
                </div>\`).join('');
        }

        function addAd() {
            Swal.fire({
                title: 'New Campaign',
                html: '<input id="sw-client" class="swal2-input" placeholder="Client"><input id="sw-slug" class="swal2-input" placeholder="Slug"><input id="sw-price" type="number" class="swal2-input" placeholder="Price"><input id="sw-target" class="swal2-input" placeholder="Target URL"><input id="sw-file" type="file" class="swal2-input" accept="image/*">',
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

        async function toggleAd(s) { await fetch('/api/toggle', {method:'POST', body:JSON.stringify({slug:s})}); load(); }
        function copy(t) { navigator.clipboard.writeText(t); Swal.fire({toast:true, position:'top', icon:'success', title:'Copied', showConfirmButton:false, timer:800}); }
        async function del(s) { if(confirm('Hapus?')) { await fetch('/api/delete',{method:'POST',body:JSON.stringify({slug:s})}); load(); } }
        
        load();
    </script>
</body>
</html>`;
}
