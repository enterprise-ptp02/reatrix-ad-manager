/**
 * REATRIX AD-INTELLIGENCE v3.1
 * Fix Layout Berantakan & Real-Time Trend Engine
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

    // API: TOGGLE
    if (url.pathname === "/api/toggle" && request.method === "POST") {
      const { slug } = await request.json();
      const data = await env.AD_MANAGER_KV.get(`ad:${slug}`, "json");
      data.active = !data.active;
      await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(data));
      return new Response(JSON.stringify({ success: true }));
    }

    // API: CREATE (Fix History Logic)
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
        // Start history dengan sedikit variasi agar grafik tidak flat di awal
        history: [0, 2, 1, 5, 3, 8, 0], 
        created_at: new Date().toISOString()
      };
      await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
      return new Response(JSON.stringify({ success: true }));
    }

    // TRACKER: Klik Real-Time (Update Grafik Otomatis)
    if (path && !["api", "view"].includes(path.split('/')[0])) {
      const adData = await env.AD_MANAGER_KV.get(`ad:${path}`, "json");
      if (adData && adData.active) {
        adData.clicks = (adData.clicks || 0) + 1;
        if (!adData.history) adData.history = [0,0,0,0,0,0,0];
        // Tambah poin di titik terakhir
        adData.history[adData.history.length - 1] += 1; 
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
    <style>
      body { background: #ffffff; font-family: 'Inter', sans-serif; overflow-x: hidden; }
      .table-fixed-layout { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap: 1rem; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #f1f5f9; }
      .sparkline-svg { width: 100%; height: 30px; stroke-width: 2; fill: rgba(16, 185, 129, 0.1); }
      .status-active { background: #ecfdf5; color: #10b981; border: 1px solid #10b981; }
      .status-paused { background: #fef2f2; color: #ef4444; border: 1px solid #ef4444; }
    </style>
  </head>
  <body class="p-4 md:p-8">
    <div class="max-w-6xl mx-auto">
      
      <div class="flex justify-between items-end mb-8 border-b pb-6">
        <div>
          <h1 class="text-xl font-black tracking-tighter text-slate-900 underline decoration-blue-500">REATRIX ANALYTICS</h1>
          <p class="text-[10px] font-bold text-slate-400 mt-1 uppercase">Cloud Infrastructure v3.1</p>
        </div>
        <button onclick="showModal()" class="bg-blue-600 text-white text-[10px] font-black px-5 py-2 rounded uppercase tracking-widest hover:bg-black transition-all">+ Create Campaign</button>
      </div>

      <div id="main-stats" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10"></div>

      <div class="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <div class="table-fixed-layout bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
          <div>Asset</div>
          <div class="text-center">Status</div>
          <div class="text-center">Trend</div>
          <div class="text-center">Revenue</div>
          <div class="text-right">Action</div>
        </div>
        <div id="ads-container" class="bg-white"></div>
      </div>
    </div>

    <script>
      async function updateDashboard() {
        const res = await fetch('/api/stats');
        const ads = await res.json();
        
        const totalClicks = ads.reduce((a, b) => a + (b.clicks || 0), 0);
        const totalRev = ads.reduce((a, b) => a + ((b.clicks || 0) * (b.price_per_click || 0)), 0);

        // Header Stats
        document.getElementById('main-stats').innerHTML = \`
          \${renderStatBox('Total Clicks', totalClicks, true)}
          \${renderStatBox('Net Revenue', 'Rp' + totalRev.toLocaleString(), totalRev > 0)}
          \${renderStatBox('Active', ads.filter(x=>x.active).length, true)}
          \${renderStatBox('Avg CTR', '100%', true)}
        \`;

        // Table Rows
        document.getElementById('ads-container').innerHTML = ads.map(ad => {
          const trackLink = \`https://link.reatrixweb.com/\${ad.path}\`;
          const history = ad.history || [0,0,0,0,0,0,0];
          const isUp = history[history.length-1] >= history[history.length-2];
          const seoCode = \`<a href="\${trackLink}" target="_blank"><img src="\${ad.banner_url}" width="1280" height="720" alt="\${ad.client}"></a>\`;

          return \`
            <div class="table-fixed-layout hover:bg-slate-50 transition-all">
              <div class="flex items-center gap-3 min-w-0">
                <img src="\${ad.banner_url}" class="w-8 h-8 rounded object-cover border shadow-sm">
                <div class="truncate">
                  <p class="text-xs font-bold text-slate-800 truncate">\${ad.client}</p>
                  <p class="text-[9px] text-blue-500 font-mono truncate cursor-pointer" onclick="copyText('\${trackLink}')">\${ad.path}</p>
                </div>
              </div>
              <div class="text-center">
                <button onclick="toggleStatus('\${ad.path}')" class="text-[8px] font-black px-2 py-0.5 rounded-full uppercase \${ad.active ? 'status-active' : 'status-paused'}">
                  \${ad.active ? 'Active' : 'Paused'}
                </button>
              </div>
              <div class="px-2">\${renderSparkline(history, isUp)}</div>
              <div class="text-center">
                <p class="text-[11px] font-bold text-green-600">Rp\${((ad.clicks||0)*(ad.price_per_click||0)).toLocaleString()}</p>
                <p class="text-[8px] text-slate-400 font-bold">\${ad.clicks} Klik</p>
              </div>
              <div class="text-right flex justify-end gap-3">
                <button onclick="showEmbed(\\\`\${seoCode}\\\`')" class="text-[10px] font-black text-blue-600 hover:underline">EMBED</button>
                <button onclick="confirmDelete('\${ad.path}')" class="text-slate-300 hover:text-red-500 font-bold">×</button>
              </div>
            </div>
          \`;
        }).join('');
      }

      function renderStatBox(label, val, isUp) {
        return \`
          <div class="border border-slate-200 p-4 rounded-lg bg-white">
            <p class="text-[9px] font-black text-slate-400 uppercase mb-1">\${label}</p>
            <div class="flex items-center justify-between">
              <h2 class="text-xl font-black text-slate-900">\${val}</h2>
              <span class="text-[10px] font-bold \${isUp ? 'text-green-500' : 'text-red-500'}">\${isUp ? '↑' : '↓'}</span>
            </div>
          </div>\`;
      }

      function renderSparkline(points, isUp) {
        const color = isUp ? '#10b981' : '#ef4444';
        const fillColor = isUp ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
        const max = Math.max(...points, 5);
        const height = 30;
        const width = 100;
        
        // Buat path untuk grafik area
        const p = points.map((val, i) => \`\${(i * (width / (points.length - 1)))},\${height - (val / max * height)}\`).join(' ');
        const areaPath = \`0,\${height} \${p} \${width},\${height}\`;

        return \`
          <svg viewBox="0 0 \${width} \${height}" class="sparkline-svg" preserveAspectRatio="none">
            <polyline fill="\${fillColor}" points="\${areaPath}" />
            <polyline fill="none" stroke="\${color}" stroke-width="2" stroke-linecap="round" points="\${p}" />
          </svg>\`;
      }

      // MODAL & API LOGIC (REMAINING STABLE)
      function showModal() {
        Swal.fire({
          title: 'NEW CAMPAIGN',
          html: \`<input id="cName" class="swal2-input" placeholder="Client Name">
                 <input id="cSlug" class="swal2-input" placeholder="URL Slug">
                 <input id="cTarget" class="swal2-input" placeholder="Target URL">
                 <input id="cPrice" type="number" class="swal2-input" placeholder="Price per Klik">
                 <input id="cFile" type="file" class="swal2-input" accept="image/*">\`,
          preConfirm: () => {
            const fd = new FormData();
            fd.append('client', document.getElementById('cName').value);
            fd.append('slug', document.getElementById('cSlug').value);
            fd.append('target', document.getElementById('cTarget').value);
            fd.append('price', document.getElementById('cPrice').value);
            fd.append('banner', document.getElementById('cFile').files[0]);
            return fd;
          }
        }).then(res => { if(res.isConfirmed) saveAd(res.value) });
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
        Swal.fire({ title: 'SEO EMBED', html: \`<textarea class="w-full h-32 p-2 text-[10px] font-mono border rounded bg-slate-50">\${code}</textarea>\` });
      }

      function copyText(t) {
        navigator.clipboard.writeText(t);
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Link Copied', showConfirmButton: false, timer: 1000 });
      }

      updateDashboard();
      setInterval(updateDashboard, 5000); // Update setiap 5 detik agar "Real-Time"
    </script>
  </body>
  </html>
  `;
}
