/**
 * REATRIX AD-INTELLIGENCE PRO v2.0
 * Ultra-Premium Real-Time Dashboard
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

    // 1. Robots.txt
    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /", { headers: { "Content-Type": "text/plain" } });
    }

    // 2. API: Real-time Stats (Untuk Auto-Refresh)
    if (url.pathname === "/api/stats") {
      const adList = await env.AD_MANAGER_KV.list({ prefix: "ad:" });
      const ads = [];
      for (const key of adList.keys) {
        const data = await env.AD_MANAGER_KV.get(key.name, "json");
        if (data) ads.push(data);
      }
      return new Response(JSON.stringify(ads), { headers: { "Content-Type": "application/json" } });
    }

    // 3. View Asset (R2)
    if (path.startsWith("view/")) {
      const fileName = path.replace("view/", "");
      const object = await env.AD_BUCKET.get(fileName);
      if (!object) return new Response("Not Found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(object.body, { headers });
    }

    // 4. API: Delete Ad
    if (url.pathname === "/api/delete" && request.method === "POST") {
      const { slug, fileName } = await request.json();
      await env.AD_BUCKET.delete(fileName);
      await env.AD_MANAGER_KV.delete(`ad:${slug}`);
      return new Response(JSON.stringify({ success: true }));
    }

    // 5. API: Create Ad
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

    // 6. Redirect & Tracking (The Engine)
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
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
      body { background: #020617; color: #f8fafc; font-family: 'Inter', sans-serif; }
      .glass { background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); }
      .card-stat { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
      .counter-up { animation: pulse 2s infinite; }
      @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.7; } 100% { opacity: 1; } }
      .swal2-popup { border-radius: 1.5rem !important; background: #0f172a !important; color: white !important; }
    </style>
  </head>
  <body class="p-4 md:p-8">
    <div class="max-w-5xl mx-auto">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
        <div>
          <h1 class="text-3xl font-black tracking-tighter text-white">REATRIX <span class="text-blue-500">INTEL</span></h1>
          <div class="flex items-center gap-2 mt-1">
            <span class="w-2 h-2 bg-green-500 rounded-full animate-ping"></span>
            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Live Engine Active</p>
          </div>
        </div>
        <button onclick="showModal()" class="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-2xl transition-all shadow-lg shadow-blue-900/20 text-sm">
          + Create New Campaign
        </button>
      </div>

      <div id="main-stats" class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        </div>

      <div class="space-y-4">
        <h3 class="text-xs font-black text-slate-500 uppercase tracking-[0.3em] px-2">Marketplace Performance</h3>
        <div id="ads-container" class="grid gap-4">
          </div>
      </div>
    </div>

    <template id="formTemplate">
      <form id="adForm" class="text-left space-y-4">
        <div class="space-y-1">
          <label class="text-[10px] font-bold text-slate-500 uppercase ml-2">Client Identity</label>
          <input name="client" placeholder="Nama Client/Brand" class="w-full bg-slate-900 p-4 rounded-2xl border-none outline-none text-white text-sm focus:ring-2 focus:ring-blue-500" required>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-[10px] font-bold text-slate-500 uppercase ml-2">Slug</label>
            <input name="slug" placeholder="ads-promo" class="w-full bg-slate-900 p-4 rounded-2xl border-none outline-none text-blue-400 text-sm font-mono" required>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] font-bold text-slate-500 uppercase ml-2">PPC Price (IDR)</label>
            <input type="number" name="price" placeholder="500" class="w-full bg-slate-900 p-4 rounded-2xl border-none outline-none text-green-400 text-sm font-bold" required>
          </div>
        </div>
        <div class="space-y-1">
          <label class="text-[10px] font-bold text-slate-500 uppercase ml-2">Destination URL</label>
          <input name="target" placeholder="https://..." class="w-full bg-slate-900 p-4 rounded-2xl border-none outline-none text-sm text-white" required>
        </div>
        <div class="space-y-1">
          <label class="text-[10px] font-bold text-slate-500 uppercase ml-2">Expiry Date</label>
          <input type="date" name="expiry" class="w-full bg-slate-900 p-4 rounded-2xl border-none outline-none text-sm text-white" required>
        </div>
        <div class="p-4 bg-slate-900 rounded-2xl border-2 border-dashed border-slate-800">
          <label class="text-[10px] font-bold text-slate-500 uppercase block mb-2">Upload Asset</label>
          <input type="file" name="banner" accept="image/*,video/*" class="text-xs text-slate-400 w-full" required>
        </div>
      </form>
    </template>

    <script>
      let lastData = [];

      async function updateDashboard() {
        try {
          const res = await fetch('/api/stats');
          const ads = await res.json();
          
          // Update Global Stats
          const totalClicks = ads.reduce((a, b) => a + (b.clicks || 0), 0);
          const totalRevenue = ads.reduce((a, b) => a + ((b.clicks || 0) * (b.price_per_click || 0)), 0);
          const totalViews = ads.reduce((a, b) => a + (b.views || 0), 0);
          const avgCTR = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : 0;

          document.getElementById('main-stats').innerHTML = \`
            \${renderStatCard('Total Clicks', totalClicks.toLocaleString(), 'text-blue-400')}
            \${renderStatCard('Est. Revenue', 'Rp ' + totalRevenue.toLocaleString(), 'text-green-400')}
            \${renderStatCard('Total Views', totalViews.toLocaleString(), 'text-slate-300')}
            \${renderStatCard('Avg. CTR', avgCTR + '%', 'text-orange-400')}
          \`;

          // Update Ads List ke Desain Clean List (Sesuai Request)
          const container = document.getElementById('ads-container');
          container.className = "flex flex-col gap-1"; // List vertikal rapat
          container.innerHTML = ads.map(ad => {
            const rev = (ad.clicks || 0) * (ad.price_per_click || 0);
            const CTR = ad.views > 0 ? ((ad.clicks / ad.views) * 100).toFixed(2) : 0;
            const mobilePerc = ad.devices ? Math.round((ad.devices.mobile / ad.clicks) * 100) || 0 : 0;

            return `
              <div class="glass flex items-center justify-between p-4 rounded-2xl group hover:bg-slate-800/40 transition-all border-b border-white/5">
                <div class="flex items-center gap-4">
                  <div class="relative w-12 h-12">
                    <img src="${ad.banner_url}" class="w-full h-full rounded-xl object-cover">
                    <div class="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#020617]"></div>
                  </div>
                  
                  <div>
                    <h4 class="font-bold text-sm text-white">${ad.client}</h4>
                    <p class="text-[10px] font-mono text-slate-500">link.reatrixweb.com/${ad.path}</p>
                  </div>
                </div>

                <div class="flex items-center gap-8 text-right">
                  <div class="hidden md:block">
                    <p class="text-[9px] font-bold text-slate-600 uppercase">Device</p>
                    <p class="text-[11px] font-black text-blue-400">${mobilePerc}% Mob</p>
                  </div>
                  <div>
                    <p class="text-[9px] font-bold text-slate-600 uppercase">Clicks</p>
                    <p class="text-[11px] font-black">${ad.clicks}</p>
                  </div>
                  <div>
                    <p class="text-[9px] font-bold text-slate-600 uppercase">Revenue</p>
                    <p class="text-[11px] font-black text-green-400">Rp${rev.toLocaleString()}</p>
                  </div>
                  
                  <button onclick="confirmDelete('${ad.path}', '${ad.file_name}')" class="ml-4 opacity-0 group-hover:opacity-100 p-2 hover:text-red-500 transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            `;
          }).join('');
        } catch (e) { console.error("Update failed", e); }
      }

      function renderStatCard(label, val, colorClass) {
        return \`
          <div class="glass p-6 rounded-[2rem] card-stat">
            <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">\${label}</p>
            <p class="text-2xl font-black \${colorClass} tracking-tighter">\${val}</p>
          </div>
        \`;
      }

      function showModal() {
        Swal.fire({
          title: '<span class="text-white text-xl font-black uppercase">New Campaign</span>',
          html: document.getElementById('formTemplate').innerHTML,
          showCancelButton: true,
          confirmButtonText: 'Deploy Campaign',
          confirmButtonColor: '#2563eb',
          preConfirm: () => {
            const form = Swal.getPopup().querySelector('#adForm');
            if (!form.checkValidity()) return Swal.showValidationMessage('Wajib diisi semua!');
            return new FormData(form);
          }
        }).then((res) => { if (res.isConfirmed) saveAd(res.value); });
      }

      async function saveAd(fd) {
        Swal.fire({ title: 'Deploying...', didOpen: () => Swal.showLoading() });
        const res = await fetch('/api/create', { method: 'POST', body: fd });
        if (res.ok) {
          Swal.fire({ icon: 'success', title: 'Live!', showConfirmButton: false, timer: 1500 });
          updateDashboard();
        }
      }

      async function confirmDelete(slug, fileName) {
        const { isConfirmed } = await Swal.fire({
          title: 'Hapus Kampanye?',
          text: "Data statistik dan file akan dihapus.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#ef4444'
        });
        if (isConfirmed) {
          await fetch('/api/delete', { method: 'POST', body: JSON.stringify({ slug, fileName }) });
          updateDashboard();
        }
      }

      // Live Polling Engine (Every 3 seconds)
      updateDashboard();
      setInterval(updateDashboard, 3000);
    </script>
  </body>
  </html>
  `;
}
