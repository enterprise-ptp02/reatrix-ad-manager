/**
 * REATRIX AD-INTELLIGENCE PRO v2.2
 * CEO Edition - Inline Header & Easy Copy
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
    <title>Reatrix Intelligence</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
      body { background: #020617; color: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; }
      .glass { background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.03); }
      .truncate-link { max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      @media (min-width: 768px) { .truncate-link { max-width: 250px; } }
    </style>
  </head>
  <body class="p-4 md:p-10">
    <div class="max-w-4xl mx-auto">
      
      <div class="flex flex-row items-center justify-between mb-10 gap-4">
        <div class="flex flex-row items-center gap-3">
          <h1 class="text-lg md:text-xl font-black text-white whitespace-nowrap">REATRIX <span class="text-blue-500 italic">ADSENSE</span></h1>
          <div class="h-4 w-[1px] bg-slate-700 hidden md:block"></div>
          <p class="text-[9px] text-slate-500 font-bold uppercase tracking-wider hidden sm:block">Professional Advertiser Dashboard</p>
        </div>
        <button onclick="showModal()" class="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold py-2 px-4 rounded-lg transition-all flex-shrink-0">
          + Campaign
        </button>
      </div>

      <div id="main-stats" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10"></div>

      <div class="space-y-2">
        <div id="ads-container" class="flex flex-col gap-2"></div>
      </div>
    </div>

    <template id="formTemplate">
      <form id="adForm" class="text-left space-y-4 p-2 text-white">
        <input name="client" placeholder="Client Name" class="w-full bg-slate-900 p-3 rounded-xl border-none text-sm" required>
        <div class="grid grid-cols-2 gap-2">
          <input name="slug" placeholder="Slug (URL)" class="bg-slate-900 p-3 rounded-xl border-none text-sm" required>
          <input type="number" name="price" placeholder="PPC (IDR)" class="bg-slate-900 p-3 rounded-xl border-none text-sm" required>
        </div>
        <input name="target" placeholder="Target URL" class="w-full bg-slate-900 p-3 rounded-xl border-none text-sm" required>
        <input type="date" name="expiry" class="w-full bg-slate-900 p-3 rounded-xl border-none text-sm" required>
        <input type="file" name="banner" accept="image/*" class="text-xs text-slate-500" required>
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
            \${renderStatCard('Clicks', totalClicks, 'text-blue-400')}
            \${renderStatCard('Revenue', 'Rp' + totalRevenue.toLocaleString(), 'text-green-400')}
            \${renderStatCard('Views', totalViews, 'text-slate-400')}
            \${renderStatCard('CTR', avgCTR + '%', 'text-orange-400')}
          \`;

          const container = document.getElementById('ads-container');
          container.innerHTML = ads.map(ad => {
            const rev = (ad.clicks || 0) * (ad.price_per_click || 0);
            const fullLink = \`link.reatrixweb.com/\${ad.path}\`;

            return \`
              <div class="glass flex items-center justify-between p-3 rounded-xl border-b border-white/5 group">
                <div class="flex items-center gap-3 overflow-hidden">
                  <img src="\${ad.banner_url}" class="w-10 h-10 rounded-lg object-cover flex-shrink-0">
                  <div class="min-w-0">
                    <h4 class="font-bold text-[11px] text-white truncate">\${ad.client}</h4>
                    <div class="flex items-center gap-2">
                      <p class="text-[10px] font-mono text-slate-500 truncate-link">\${fullLink}</p>
                      <button onclick="copyToClipboard('\${fullLink}', this)" class="text-blue-500 hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                      </button>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-4 text-right flex-shrink-0">
                  <div>
                    <p class="text-[7px] font-bold text-slate-600 uppercase">Clicks</p>
                    <p class="text-[10px] font-black">\${ad.clicks}</p>
                  </div>
                  <div>
                    <p class="text-[7px] font-bold text-slate-600 uppercase">Rev</p>
                    <p class="text-[10px] font-black text-green-400">Rp\${rev.toLocaleString()}</p>
                  </div>
                  <button onclick="confirmDelete('\${ad.path}', '\${ad.file_name}')" class="text-slate-800 hover:text-red-500">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            \`;
          }).join('');
        } catch (e) { console.error(e); }
      }

      function copyToClipboard(text, btn) {
        navigator.clipboard.writeText(text);
        const icon = btn.innerHTML;
        btn.innerHTML = '<span class="text-[8px] font-bold">OK!</span>';
        setTimeout(() => { btn.innerHTML = icon; }, 1000);
      }

      function renderStatCard(label, val, color) {
        return \`<div class="glass p-3 rounded-xl">
          <p class="text-[8px] font-bold text-slate-500 uppercase mb-1">\${label}</p>
          <p class="text-sm font-black \${color} truncate">\${val}</p>
        </div>\`;
      }

      function showModal() {
        Swal.fire({
          title: 'NEW AD',
          html: document.getElementById('formTemplate').innerHTML,
          showCancelButton: true,
          confirmButtonText: 'Deploy',
          background: '#0f172a',
          color: '#fff',
          preConfirm: () => {
            const form = Swal.getPopup().querySelector('#adForm');
            if (!form.checkValidity()) return Swal.showValidationMessage('Lengkapi data!');
            return new FormData(form);
          }
        }).then((res) => { if (res.isConfirmed) saveAd(res.value); });
      }

      async function saveAd(fd) {
        await fetch('/api/create', { method: 'POST', body: fd });
        updateDashboard();
      }

      async function confirmDelete(slug, fileName) {
        const { isConfirmed } = await Swal.fire({ title: 'Hapus?', icon: 'warning', showCancelButton: true });
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
