export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

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
      return new Response(object.body, { headers: { "Content-Type": object.httpMetadata.contentType, "Access-Control-Allow-Origin": "*" } });
    }

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
        price: parseFloat(formData.get("price")) || 0,
        clicks: 0,
        views: 0,
        history: Array.from({length: 12}, () => Math.floor(Math.random() * 10))
      };
      await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === "/api/delete" && request.method === "POST") {
      const { slug } = await request.json();
      await env.AD_MANAGER_KV.delete(`ad:${slug}`);
      return new Response(JSON.stringify({ success: true }));
    }

    if (path && !["api", "view"].includes(path.split('/')[0])) {
      const adData = await env.AD_MANAGER_KV.get(`ad:${path}`, "json");
      if (adData) {
        adData.clicks = (adData.clicks || 0) + 1;
        adData.views = (adData.views || 0) + 1; 
        if(!adData.history) adData.history = [0,0,0,0,0,0,0,0,0,0,0,0];
        adData.history[adData.history.length - 1]++;
        await env.AD_MANAGER_KV.put(`ad:${path}`, JSON.stringify(adData));
        return Response.redirect(adData.target_url, 302);
      }
    }

    return new Response(renderHTML(), { headers: { "Content-Type": "text/html" } });
  }
};

function renderHTML() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reatrix AdSense Engine</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
        body { background: #f4f7fe; font-family: 'Inter', sans-serif; color: #1a202c; }
        .ad-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .trend-up { color: #10b981; }
        .trend-down { color: #ef4444; }
    </style>
</head>
<body class="p-4">
    <div class="max-w-md mx-auto">
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-xl font-extrabold tracking-tight">REATRIX <span class="text-blue-600">ADSENSE</span></h1>
            <button onclick="addAd()" class="bg-blue-600 text-white p-2 px-4 rounded-lg font-bold text-xs shadow-md">+ NEW</button>
        </div>

        <div id="stats" class="grid grid-cols-2 gap-3 mb-6"></div>

        <div class="ad-card overflow-hidden">
            <div class="p-3 bg-slate-50 border-b flex justify-between items-center">
                <span class="text-[10px] font-bold text-slate-500 uppercase">Performance Live</span>
                <div class="flex items-center gap-1">
                  <span class="w-2 h-2 bg-green-500 rounded-full animate-ping"></span>
                  <span class="text-[9px] font-bold text-green-600">REAL-TIME</span>
                </div>
            </div>
            <div id="list" class="divide-y divide-slate-100"></div>
        </div>
    </div>

    <script>
        async function load() {
            const res = await fetch('/api/stats');
            const ads = await res.json();
            
            const totalClicks = ads.reduce((a, b) => a + (b.clicks || 0), 0);
            const totalViews = ads.reduce((a, b) => a + (b.views || totalClicks + 5), 0);
            const totalRev = ads.reduce((a, b) => a + ((b.clicks || 0) * (b.price || 0)), 0);
            const avgCTR = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : "0.00";

            document.getElementById('stats').innerHTML = \`
                <div class="ad-card p-4"><p class="text-[10px] font-bold text-slate-400">EST. REVENUE</p><p class="text-lg font-black text-green-600">Rp\${totalRev.toLocaleString()}</p></div>
                <div class="ad-card p-4"><p class="text-[10px] font-bold text-slate-400">PAGE VIEWS</p><p class="text-lg font-black">\${totalViews}</p></div>
                <div class="ad-card p-4"><p class="text-[10px] font-bold text-slate-400">CLICKS</p><p class="text-lg font-black">\${totalClicks}</p></div>
                <div class="ad-card p-4"><p class="text-[10px] font-bold text-slate-400">AVG. CTR</p><p class="text-lg font-black text-orange-500">\${avgCTR}%</p></div>
            \`;

            document.getElementById('list').innerHTML = ads.map(ad => {
                const ctr = ad.views > 0 ? ((ad.clicks/ad.views)*100).toFixed(2) : "0.00";
                const history = ad.history || [0,0,0,0,0,0,0,0,0,0,0,0];
                const trendUp = history[11] >= history[10];

                return \`
                <div class="p-4">
                    <div class="flex gap-3 items-center mb-4">
                        <img src="\${ad.banner_url}" class="w-12 h-12 rounded-lg object-cover border">
                        <div class="flex-grow min-w-0">
                            <p class="text-[11px] font-black uppercase truncate">\${ad.client}</p>
                            <div class="flex items-center gap-2">
                                <p class="text-[10px] text-blue-500 font-mono truncate">/\${ad.path}</p>
                                <span class="text-[10px] font-bold \${trendUp ? 'trend-up' : 'trend-down'}">\${trendUp ? '▲' : '▼'}</span>
                            </div>
                        </div>
                        <div class="text-right">
                            <svg width="50" height="20" class="ml-auto">\${renderMiniChart(history, trendUp)}</svg>
                            <p class="text-[9px] font-bold text-slate-400 mt-1 uppercase">Trend 24h</p>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-3 gap-2 mb-4 bg-slate-50 p-2 rounded-lg border border-dashed">
                        <div class="text-center"><p class="text-[8px] text-slate-400 font-bold uppercase">Clicks</p><p class="text-[11px] font-black">\${ad.clicks}</p></div>
                        <div class="text-center border-x"><p class="text-[8px] text-slate-400 font-bold uppercase">CTR</p><p class="text-[11px] font-black text-orange-500">\${ctr}%</p></div>
                        <div class="text-center"><p class="text-[8px] text-slate-400 font-bold uppercase">Earn</p><p class="text-[11px] font-black text-green-600">Rp\${(ad.clicks * ad.price).toLocaleString()}</p></div>
                    </div>

                    <div class="flex justify-between gap-2">
                        <button onclick="copy('\${window.location.origin}/\${ad.path}')" class="flex-1 py-2 bg-white border text-[9px] font-bold rounded-md hover:bg-slate-50">LINK</button>
                        <button onclick="embed('\${ad.path}', '\${ad.banner_url}')" class="flex-1 py-2 bg-blue-600 text-white text-[9px] font-bold rounded-md">EMBED</button>
                        <button onclick="copy('\${ad.banner_url}')" class="flex-1 py-2 bg-white border text-[9px] font-bold rounded-md">ASSET</button>
                        <button onclick="del('\${ad.path}')" class="p-2 text-red-500 hover:bg-red-50 rounded-md">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>
                </div>\`;
            }).join('');
        }

        function renderMiniChart(data, up) {
            const max = Math.max(...data, 1);
            const pts = data.map((v, i) => \`\${(i * 4.5)},\${20 - (v / max * 18)}\`).join(' ');
            return \`<polyline points="\${pts}" fill="none" stroke="\${up ? '#10b981' : '#ef4444'}" stroke-width="2" stroke-linecap="round"/>\`;
        }

        function addAd() {
            Swal.fire({
                title: 'NEW CAMPAIGN',
                html: '<input id="a" class="swal2-input" placeholder="Client"><input id="b" class="swal2-input" placeholder="Slug"><input id="c" class="swal2-input" placeholder="Target URL"><input id="d" type="number" class="swal2-input" placeholder="Price/Click"><input id="e" type="file" class="swal2-input" accept="image/*">',
                preConfirm: () => {
                    const fd = new FormData();
                    fd.append('client', document.getElementById('a').value);
                    fd.append('slug', document.getElementById('b').value);
                    fd.append('target', document.getElementById('c').value);
                    fd.append('price', document.getElementById('d').value);
                    fd.append('banner', document.getElementById('e').files[0]);
                    return fd;
                }
            }).then(r => r.isConfirmed && fetch('/api/create',{method:'POST',body:r.value}).then(()=>load()));
        }

        function copy(t) { navigator.clipboard.writeText(t); Swal.fire({toast:true, position:'top', icon:'success', title:'Copied', showConfirmButton:false, timer:800}); }
        
        function embed(p, i) {
            const code = \`<a href="\${window.location.origin}/\${p}"><img src="\${i}" width="100%"></a>\`;
            Swal.fire({ title:'EMBED CODE', html:\`<textarea class="w-full h-24 p-2 text-[10px] font-mono border">\${code}</textarea>\` });
        }

        function del(s) {
            Swal.fire({ title:'Hapus?', icon:'warning', showCancelButton:true, confirmButtonColor:'#ef4444' }).then(r => {
                if(r.isConfirmed) fetch('/api/delete',{method:'POST',body:JSON.stringify({slug:s})}).then(()=>load());
            });
        }

        load();
        setInterval(load, 5000);
    </script>
</body>
</html>`;
}
