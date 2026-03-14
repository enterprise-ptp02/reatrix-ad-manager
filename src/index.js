/**
 * REATRIX AD-INTELLIGENCE v2.7
 * White-Clean Cloudflare Edition
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

    // API Handling
    if (url.pathname === "/api/stats") {
      const adList = await env.AD_MANAGER_KV.list({ prefix: "ad:" });
      const ads = [];
      for (const key of adList.keys) {
        const data = await env.AD_MANAGER_KV.get(key.name, "json");
        if (data) ads.push(data);
      }
      return new Response(JSON.stringify(ads), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === "/api/toggle" && request.method === "POST") {
      const { slug } = await request.json();
      const data = await env.AD_MANAGER_KV.get(`ad:${slug}`, "json");
      data.active = !data.active;
      await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(data));
      return new Response(JSON.stringify({ success: true, active: data.active }));
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

    // Create & Delete Logic (Sama seperti sebelumnya)
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
        active: true,
        price_per_click: parseFloat(formData.get("price")) || 0,
        clicks: 0,
        views: 0,
        created_at: new Date().toISOString()
      };
      await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
      return new Response(JSON.stringify({ success: true }));
    }

    if (path && !["api", "view"].includes(path.split('/')[0])) {
      const adData = await env.AD_MANAGER_KV.get(`ad:${path}`, "json");
      if (adData && adData.active) {
        adData.clicks = (adData.clicks || 0) + 1;
        adData.views = (adData.views || 0) + 1;
        await env.AD_MANAGER_KV.put(`ad:${path}`, JSON.stringify(adData));
        return Response.redirect(adData.target_url, 302);
      } else {
        return new Response("Ad is inactive or not found", { status: 404 });
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
    <title>Reatrix Cloud Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      body { background: #f9fafb; color: #111827; font-family: 'Inter', sans-serif; }
      .card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; }
      .btn-primary { background: #0051ff; color: white; transition: 0.2s; }
      .btn-primary:hover { background: #003ecb; }
      .list-row:hover { background: #f3f4f6; }
    </style>
  </head>
  <body class="p-4 md:p-8">
    <div class="max-w-6xl mx-auto">
      
      <div class="flex items-center justify-between mb-8 pb-6 border-b">
        <div>
          <h1 class="text-xl font-bold tracking-tight">Reatrix <span class="text-blue-600 font-normal">Ad-Intelligence</span></h1>
          <p class="text-xs text-gray-500 mt-1">Account Home / Performance Metrics</p>
        </div>
        <button onclick="showModal()" class="btn-primary text-xs font-semibold px-4 py-2 rounded-md transition-all uppercase tracking-wider">
          + Add Campaign
        </button>
      </div>

      <div id="main-stats" class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"></div>

      <div class="card overflow-hidden">
        <div class="grid grid-cols-12 gap-4 p-4 bg-gray-50 border-b text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          <div class="col-span-4">Advertiser & Link</div>
          <div class="col-span-2 text-center">Status</div>
          <div class="col-span-2 text-center">Performance</div>
          <div class="col-span-2 text-center">Revenue</div>
          <div class="col-span-2 text-right">Actions</div>
        </div>
        <div id="ads-container"></div>
      </div>
    </div>

    <template id="formTemplate">
      <form id="adForm" class="text-left space-y-3 p-2">
        <input name="client" placeholder="Client Name" class="w-full border p-3 rounded-lg text-sm" required>
        <div class="grid grid-cols-2 gap-3">
          <input name="slug" placeholder="Slug URL" class="border p-3 rounded-lg text-sm font-mono" required>
          <input type="number" name="price" placeholder="Price Per Click" class="border p-3 rounded-lg text-sm" required>
        </div>
        <input name="target" placeholder="Target URL" class="w-full border p-3 rounded-lg text-sm" required>
        <input type="date" name="expiry" class="w-full border p-3 rounded-lg text-sm" required>
        <input type="file" name="banner" accept="image/*" class="text-xs block w-full mt-2" required>
      </form>
    </template>

    <script>
      async function updateDashboard() {
        const res = await fetch('/api/stats');
        const ads = await res.json();
        
        // Stats Builder
        const totalClicks = ads.reduce((a, b) => a + (b.clicks || 0), 0);
        const totalRev = ads.reduce((a, b) => a + ((b.clicks || 0) * (b.price_per_click || 0)), 0);
        
        document.getElementById('main-stats').innerHTML = \`
          \${renderStat('Clicks', totalClicks, '↑ 12.5%')}
          \${renderStat('Revenue', 'Rp' + totalRev.toLocaleString(), '↑ 8.2%')}
          \${renderStat('Avg. CTR', '45.20%', 'Stable')}
          \${renderStat('Active Ads', ads.filter(x=>x.active).length, 'Online')}
        \`;

        document.getElementById('ads-container').innerHTML = ads.map(ad => {
          const trackLink = \`link.reatrixweb.com/\${ad.path}\`;
          const statusColor = ad.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500';
          const statusText = ad.active ? 'Active' : 'Paused';
          const seoCode = \`<a href="https://\${trackLink}" target="_blank"><img src="\${ad.banner_url}" width="1280" height="720" alt="\${ad.client}"></a>\`;

          return \`
            <div class="grid grid-cols-12 gap-4 p-4 border-b list-row items-center transition-all">
              <div class="col-span-4 flex items-center gap-3">
                <img src="\${ad.banner_url}" class="w-10 h-10 rounded border object-cover">
                <div class="min-w-0">
                  <p class="text-sm font-semibold truncate">\${ad.client}</p>
                  <p class="text-[10px] text-blue-500 font-mono truncate">\${trackLink}</p>
                </div>
              </div>
              <div class="col-span-2 text-center">
                <button onclick="toggleStatus('\${ad.path}')" class="px-3 py-1 rounded-full text-[9px] font-black uppercase \${statusColor}">\${statusText}</button>
              </div>
              <div class="col-span-2 text-center">
                <p class="text-sm font-bold">\${ad.clicks}</p>
                <p class="text-[9px] text-gray-400">Clicks</p>
              </div>
              <div class="col-span-2 text-center">
                <p class="text-sm font-bold text-green-600">Rp\${((ad.clicks||0)*(ad.price_per_click||0)).toLocaleString()}</p>
              </div>
              <div class="col-span-2 text-right space-x-2">
                <button onclick="showEmbed(\\\`\${seoCode}\\\`)" class="text-[10px] font-bold text-blue-600 hover:underline">Embed</button>
                <button onclick="confirmDelete('\${ad.path}', '\${ad.file_name}')" class="text-red-400 hover:text-red-600 font-bold text-xs">×</button>
              </div>
            </div>
          \`;
        }).join('');
      }

      function renderStat(label, val, trend) {
        return \`<div class="card p-4">
          <p class="text-[10px] font-bold text-gray-400 uppercase mb-1">\${label}</p>
          <div class="flex items-baseline justify-between">
            <h2 class="text-xl font-bold">\${val}</h2>
            <span class="text-[9px] font-bold text-green-500">\${trend}</span>
          </div>
          <div class="h-1 bg-gray-100 mt-3 rounded-full overflow-hidden"><div class="bg-blue-500 h-full w-2/3"></div></div>
        </div>\`;
      }

      function showEmbed(code) {
        Swal.fire({
          title: 'SEO Embed Code',
          html: \`<textarea class="w-full h-32 p-3 text-[10px] font-mono border rounded-lg bg-gray-50">\${code}</textarea>\`,
          confirmButtonText: 'Copy Code',
          background: '#fff',
          confirmButtonColor: '#0051ff',
          preConfirm: () => {
            navigator.clipboard.writeText(code);
          }
        });
      }

      async function toggleStatus(slug) {
        await fetch('/api/toggle', { method: 'POST', body: JSON.stringify({ slug }) });
        updateDashboard();
      }

      // ... logic showModal, saveAd, confirmDelete (Tetap)
      updateDashboard();
    </script>
  </body>
  </html>
  `;
}
