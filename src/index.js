/**
 * REATRIX AD-INTELLIGENCE PRO v2.1
 * Clean List Model - CEO Edition
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

    // 1. Keamanan & SEO Dasar
    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /", { headers: { "Content-Type": "text/plain" } });
    }

    // 2. API: Real-time Stats untuk Auto-Refresh
    if (url.pathname === "/api/stats") {
      const adList = await env.AD_MANAGER_KV.list({ prefix: "ad:" });
      const ads = [];
      for (const key of adList.keys) {
        const data = await env.AD_MANAGER_KV.get(key.name, "json");
        if (data) ads.push(data);
      }
      return new Response(JSON.stringify(ads), { headers: { "Content-Type": "application/json" } });
    }

    // 3. View Asset (Mengambil Gambar dari R2)
    if (path.startsWith("view/")) {
      const fileName = path.replace("view/", "");
      const object = await env.AD_BUCKET.get(fileName);
      if (!object) return new Response("Not Found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(object.body, { headers });
    }

    // 4. API: Hapus Iklan
    if (url.pathname === "/api/delete" && request.method === "POST") {
      const { slug, fileName } = await request.json();
      await env.AD_BUCKET.delete(fileName);
      await env.AD_MANAGER_KV.delete(`ad:${slug}`);
      return new Response(JSON.stringify({ success: true }));
    }

    // 5. API: Buat Iklan Baru
    if (url.pathname === "/api/create" && request.method === "POST") {
      const formData = await request.formData();
      const slug = formData.get("slug").toLowerCase().replace(/\s+/g, '-');
      const file = formData.get("banner");
      const fileName = `${slug}-${Date.now()}.${file.name.split('.').pop()}`;
      
      await env.AD_BUCKET.put(fileName, file.stream(), { httpMetadata: { contentType: file.type } });

      const adData = {
        client: formData.get("client"),
        path: slug,
        target_url: formData.get("target"),
        banner_url: `${url.origin}/view/${fileName}`,
        file_name: fileName,
        expiry_date: formData.get("expiry"),
        price_per_click: parseFloat(formData.get("price")) || 0,
        clicks: 0,
        views: 0,
        devices: { mobile: 0, desktop: 0 },
        created_at: new Date().toISOString()
      };

      await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
      return new Response(JSON.stringify({ success: true }));
    }

    // 6. Engine: Redirect & Tracking
    if (path && !["api", "view"].includes(path.split('/')[0])) {
      const adData = await env.AD_MANAGER_KV.get(`ad:${path}`, "json");
      if (adData) {
        const ua = request.headers.get("user-agent") || "";
        const isMobile = /mobile/i.test(ua);
        
        adData.clicks = (adData.clicks || 0) + 1;
        adData.views = (adData.views || 0) + 1;
        if (!adData.devices) adData.devices = { mobile: 0, desktop: 0 };
        isMobile ? adData.devices.mobile++ : adData.devices.desktop++;

        await env.AD_MANAGER_KV.put(`ad:${path}`, JSON.stringify(adData));
        return Response.redirect(adData.target_url, 302);
      }
    }

    return new Response(renderHTML(), { headers: { "Content-Type": "text/html" } });
  }
};

function renderHTML() {
  return `
  <!DOCTYPE html>
  <html lang="id">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reatrix Intelligence</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
      body { background: #020617; color: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; }
      .glass { background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.03); }
      .swal2-popup { border-radius: 2rem !important; background: #0f172a !important; color: white !important; }
      ::-webkit-scrollbar { width: 5px; }
      ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
    </style>
  </head>
  <body class="p-4 md:p-10">
    <div class="max-w-4xl mx-auto">
      
      <div class="flex justify-between items-center mb-12">
        <div>
          <h1 class="text-2xl font-black text-white tracking-tight">REATRIX <span class="text-blue-500 italic">ADSENSE</span></h1>
          <p class="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">Professional Advertiser Dashboard</p>
        </div>
        <button onclick="showModal()" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-blue-900/20">
          Create Campaign
        </button>
      </div>

      <div id="main-stats" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        </div>

      <div class="space-y-3">
        <div class="flex justify-between items-center px-4 mb-4">
           <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest text-left">Advertiser</h3>
           <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Stats (Klik/Rev/Device)</h3>
        </div>
        <div id="ads-container" class="flex flex-col gap-2">
          </div>
      </div>
    </div>

    <template id="formTemplate">
      <form id="adForm" class="text-left space-y-4 p-2">
        <div class="space-y-1">
          <label class="text-[10px] font-bold text-slate-500 uppercase ml-1">Client Name</label>
          <input name="client" placeholder="e.g. ReatrixShop" class="w-full bg-slate-900 p-4 rounded-xl border-none text-white text-sm focus:ring-2 focus:ring-blue-500" required>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-[10px] font-bold text-slate-500 uppercase ml-1">Slug (URL)</label>
            <input name="slug" placeholder="ads-shop" class="w-full bg-slate-900 p-4 rounded-xl border-none text-blue-400 text-sm font-mono" required>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] font-bold text-slate-500 uppercase ml-1">PPC (IDR)</label>
            <input type="number" name="price" placeholder="500" class="w-full bg-slate-900 p-4 rounded-xl border-none text-green-400 text-sm font-bold" required>
          </div>
        </div>
        <div class="space-y-1">
          <label class="text-[10px] font-bold text-slate-500 uppercase ml-1">Target Link</label>
          <input name="target" placeholder="https://..." class="w-full bg-slate-900 p-4 rounded-xl border-none text-sm text-white" required>
        </div>
        <div class="space-y-1">
          <label class="text-[10px] font-bold text-slate-500 uppercase ml-1">Expiry Date</label>
          <input type="date" name="expiry" class="w-full bg-slate-900 p-4 rounded-xl border-none text-sm text-white" required>
        </div>
        <div class="p-4 bg-slate-900 rounded-xl border-2 border-dashed border-slate-800">
          <label class="text-[10px] font-bold text-slate-500 uppercase block mb-2">Banner Asset</label>
          <input type="file" name="banner" accept="image/*" class="text-xs text-slate-500 w-full" required>
        </div>
      </form>
    </template>

    <script>
      async function updateDashboard() {
        try {
          const res = await fetch('/api/stats');
          const ads = await res.json();
          
          const totalClicks = ads.reduce((a, b) => a + (b.clicks || 0), 0);
          const totalRevenue = ads.reduce((a, b) => a + ((b.clicks || 0) * (b.price_per_click || 0)), 0);
          const totalViews = ads.reduce((a, b) => a + (b.views || 0), 0);
          const avgCTR = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : 0;

          document.getElementById('main-stats').innerHTML = \`
            \${renderStatCard('Total Klik', totalClicks.toLocaleString(), 'text-blue-400')}
            \${renderStatCard('Est. Revenue', 'IDR ' + totalRevenue.toLocaleString(), 'text-green-400')}
            \${renderStatCard('Total Tayang', totalViews.toLocaleString(), 'text-slate-400')}
            \${renderStatCard('Avg CTR', avgCTR + '%', 'text-orange-400')}
          \`;

          const container = document.getElementById('ads-container');
          container.innerHTML = ads.map(ad => {
            const rev = (ad.clicks || 0) * (ad.price_per_click || 0);
            const mobilePerc = ad.devices ? Math.round((ad.devices.mobile / ad.clicks) * 100) || 0 : 0;

            return \`
              <div class="glass flex items-center justify-between p-4 rounded-2xl group border-b border-white/5 hover:bg-slate-800/30 transition-all">
                <div class="flex items-center gap-4">
                  <img src="\${ad.banner_url}" class="w-11 h-11 rounded-lg object-cover shadow-lg">
                  <div class="max-w-[150px] md:max-w-none">
                    <h4 class="font-bold text-xs text-white truncate">\${ad.client}</h4>
                    <p class="text-[10px] font-mono text-slate-500 truncate">link.reatrixweb.com/\${ad.path}</p>
                  </div>
                </div>

                <div class="flex items-center gap-6 md:gap-10 text-right">
                  <div class="hidden sm:block">
                    <p class="text-[8px] font-bold text-slate-600 uppercase">Device</p>
                    <p class="text-[10px] font-black text-blue-500">\${mobilePerc}% Mob</p>
                  </div>
                  <div>
                    <p class="text-[8px] font-bold text-slate-600 uppercase">Clicks</p>
                    <p class="text-[10px] font-black text-white">\${ad.clicks}</p>
                  </div>
                  <div>
                    <p class="text-[8px] font-bold text-slate-600 uppercase text-green-500/50">Revenue</p>
                    <p class="text-[10px] font-black text-green-400">Rp\${rev.toLocaleString()}</p>
                  </div>
                  <button onclick="confirmDelete('\${ad.path}', '\${ad.file_name}')" class="text-slate-700 hover:text-red-500 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            \`;
          }).join('');
        } catch (e) { console.error(e); }
      }

      function renderStatCard(label, val, color) {
        return \`<div class="glass p-5 rounded-2xl">
          <p class="text-[9px] font-bold text-slate-500 uppercase mb-1">\${label}</p>
          <p class="text-xl font-black \${color} tracking-tight">\${val}</p>
        </div>\`;
      }

      function showModal() {
        Swal.fire({
          title: '<span class="text-white text-lg font-black uppercase">New Campaign</span>',
          html: document.getElementById('formTemplate').innerHTML,
          showCancelButton: true,
          confirmButtonText: 'Deploy',
          confirmButtonColor: '#2563eb',
          preConfirm: () => {
            const form = Swal.getPopup().querySelector('#adForm');
            if (!form.checkValidity()) return Swal.showValidationMessage('Lengkapi data!');
            return new FormData(form);
          }
        }).then((res) => { if (res.isConfirmed) saveAd(res.value); });
      }

      async function saveAd(fd) {
        Swal.fire({ title: 'Deploying...', didOpen: () => Swal.showLoading() });
        const res = await fetch('/api/create', { method: 'POST', body: fd });
        if (res.ok) {
          Swal.fire({ icon: 'success', title: 'Live!', showConfirmButton: false, timer: 1000 });
          updateDashboard();
        }
      }

      async function confirmDelete(slug, fileName) {
        const { isConfirmed } = await Swal.fire({
          title: 'Hapus Iklan?',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#ef4444'
        });
        if (isConfirmed) {
          await fetch('/api/delete', { method: 'POST', body: JSON.stringify({ slug, fileName }) });
          updateDashboard();
        }
      }

      updateDashboard();
      setInterval(updateDashboard, 3000); // Live update setiap 3 detik
    </script>
  </body>
  </html>
  `;
}
