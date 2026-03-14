export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

    // --- CONFIGURATION ---
    const ADMIN_PATH = "admin-reatrix"; // Ganti ini untuk keamanan rahasia kamu

    // 1. ROUTING DASHBOARD (Hanya terbuka jika path sesuai ADMIN_PATH)
    if (path === ADMIN_PATH) {
      return new Response(renderHTML(ADMIN_PATH), { 
        headers: { "Content-Type": "text/html" } 
      });
    }

    // 2. API: LIST DATA (Fix RpNaN Bug)
    if (url.pathname === "/api/stats") {
      const adList = await env.AD_MANAGER_KV.list({ prefix: "ad:" });
      const ads = [];
      for (const key of adList.keys) {
        const data = await env.AD_MANAGER_KV.get(key.name, "json");
        if (data) {
          data.clicks = parseInt(data.clicks) || 0;
          data.views = parseInt(data.views) || 0;
          data.price = parseFloat(data.price) || 0;
          ads.push(data);
        }
      }
      return new Response(JSON.stringify(ads), { 
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } 
      });
    }

    // 3. API: CREATE
    if (url.pathname === "/api/create" && request.method === "POST") {
      const formData = await request.formData();
      const slug = formData.get("slug").toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const file = formData.get("banner");
      const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
      
      await env.AD_BUCKET.put(fileName, file.stream(), { 
        httpMetadata: { contentType: file.type } 
      });
      
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

    // 4. API: TOGGLE & DELETE
    if (url.pathname === "/api/toggle" && request.method === "POST") {
      const { slug } = await request.json();
      const adData = await env.AD_MANAGER_KV.get(`ad:${slug}`, "json");
      if (adData) {
        adData.active = !adData.active;
        await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
        return new Response(JSON.stringify({ success: true }));
      }
    }
    if (url.pathname === "/api/delete" && request.method === "POST") {
      const { slug } = await request.json();
      await env.AD_MANAGER_KV.delete(`ad:${slug}`);
      return new Response(JSON.stringify({ success: true }));
    }

    // 5. VIEW ASSET (Public)
    if (path.startsWith("view/")) {
      const fileName = path.replace("view/", "");
      const object = await env.AD_BUCKET.get(fileName);
      if (!object) return new Response("Not Found", { status: 404 });
      return new Response(object.body, { headers: { "Content-Type": object.httpMetadata.contentType } });
    }

    // 6. REDIRECTOR (Iklan Utama)
    if (path && path !== ADMIN_PATH) {
      const adData = await env.AD_MANAGER_KV.get(`ad:${path}`, "json");
      if (adData && adData.active !== false) {
        adData.clicks = (parseInt(adData.clicks) || 0) + 1;
        adData.views = (parseInt(adData.views) || 0) + 1;
        await env.AD_MANAGER_KV.put(`ad:${path}`, JSON.stringify(adData));
        return new Response(null, { status: 307, headers: { "Location": adData.target_url } });
      }
    }

    // Default: Jika buka domain utama tanpa path rahasia, arahkan ke web utama
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
        body { background: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; }
    </style>
</head>
<body class="p-4 md:p-12">
    <div class="max-w-3xl mx-auto">
        <div class="flex justify-between items-center mb-10">
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
                    <img src="\${ad.banner_url}" class="w-12 h-12 rounded-xl object-cover">
                    <div class="flex-grow">
                        <h3 class="font-black text-xs uppercase text-slate-800">\${ad.client}</h3>
                        <p class="text-[10px] font-bold text-blue-500 tracking-tight">/\${ad.path}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="copy('\${window.location.origin}/\${ad.path}')" class="p-2 bg-slate-100 rounded-lg text-[10px] font-bold">Copy</button>
                        <button onclick="del('\${ad.path}')" class="p-2 text-red-500">Del</button>
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
        function copy(t) { navigator.clipboard.writeText(t); }
        async function del(s) { await fetch('/api/delete',{method:'POST',body:JSON.stringify({slug:s})}); load(); }
        load();
    </script>
</body>
</html>`;
}
