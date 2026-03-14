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
        history: [2, 5, 3, 8, 4, 10, 0]
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
        adData.history[adData.history.length-1]++;
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
    <title>Reatrix Pro Analytics</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <style>
        body { background: #fcfcfc; font-family: sans-serif; }
        .swal2-popup { font-size: 0.8rem !important; width: 90% !important; }
        .sparkline { stroke: #2563eb; fill: rgba(37, 99, 235, 0.1); }
    </style>
</head>
<body class="p-4">
    <div class="max-w-lg mx-auto">
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-xl font-black">REATRIX <span class="text-blue-600 italic">ADS</span></h1>
            <button onclick="addAd()" class="bg-blue-600 text-white p-2 px-4 rounded-lg font-bold text-xs">+ CAMPAIGN</button>
        </div>

        <div id="stats" class="grid grid-cols-2 gap-3 mb-6"></div>

        <div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div class="p-3 bg-slate-50 border-b text-[10px] font-bold text-slate-400 uppercase">Active Campaigns</div>
            <div id="list"></div>
        </div>
    </div>

    <script>
        async function load() {
            const res = await fetch('/api/stats');
            const ads = await res.json();
            const totalClicks = ads.reduce((a, b) => a + b.clicks, 0);
            const totalRev = ads.reduce((a, b) => a + (b.clicks * b.price), 0);

            document.getElementById('stats').innerHTML = \`
                <div class="bg-white p-4 border rounded-xl"><p class="text-[10px] font-bold text-slate-400">CLICKS</p><p class="text-xl font-black">\${totalClicks}</p></div>
                <div class="bg-white p-4 border rounded-xl"><p class="text-[10px] font-bold text-slate-400">REVENUE</p><p class="text-xl font-black text-green-600">Rp\${totalRev.toLocaleString()}</p></div>
            \`;

            document.getElementById('list').innerHTML = ads.map(ad => \`
                <div class="p-4 border-b last:border-0">
                    <div class="flex gap-3 mb-3">
                        <img src="\${ad.banner_url}" class="w-12 h-12 rounded-lg object-cover border">
                        <div class="flex-grow">
                            <p class="text-xs font-bold uppercase">\${ad.client}</p>
                            <p class="text-[10px] text-slate-400 font-mono">/\${ad.path}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-xs font-black">\${ad.clicks} Klik</p>
                            <p class="text-[10px] text-green-600 font-bold">Rp\${(ad.clicks * ad.price).toLocaleString()}</p>
                        </div>
                    </div>
                    <div class="flex justify-between gap-2 border-t pt-3">
                        <button onclick="copy('\${window.location.origin}/\${ad.path}')" class="text-[9px] font-bold bg-slate-100 p-1.5 px-2 rounded">🔗 LINK</button>
                        <button onclick="embed('\${ad.path}', '\${ad.banner_url}')" class="text-[9px] font-bold bg-blue-50 text-blue-600 p-1.5 px-2 rounded">📝 SEO</button>
                        <button onclick="copy('\${ad.banner_url}')" class="text-[9px] font-bold bg-slate-100 p-1.5 px-2 rounded">🖼️ IMG</button>
                        <button onclick="del('\${ad.path}')" class="text-[9px] font-bold text-red-500 p-1.5 px-2 rounded">DELETE</button>
                    </div>
                </div>
            \`).join('');
        }

        function addAd() {
            Swal.fire({
                title: 'NEW CAMPAIGN',
                html: \`
                    <input id="c1" class="swal2-input" placeholder="Client Name">
                    <input id="c2" class="swal2-input" placeholder="Slug">
                    <input id="c3" class="swal2-input" placeholder="Target URL">
                    <input id="c4" type="number" class="swal2-input" placeholder="Price/Klik">
                    <input id="c5" type="file" class="swal2-input" accept="image/*">
                \`,
                preConfirm: () => {
                    const fd = new FormData();
                    fd.append('client', document.getElementById('c1').value);
                    fd.append('slug', document.getElementById('c2').value);
                    fd.append('target', document.getElementById('c3').value);
                    fd.append('price', document.getElementById('c4').value);
                    fd.append('banner', document.getElementById('c5').files[0]);
                    return fd;
                }
            }).then(r => { if(r.isConfirmed) fetch('/api/create',{method:'POST',body:r.value}).then(()=>load()) });
        }

        function copy(t) { navigator.clipboard.writeText(t); Swal.fire({toast:true, position:'top', icon:'success', title:'Copied!', showConfirmButton:false, timer:1000}); }
        
        function embed(p, img) {
            const code = \`<a href="\${window.location.origin}/\${p}"><img src="\${img}" width="100%"></a>\`;
            Swal.fire({ title:'SEO EMBED', html:\`<textarea class="w-full h-24 text-[10px] p-2 border font-mono">\${code}</textarea>\` });
        }

        async function del(slug) {
            if(confirm('Hapus?')) { await fetch('/api/delete',{method:'POST',body:JSON.stringify({slug})}); load(); }
        }

        load();
    </script>
</body>
</html>`;
}
