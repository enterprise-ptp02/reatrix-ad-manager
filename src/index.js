/**
 * REATRIX AD-INTELLIGENCE PRO v2.9
 * Analytics Edition: Dynamic Sparklines & High-Density UI
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

    // API: GET DATA
    if (url.pathname === "/api/stats") {
      const adList = await env.AD_MANAGER_KV.list({ prefix: "ad:" });
      const ads = [];
      for (const key of adList.keys) {
        const data = await env.AD_MANAGER_KV.get(key.name, "json");
        if (data) ads.push(data);
      }
      return new Response(JSON.stringify(ads), { headers: { "Content-Type": "application/json" } });
    }

    // API: TOGGLE STATUS
    if (url.pathname === "/api/toggle" && request.method === "POST") {
      const { slug } = await request.json();
      const data = await env.AD_MANAGER_KV.get(`ad:${slug}`, "json");
      data.active = !data.active;
      await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(data));
      return new Response(JSON.stringify({ success: true }));
    }

    // API: DELETE
    if (url.pathname === "/api/delete" && request.method === "POST") {
      const { slug, fileName } = await request.json();
      await env.AD_BUCKET.delete(fileName);
      await env.AD_MANAGER_KV.delete(`ad:${slug}`);
      return new Response(JSON.stringify({ success: true }));
    }

    // VIEW ASSET (R2 Storage)
    if (path.startsWith("view/")) {
      const fileName = path.replace("view/", "");
      const object = await env.AD_BUCKET.get(fileName);
      if (!object) return new Response("Not Found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(object.body, { headers });
    }

    // API: CREATE
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
        history: Array.from({length: 10}, () => Math.floor(Math.random() * 100)), // Dummy data untuk grafik
        created_at: new Date().toISOString()
      };

      await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
      return new Response(JSON.stringify({ success: true }));
    }

    // REDIRECT LOGIC
    if (path && !["api", "view"].includes(path.split('/')[0])) {
      const adData = await env.AD_MANAGER_KV.get(`ad:${path}`, "json");
      if (adData && adData.active) {
        adData.clicks = (adData.clicks || 0) + 1;
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
    <title>Reatrix Analytics</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      body { background: #ffffff; color: #111827; font-family: 'Inter', sans-serif; }
      .stat-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 1.25rem; background: #fff; transition: all 0.2s; }
      .stat-card:hover { border-color: #3b82f6; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
      .table-header { font-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] border-b border-gray-100 bg-gray-50/50 p-4; }
      .row-ad { border-bottom: 1px solid #f3f4f6; padding: 0.75rem 1rem; transition: 0.2s; }
      .row-ad:hover { background: #f9fafb; }
      .sparkline { width: 80px; height: 30px; }
    </style>
  </head>
  <body class="p-4 md:p-8">
    <div class="max-w-6xl mx-auto">
      
      <div class="flex items-center justify-between mb-10 pb-6 border-b border-gray-100">
        <div>
          <h1 class="text-lg font-bold tracking-tight text-gray-900">REATRIX <span class="text-blue-600 font-medium">AD-INTELLIGENCE</span></h1>
          <p class="text-[11px] text-gray-400 font-medium uppercase tracking-tighter">PT Reatrix Media Indonesia Dashboard</p>
        </div>
        <button onclick="showModal()" class="bg-[#0051ff] hover:bg-blue-700 text-white text-[11px] font-bold py-2 px-5 rounded shadow-sm transition-all uppercase tracking-widest">
          + New Asset
        </button>
      </div>

      <div id="main-stats" class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10"></div>

      <div class="border border-gray-200 rounded-md overflow-hidden">
        <div class="grid grid-cols-12 gap-4 table-header">
          <div class="col-span-5">Advertiser & Link</div>
          <div class="col-span-2 text-center">Status</div>
          <div class="col-span-1 text-center">Clicks</div>
          <div class="col-span-2 text-center">Revenue</div>
          <div class="col-span-2 text-right">Actions</div>
        </div>
        <div id="ads-container"></div>
      </div>
    </div>

    <template id="formTemplate">
      <form id="adForm" class="text-left space-y-4 p-1">
        <input name="client" class="w-full border p-3 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Client Name" required>
        <div class="grid grid-cols-2 gap-3">
          <input name="slug" class="border p-3 rounded text-sm font-mono" placeholder="Slug URL" required>
          <input type="number" name="price" class="border p-3 rounded text-sm" placeholder="IDR Per Click" required>
        </div>
        <input name="target" class="w-full border p-3 rounded text-sm" placeholder="Target Link (https://...)" required>
        <input type="date" name="expiry" class="w-full border p-3 rounded text-sm" required>
        <input type="file" name="banner" accept="image/*" class="text-[10px] text-gray-400 block w-full mt-2" required>
      </form>
    </template>

    <script>
      async function updateDashboard() {
        const res = await fetch('/api/stats');
        const ads = await res.json();
        
        const totalClicks = ads.reduce((a, b) => a + (b.clicks || 0), 0);
        const totalRev = ads.reduce((a, b) => a + ((b.clicks || 0) * (b.price_per_click || 0)), 0);
        
        // Build Main Stats (Merah/Hijau Logic)
        document.getElementById('main-stats').innerHTML = \`
          \${renderStatBox('Total Clicks', totalClicks.toLocaleString(), [10, 30, 20, 50, 40, 80], true)}
          \${renderStatBox('Revenue', 'Rp' + totalRev.toLocaleString(), [80, 70, 60, 40, 30, 20], false)}
          \${renderStatBox('Active Campaign', ads.filter(x=>x.active).length, [50, 50, 50, 55, 50, 60], true)}
          \${renderStatBox('Avg. CTR', '100%', [20, 40, 30, 70, 50, 90], true)}
        \`;

        document.getElementById('ads-container').innerHTML = ads.map(ad => {
          const trackLink = \`link.reatrixweb.com/\${ad.path}\`;
          const seoCode = \`<a href="https://\${trackLink}" target="_blank" title="\${ad.client}"><img src="\${ad.banner_url}" width="1280" height="720" alt="\${ad.client}" style="width:100%;height:auto;border-radius:4px;"></a>\`;

          return \`
            <div class="grid grid-cols-12 gap-4 row-ad items-center">
              <div class="col-span-5 flex items-center gap-3">
                <img src="\${ad.banner_url}" class="w-9 h-9 rounded border object-cover">
                <div class="min-w-0">
                  <p class="text-[13px] font-bold text-gray-900 truncate">\${ad.client}</p>
                  <p class="text-[10px] text-blue-500 font-mono truncate hover:underline cursor-pointer" onclick="copyText('\${trackLink}')">\${trackLink}</p>
                </div>
              </div>
              <div class="col-span-2 text-center">
                <button onclick="toggleStatus('\${ad.path}')" class="text-[9px] font-black px-2 py-0.5 rounded-full uppercase \${ad.active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}">
                  \${ad.active ? '● Active' : '○ Paused'}
                </button>
              </div>
              <div class="col-span-1 text-center text-xs font-semibold">\${ad.clicks}</div>
              <div class="col-span-2 text-center text-xs font-bold text-green-600">Rp\${((ad.clicks||0)*(ad.price_per_click||0)).toLocaleString()}</div>
              <div class="col-span-2 text-right space-x-3">
                <button onclick="showEmbed(\\\`\${seoCode}\\\`')" class="text-[10px] font-bold text-blue-600 hover:text-blue-800 uppercase underline">Embed</button>
                <button onclick="confirmDelete('\${ad.path}', '\${ad.file_name}')" class="text-gray-300 hover:text-red-500 text-sm">×</button>
              </div>
            </div>
          \`;
        }).join('');
      }

      function renderStatBox(label, val, points, isUp) {
        const color = isUp ? '#10b981' : '#ef4444'; // Hijau vs Merah
        const path = points.map((p, i) => \`\${(i * 16)}, \${30 - (p / 100 * 30)}\`).join(' ');
        
        return \`
          <div class="stat-card">
            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">\${label}</p>
            <div class="flex items-end justify-between">
              <h2 class="text-xl font-bold text-gray-900">\${val}</h2>
              <svg class="sparkline" viewBox="0 0 80 30">
                <polyline fill="none" stroke="\${color}" stroke-width="2" points="\${path}" />
              </svg>
            </div>
            <p class="text-[9px] font-bold mt-2 \${isUp ? 'text-green-500' : 'text-red-500'}">
              \${isUp ? '↑ Rising' : '↓ Falling'}
            </p>
          </div>
        \`;
      }

      function showModal() {
        Swal.fire({
          title: '<p class="text-sm font-bold uppercase">New Campaign</p>',
          html: document.getElementById('formTemplate').innerHTML,
          showCancelButton: true,
          confirmButtonText: 'Deploy',
          confirmButtonColor: '#0051ff',
          preConfirm: () => {
            const form = Swal.getPopup().querySelector('#adForm');
            if (!form.checkValidity()) return Swal.showValidationMessage('Complete the form!');
            return new FormData(form);
          }
        }).then(res => { if (res.isConfirmed) saveAd(res.value); });
      }

      async function saveAd(fd) {
        await fetch('/api/create', { method: 'POST', body: fd });
        updateDashboard();
      }

      async function toggleStatus(slug) {
        await fetch('/api/toggle', { method: 'POST', body: JSON.stringify({ slug }) });
        updateDashboard();
      }

      function showEmbed(code) {
        Swal.fire({
          title: 'SEO Tag',
          html: \`<textarea class="w-full h-24 p-2 text-[10px] font-mono border rounded bg-gray-50 mt-2" readonly>\${code}</textarea>\`,
          confirmButtonText: 'Copy'
        }).then(() => copyText(code));
      }

      function copyText(t) {
        navigator.clipboard.writeText(t);
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Copied!', showConfirmButton: false, timer: 1000 });
      }

      async function confirmDelete(slug, fileName) {
        const res = await Swal.fire({ title: 'Delete?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' });
        if (res.isConfirmed) {
          await fetch('/api/delete', { method: 'POST', body: JSON.stringify({ slug, fileName }) });
          updateDashboard();
        }
      }

      updateDashboard();
    </script>
  </body>
  </html>
  `;
}
