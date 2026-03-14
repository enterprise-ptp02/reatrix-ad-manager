/**
 * REATRIX AD-INTELLIGENCE v3.3
 * Ultimate Fix: Stable List & Asset Recovery
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

    // TRACKER: Klik & Trend
    if (path && !["api", "view", "favicon.ico"].includes(path.split('/')[0])) {
      const adData = await env.AD_MANAGER_KV.get(`ad:${path}`, "json");
      if (adData && adData.active) {
        adData.clicks = (adData.clicks || 0) + 1;
        if (!adData.history) adData.history = [0,0,0,0,0,0,0];
        adData.history[adData.history.length - 1] += 1;
        await env.AD_MANAGER_KV.put(`ad:${path}`, JSON.stringify(adData));
        return Response.redirect(adData.target_url, 302);
      }
    }

    // VIEW ASSET (Fixing Image Broken)
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
      const fileName = `${Date.now()}-${file.name}`;
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
        history: [0, 0, 0, 0, 0, 0, 0],
        created_at: new Date().toISOString()
      };
      await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
      return new Response(JSON.stringify({ success: true }));
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Reatrix Analytics</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap');
      body { font-family: 'Plus Jakarta Sans', sans-serif; background: #ffffff; color: #1e293b; }
      .glass-card { background: #ffffff; border: 1px solid #f1f5f9; border-radius: 12px; }
      .campaign-row { display: flex; align-items: center; padding: 12px; border-bottom: 1px solid #f1f5f9; gap: 12px; }
      .sparkline-box { width: 60px; height: 25px; }
    </style>
  </head>
  <body class="p-4 bg-slate-50/50">
    <div class="max-w-md mx-auto">
      
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-lg font-black tracking-tight">REATRIX <span class="text-blue-600">ADS</span></h1>
          <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Performance Dashboard</p>
        </div>
        <button onclick="showModal()" class="bg-blue-600 text-white p-2 rounded-lg shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <div id="main-stats" class="grid grid-cols-2 gap-3 mb-6"></div>

      <div class="glass-card shadow-sm overflow-hidden bg-white">
        <div class="bg-slate-50 p-3 border-b flex justify-between items-center">
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Campaigns</span>
          <span id="count-tag" class="bg-blue-100 text-blue-600 text-[9px] font-bold px-2 py-0.5 rounded-full">0</span>
        </div>
        <div id="ads-container" class="min-h-[100px]">
          <div class="p-10 text-center text-slate-300 text-xs italic">Loading data...</div>
        </div>
      </div>
    </div>

    <script>
      async function updateDashboard() {
        try {
          const res = await fetch('/api/stats');
          const ads = await res.json();
          
          document.getElementById('count-tag').innerText = ads.length;
          
          const totalClicks = ads.reduce((a, b) => a + (b.clicks || 0), 0);
          const totalRev = ads.reduce((a, b) => a + ((b.clicks || 0) * (b.price_per_click || 0)), 0);

          document.getElementById('main-stats').innerHTML = \`
            <div class="glass-card p-4 bg-white">
              <p class="text-[9px] font-bold text-slate-400 uppercase">Total Clicks</p>
              <p class="text-xl font-black text-slate-900">\${totalClicks}</p>
            </div>
            <div class="glass-card p-4 bg-white">
              <p class="text-[9px] font-bold text-slate-400 uppercase">Revenue</p>
              <p class="text-xl font-black text-green-600">Rp\${totalRev.toLocaleString()}</p>
            </div>
          \`;

          if (ads.length === 0) {
            document.getElementById('ads-container').innerHTML = '<div class="p-10 text-center text-slate-300 text-xs">Belum ada campaign</div>';
            return;
          }

          document.getElementById('ads-container').innerHTML = ads.map(ad => {
            const trackLink = \`https://link.reatrixweb.com/\${ad.path}\`;
            const history = ad.history || [0,0,0,0,0,0,0];
            const isRising = history[history.length-1] >= history[history.length-2];

            return \`
              <div class="campaign-row">
                <div class="w-10 h-10 rounded-lg overflow-hidden border bg-slate-100 flex-shrink-0">
                  <img src="\${ad.banner_url}" class="w-full h-full object-cover" onerror="this.src='https://placehold.co/100x100?text=AD'">
                </div>
                
                <div class="flex-grow min-w-0">
                  <p class="text-xs font-extrabold text-slate-800 truncate uppercase">\${ad.client}</p>
                  <p class="text-[10px] text-blue-500 font-mono truncate" onclick="copyText('\${trackLink}')">/\${ad.path}</p>
                </div>

                <div class="text-right flex-shrink-0">
                   <p class="text-[11px] font-black text-slate-900">\${ad.clicks} Klik</p>
                   <div class="sparkline-box">\${renderSparkline(history, isRising)}</div>
                </div>

                <button onclick="confirmDelete('\${ad.path}', '\${ad.file_name}')" class="text-slate-200 hover:text-red-500 px-1">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            \`;
          }).join('');
        } catch(e) { console.error(e); }
      }

      function renderSparkline(points, isUp) {
        const color = isUp ? '#10b981' : '#ef4444';
        const max = Math.max(...points, 2);
        const p = points.map((v, i) => \`\${i*10},\${25 - (v/max*20)}\`).join(' ');
        return \`<svg viewBox="0 0 60 25" class="w-full h-full"><polyline fill="none" stroke="\${color}" stroke-width="2" stroke-linecap="round" points="\${p}" /></svg>\`;
      }

      function showModal() {
        Swal.fire({
          title: 'NEW CAMPAIGN',
          html: \`<input id="cClient" class="swal2-input" placeholder="Client Name">
                 <input id="cSlug" class="swal2-input" placeholder="Slug URL">
                 <input id="cTarget" class="swal2-input" placeholder="Target URL">
                 <input id="cPrice" type="number" class="swal2-input" placeholder="Price/Klik">
                 <input id="cFile" type="file" class="swal2-input" accept="image/*">\`,
          preConfirm: () => {
            const fd = new FormData();
            fd.append('client', document.getElementById('cClient').value);
            fd.append('slug', document.getElementById('cSlug').value);
            fd.append('target', document.getElementById('cTarget').value);
            fd.append('price', document.getElementById('cPrice').value);
            fd.append('banner', document.getElementById('cFile').files[0]);
            return fd;
          }
        }).then(r => { if(r.isConfirmed) saveAd(r.value) });
      }

      async function saveAd(fd) {
        Swal.fire({ title: 'Deploying...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        await fetch('/api/create', { method: 'POST', body: fd });
        updateDashboard();
        Swal.close();
      }

      function copyText(t) {
        navigator.clipboard.writeText(t);
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Link Copied', showConfirmButton: false, timer: 1000 });
      }

      async function confirmDelete(slug, fileName) {
        const r = await Swal.fire({ title: 'Hapus?', icon: 'warning', showCancelButton: true });
        if(r.isConfirmed) {
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
