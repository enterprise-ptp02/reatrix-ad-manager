/**
 * REATRIX AD-INTELLIGENCE PRO v2.6
 * CEO Edition: Asset Manager & Auto-Embed SEO System
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

    // 1. Robots.txt SEO Protection
    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /", { headers: { "Content-Type": "text/plain" } });
    }

    // 2. API: Get Stats
    if (url.pathname === "/api/stats") {
      const adList = await env.AD_MANAGER_KV.list({ prefix: "ad:" });
      const ads = [];
      for (const key of adList.keys) {
        const data = await env.AD_MANAGER_KV.get(key.name, "json");
        if (data) ads.push(data);
      }
      return new Response(JSON.stringify(ads), { headers: { "Content-Type": "application/json" } });
    }

    // 3. Asset Viewer (R2 Bucket)
    if (path.startsWith("view/")) {
      const fileName = path.replace("view/", "");
      const object = await env.AD_BUCKET.get(fileName);
      if (!object) return new Response("Not Found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(object.body, { headers });
    }

    // 4. API: Delete Campaign
    if (url.pathname === "/api/delete" && request.method === "POST") {
      const { slug, fileName } = await request.json();
      await env.AD_BUCKET.delete(fileName);
      await env.AD_MANAGER_KV.delete(`ad:${slug}`);
      return new Response(JSON.stringify({ success: true }));
    }

    // 5. API: Create Campaign
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
        created_at: new Date().toISOString()
      };

      await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
      return new Response(JSON.stringify({ success: true }));
    }

    // 6. Redirect & Click Tracking Logic
    if (path && !["api", "view"].includes(path.split('/')[0])) {
      const adData = await env.AD_MANAGER_KV.get(`ad:${path}`, "json");
      if (adData) {
        adData.clicks = (adData.clicks || 0) + 1;
        adData.views = (adData.views || 0) + 1;
        await env.AD_MANAGER_KV.put(`ad:${path}`, JSON.stringify(adData));
        return Response.redirect(adData.target_url, 302);
      }
    }

    // 7. Render Dashboard
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
    <title>Reatrix Pro Asset Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      body { background: #020617; color: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; letter-spacing: -0.02em; }
      .glass { background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
      .code-view { background: #000; color: #10b981; font-family: 'Courier New', monospace; font-size: 11px; border: 1px solid #1e293b; }
      .text-glow { text-shadow: 0 0 15px rgba(59, 130, 246, 0.5); }
    </style>
  </head>
  <body class="p-6 md:p-12">
    <div class="max-w-6xl mx-auto">
      
      <div class="flex items-center justify-between mb-12 border-b border-white/5 pb-8">
        <div class="flex items-baseline gap-4">
          <h1 class="text-3xl font-black text-white text-glow">REATRIX <span class="text-blue-500 italic uppercase">Adsense</span></h1>
          <p class="text-[10px] text-slate-500 font-bold uppercase tracking-[0.4em] hidden md:block">Professional Advertiser System</p>
        </div>
        <button onclick="showModal()" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-black py-3 px-8 rounded-2xl transition-all shadow-xl shadow-blue-900/20">
          + NEW CAMPAIGN
        </button>
      </div>

      <div id="main-stats" class="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12"></div>

      <div class="space-y-6">
        <h3 class="text-xs font-black text-slate-500 uppercase tracking-widest px-2">Active Performance & Assets</h3>
        <div id="ads-container" class="flex flex-col gap-4"></div>
      </div>
    </div>

    <template id="formTemplate">
      <form id="adForm" class="text-left space-y-4 p-4 text-white">
        <input name="client" placeholder="Client Name" class="w-full bg-slate-900 p-4 rounded-2xl border-none text-sm" required>
        <div class="grid grid-cols-2 gap-4">
          <input name="slug" placeholder="Slug (Contoh: promo-shopee)" class="bg-slate-900 p-4 rounded-2xl border-none text-sm font-mono text-blue-400" required>
          <input type="number" name="price" placeholder="PPC (Contoh: 500)" class="bg-slate-900 p-4 rounded-2xl border-none text-sm text-green-400 font-bold" required>
        </div>
        <input name="target" placeholder="Target Link (https://...)" class="w-full bg-slate-900 p-4 rounded-2xl border-none text-sm" required>
        <input type="date" name="expiry" class="w-full bg-slate-900 p-4 rounded-2xl border-none text-sm" required>
        <div class="p-6 bg-slate-900 border-2 border-dashed border-slate-800 rounded-2xl text-center">
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
            \${renderStatCard('Impressions', totalViews.toLocaleString(), 'text-slate-400')}
            \${renderStatCard('Global CTR', avgCTR + '%', 'text-orange-400')}
          \`;

          const container = document.getElementById('ads-container');
          container.innerHTML = ads.map(ad => {
            const trackLink = window.location.origin.replace('raspy-base-f3a3.reatrixweb.workers.dev', 'link.reatrixweb.com') + '/' + ad.path;
            const imgLink = ad.banner_url;
            const rev = (ad.clicks || 0) * (ad.price_per_click || 0);
            
            // Auto-Embed SEO Tag
            const seoCode = \`<a href="\${trackLink}" target="_blank" title="\${ad.client}">\\n  <img src="\${imgLink}" alt="\${ad.client}" width="1280" height="720" style="width:100%; height:auto; border-radius:12px;">\\n</a>\`;

            return \`
              <div class="glass p-6 md:p-8 rounded-[2.5rem] flex flex-col lg:flex-row gap-8 items-center group">
                <div class="relative flex-shrink-0">
                   <img src="\${imgLink}" class="w-48 h-28 rounded-2xl object-cover shadow-2xl border border-white/10 group-hover:scale-105 transition-transform duration-500">
                   <div class="absolute -top-2 -right-2 bg-blue-600 text-[8px] font-black px-2 py-1 rounded-full uppercase">Active</div>
                </div>

                <div class="flex-1 w-full min-w-0">
                  <div class="flex items-center justify-between mb-4">
                    <h4 class="text-xl font-black text-white truncate">\${ad.client}</h4>
                    <span class="text-[10px] font-bold text-slate-500 bg-white/5 px-3 py-1 rounded-full uppercase tracking-tighter">PPC: Rp\${ad.price_per_click}</span>
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="space-y-3">
                       <div class="flex items-center justify-between gap-3 bg-black/40 p-3 rounded-xl border border-white/5">
                         <p class="text-[10px] font-mono text-blue-400 truncate">\${trackLink}</p>
                         <button onclick="copy('\${trackLink}')" class="text-[10px] font-black text-white hover:text-blue-500 uppercase">Track Link</button>
                       </div>
                       <div class="flex items-center justify-between gap-3 bg-black/40 p-3 rounded-xl border border-white/5">
                         <p class="text-[10px] font-mono text-green-400 truncate">\${imgLink}</p>
                         <button onclick="copy('\${imgLink}')" class="text-[10px] font-black text-white hover:text-green-500 uppercase">Image Link</button>
                       </div>
                    </div>

                    <div class="relative">
                      <div class="code-view p-3 rounded-xl h-20 overflow-hidden text-[9px] relative group-hover:border-blue-500/50 transition-colors">
                        <pre>\${seoCode.replace(/</g, '&lt;')}</pre>
                        <button onclick="copy(\\\`\${seoCode}\\\`)" class="absolute right-2 top-2 bg-blue-600 text-[8px] px-3 py-1.5 rounded-lg font-black hover:bg-white hover:text-blue-600 transition-all shadow-lg">COPY SEO TAG</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="flex flex-row lg:flex-col items-center lg:items-end gap-6 w-full lg:w-auto border-t lg:border-none border-white/5 pt-6 lg:pt-0">
                  <div class="text-right flex-1 lg:flex-none">
                    <p class="text-[9px] font-black text-slate-600 uppercase mb-1">Total Revenue</p>
                    <p class="text-xl font-black text-green-400 tracking-tighter">Rp\${rev.toLocaleString()}</p>
                  </div>
                  <div class="text-right flex-1 lg:flex-none">
                    <p class="text-[9px] font-black text-slate-600 uppercase mb-1">Clicks</p>
                    <p class="text-xl font-black text-white">\${ad.clicks}</p>
                  </div>
                  <button onclick="confirmDelete('\${ad.path}', '\${ad.file_name}')" class="p-4 rounded-2xl bg-red-500/5 text-red-900 hover:bg-red-500 hover:text-white transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            \`;
          }).join('');
        } catch (e) { console.error(e); }
      }

      function copy(text) {
        navigator.clipboard.writeText(text);
        Swal.fire({ 
          toast: true, position: 'top-end', icon: 'success', 
          title: 'Copied to Clipboard!', showConfirmButton: false, timer: 1500, 
          background: '#1e293b', color: '#fff' 
        });
      }

      function renderStatCard(label, val, color) {
        return \`<div class="glass p-6 rounded-[2rem]">
          <p class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">\${label}</p>
          <p class="text-2xl font-black \${color} tracking-tighter">\${val}</p>
        </div>\`;
      }

      function showModal() {
        Swal.fire({
          title: '<span class="text-white font-black text-xl uppercase tracking-tighter">New Ad Campaign</span>',
          html: document.getElementById('formTemplate').innerHTML,
          showCancelButton: true,
          confirmButtonText: 'DEPLOY CAMPAIGN',
          background: '#0f172a',
          confirmButtonColor: '#2563eb',
          preConfirm: () => {
            const form = Swal.getPopup().querySelector('#adForm');
            if (!form.checkValidity()) return Swal.showValidationMessage('Lengkapi semua data!');
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
          title: 'TERMINATE AD?', text: "Data kampanye akan dihapus permanen.", 
          icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', 
          background: '#0f172a', color: '#fff' 
        });
        if (isConfirmed) {
          await fetch('/api/delete', { method: 'POST', body: JSON.stringify({ slug, fileName }) });
          updateDashboard();
        }
      }

      updateDashboard();
      setInterval(updateDashboard, 10000);
    </script>
  </body>
  </html>
  `;
}
