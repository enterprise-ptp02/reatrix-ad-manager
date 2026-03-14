/**
 * REATRIX AD-INTELLIGENCE PRO v2.5
 * Professional High-Density Edition
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /", { headers: { "Content-Type": "text/plain" } });
    }

    if (url.pathname === "/api/stats") {
      const adList = await env.AD_MANAGER_KV.list({ prefix: "ad:" });
      const ads = [];
      for (const key of adList.keys) {
        const data = await env.AD_MANAGER_KV.get(key.name, "json");
        if (data) ads.push(data);
      }
      return new Response(JSON.stringify(ads), { headers: { "Content-Type": "application/json" } });
    }

    if (path.startsWith("view/")) {
      const fileName = path.replace("view/", "");
      const object = await env.AD_BUCKET.get(fileName);
      if (!object) return new Response("Not Found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(object.body, { headers });
    }

    if (url.pathname === "/api/delete" && request.method === "POST") {
      const { slug, fileName } = await request.json();
      await env.AD_BUCKET.delete(fileName);
      await env.AD_MANAGER_KV.delete(`ad:${slug}`);
      return new Response(JSON.stringify({ success: true }));
    }

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
    <title>Reatrix Pro Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      body { background: #020617; color: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; letter-spacing: -0.02em; }
      .glass { background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5); }
      .text-glow { text-shadow: 0 0 10px rgba(59, 130, 246, 0.5); }
    </style>
  </head>
  <body class="p-6 md:p-12">
    <div class="max-w-5xl mx-auto">
      
      <div class="flex flex-row items-center justify-between mb-12 border-b border-white/5 pb-8">
        <div class="flex flex-row items-baseline gap-4">
          <h1 class="text-3xl font-extrabold text-white tracking-tighter text-glow">REATRIX <span class="text-blue-500 italic">ADSENSE</span></h1>
          <p class="text-xs text-slate-500 font-bold uppercase tracking-[0.3em] hidden lg:block">Intelligence Performance System</p>
        </div>
        <button onclick="showModal()" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-black py-3 px-8 rounded-2xl transition-all shadow-xl shadow-blue-900/40 uppercase">
          + New Campaign
        </button>
      </div>

      <div id="main-stats" class="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12"></div>

      <div class="space-y-4">
        <div class="flex justify-between items-center px-4 mb-2">
           <h3 class="text-xs font-black text-slate-500 uppercase tracking-widest">Client & Asset</h3>
           <h3 class="text-xs font-black text-slate-500 uppercase tracking-widest">Performance Matrix</h3>
        </div>
        <div id="ads-container" class="flex flex-col gap-3"></div>
      </div>
    </div>

    <template id="formTemplate">
      <form id="adForm" class="text-left space-y-4 p-4">
        <input name="client" placeholder="Client Name" class="w-full bg-slate-900 p-4 rounded-2xl border-none text-white text-sm" required>
        <div class="grid grid-cols-2 gap-4">
          <input name="slug" placeholder="Slug (URL)" class="bg-slate-900 p-4 rounded-2xl border-none text-blue-400 text-sm font-mono" required>
          <input type="number" name="price" placeholder="PPC (IDR)" class="bg-slate-900 p-4 rounded-2xl border-none text-green-400 text-sm font-bold" required>
        </div>
        <input name="target" placeholder="Destination URL (https://...)" class="w-full bg-slate-900 p-4 rounded-2xl border-none text-sm text-white" required>
        <input type="date" name="expiry" class="w-full bg-slate-900 p-4 rounded-2xl border-none text-sm text-white" required>
        <div class="p-4 bg-slate-900 rounded-2xl border-2 border-dashed border-slate-800 text-center">
          <input type="file" name="banner" accept="image/*" class="text-xs text-slate-500" required>
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
            \${renderStatCard('Total Clicks', totalClicks.toLocaleString(), 'text-blue-400')}
            \${renderStatCard('Est. Revenue', 'Rp' + totalRevenue.toLocaleString(), 'text-green-400')}
            \${renderStatCard('Total Impressions', totalViews.toLocaleString(), 'text-slate-400')}
            \${renderStatCard('Avg. CTR', avgCTR + '%', 'text-orange-400')}
          \`;

          const container = document.getElementById('ads-container');
          container.innerHTML = ads.map(ad => {
            const rev = (ad.clicks || 0) * (ad.price_per_click || 0);
            const ctr = ad.views > 0 ? ((ad.clicks / ad.views) * 100).toFixed(1) : 0;
            const link = \`link.reatrixweb.com/\${ad.path}\`;

            return \`
              <div class="glass flex flex-col md:flex-row items-center justify-between p-6 rounded-[2rem] group hover:bg-slate-800/40 transition-all gap-4">
                <div class="flex items-center gap-6 flex-1 w-full overflow-hidden">
                  <img src="\${ad.banner_url}" class="w-16 h-16 rounded-2xl object-cover shadow-2xl flex-shrink-0 border border-white/10">
                  <div class="min-w-0 flex-1">
                    <h4 class="font-extrabold text-lg text-white truncate mb-1">\${ad.client}</h4>
                    <div class="flex items-center gap-3">
                      <p class="text-xs font-mono text-slate-500 truncate select-all">\${link}</p>
                      <button onclick="copyLink('\${link}', this)" class="bg-blue-500/10 text-blue-500 p-2 rounded-lg hover:bg-blue-500 hover:text-white transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                      </button>
                    </div>
                  </div>
                </div>

                <div class="flex items-center justify-between md:justify-end gap-8 w-full md:w-auto border-t md:border-none border-white/5 pt-4 md:pt-0 flex-shrink-0">
                  <div class="text-center">
                    <p class="text-[9px] font-black text-slate-600 uppercase mb-1">Clicks</p>
                    <p class="text-sm font-bold text-white">\${ad.clicks}</p>
                  </div>
                   <div class="text-center">
                    <p class="text-[9px] font-black text-slate-600 uppercase mb-1">CTR</p>
                    <p class="text-sm font-bold text-orange-400">\${ctr}%</p>
                  </div>
                  <div class="text-right">
                    <p class="text-[9px] font-black text-slate-600 uppercase mb-1">Revenue</p>
                    <p class="text-sm font-bold text-green-400">Rp\${rev.toLocaleString()}</p>
                  </div>
                  <button onclick="confirmDelete('\${ad.path}', '\${ad.file_name}')" class="bg-red-500/10 text-red-500 p-3 rounded-xl hover:bg-red-500 hover:text-white transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            \`;
          }).join('');
        } catch (e) { console.error(e); }
      }

      function copyLink(text, btn) {
        navigator.clipboard.writeText(text);
        const icon = btn.innerHTML;
        btn.innerHTML = '<span class="text-[10px] font-bold">COPIED</span>';
        setTimeout(() => { btn.innerHTML = icon; }, 1000);
      }

      function renderStatCard(label, val, color) {
        return \`<div class="glass p-6 rounded-[2rem]">
          <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">\${label}</p>
          <p class="text-2xl font-black \${color} tracking-tight">\${val}</p>
        </div>\`;
      }

      function showModal() {
        Swal.fire({
          title: '<span class="text-white font-black">NEW CAMPAIGN</span>',
          html: document.getElementById('formTemplate').innerHTML,
          showCancelButton: true,
          confirmButtonText: 'DEPLOY ASSET',
          background: '#0f172a',
          confirmButtonColor: '#2563eb',
          preConfirm: () => {
            const form = Swal.getPopup().querySelector('#adForm');
            if (!form.checkValidity()) return Swal.showValidationMessage('Fill all data!');
            return new FormData(form);
          }
        }).then((res) => { if (res.isConfirmed) saveAd(res.value); });
      }

      async function saveAd(fd) {
        await fetch('/api/create', { method: 'POST', body: fd });
        updateDashboard();
      }

      async function confirmDelete(slug, fileName) {
        const { isConfirmed } = await Swal.fire({ 
           title: 'TERMINATE AD?', 
           text: "This action cannot be undone.",
           icon: 'warning', 
           showCancelButton: true,
           confirmButtonColor: '#ef4444',
           background: '#0f172a',
           color: '#fff'
        });
        if (isConfirmed) {
          await fetch('/api/delete', { method: 'POST', body: JSON.stringify({ slug, fileName }) });
          updateDashboard();
        }
      }

      updateDashboard();
      setInterval(updateDashboard, 5000);
    </script>
  </body>
  </html>
  `;
}
