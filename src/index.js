export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

    // API: AMBIL DATA REAL-TIME
    if (url.pathname === "/api/stats") {
      const adList = await env.AD_MANAGER_KV.list({ prefix: "ad:" });
      const ads = [];
      for (const key of adList.keys) {
        const data = await env.AD_MANAGER_KV.get(key.name, "json");
        if (data) ads.push(data);
      }
      return new Response(JSON.stringify(ads), { headers: { "Content-Type": "application/json" } });
    }

    // VIEW IMAGE DARI R2
    if (path.startsWith("view/")) {
      const fileName = path.replace("view/", "");
      const object = await env.AD_BUCKET.get(fileName);
      if (!object) return new Response("Not Found", { status: 404 });
      return new Response(object.body, { headers: { "Content-Type": object.httpMetadata.contentType, "Access-Control-Allow-Origin": "*" } });
    }

    // API: CREATE CAMPAIGN
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
        history: [0, 0, 0, 0, 0, 0, 0]
      };
      await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
      return new Response(JSON.stringify({ success: true }));
    }

    // API: DELETE (SweetAlert Triggered)
    if (url.pathname === "/api/delete" && request.method === "POST") {
      const { slug } = await request.json();
      await env.AD_MANAGER_KV.delete(`ad:${slug}`);
      return new Response(JSON.stringify({ success: true }));
    }

    // TRACKER & REDIRECT
    if (path && !["api", "view"].includes(path.split('/')[0])) {
      const adData = await env.AD_MANAGER_KV.get(`ad:${path}`, "json");
      if (adData) {
        adData.clicks = (adData.clicks || 0) + 1;
        if (!adData.history) adData.history = [0,0,0,0,0,0,0];
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
    <title>Reatrix Pro Ads</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&display=swap');
        body { background: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; color: #1e293b; }
        .swal2-popup { border-radius: 20px !important; font-size: 0.85rem !important; }
        .card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; transition: all 0.3s; }
    </style>
</head>
<body class="p-4">
    <div class="max-w-md mx-auto">
        <div class="flex justify-between items-center mb-6">
            <div>
                <h1 class="text-xl font-extrabold tracking-tighter text-slate-900">REATRIX <span class="text-blue-600 italic">ADS</span></h1>
                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Enterprise Dashboard</p>
            </div>
            <button onclick="addAd()" class="bg-blue-600 text-white p-2.5 px-5 rounded-xl font-bold text-xs shadow-lg shadow-blue-200 active:scale-95 transition">+ CAMPAIGN</button>
        </div>

        <div id="stats" class="grid grid-cols-2 gap-3 mb-6">
            <div class="card p-4 animate-pulse bg-slate-100 h-20"></div>
            <div class="card p-4 animate-pulse bg-slate-100 h-20"></div>
        </div>

        <div class="card shadow-sm overflow-hidden">
            <div class="p-4 bg-slate-50/50 border-b flex justify-between items-center">
                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Campaign Overview</span>
                <span id="badge" class="bg-blue-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">0</span>
            </div>
            <div id="list" class="divide-y divide-slate-100">
                <div class="p-10 text-center text-slate-300 text-xs italic">Menghubungkan ke server...</div>
            </div>
        </div>
    </div>

    <script>
        async function updateData() {
            try {
                const res = await fetch('/api/stats');
                const ads = await res.json();
                
                document.getElementById('badge').innerText = ads.length;
                const totalClicks = ads.reduce((a, b) => a + (parseInt(b.clicks) || 0), 0);
                const totalRev = ads.reduce((a, b) => a + ((parseInt(b.clicks) || 0) * (parseFloat(b.price) || 0)), 0);

                // Update Stats (Fix NaN)
                document.getElementById('stats').innerHTML = \`
                    <div class="card p-4">
                        <p class="text-[10px] font-bold text-slate-400 mb-1 uppercase">Total Klik</p>
                        <p class="text-2xl font-black text-slate-900">\${totalClicks}</p>
                    </div>
                    <div class="card p-4 border-l-4 border-l-green-500">
                        <p class="text-[10px] font-bold text-slate-400 mb-1 uppercase">Net Revenue</p>
                        <p class="text-2xl font-black text-green-600">Rp\${totalRev.toLocaleString('id-ID')}</p>
                    </div>
                \`;

                if (ads.length === 0) {
                    document.getElementById('list').innerHTML = '<div class="p-10 text-center text-slate-400 text-xs">Belum ada data campaign aktif.</div>';
                    return;
                }

                document.getElementById('list').innerHTML = ads.map(ad => {
                    const price = parseFloat(ad.price) || 0;
                    const clicks = parseInt(ad.clicks) || 0;
                    const revenue = clicks * price;
                    const link = \`\${window.location.origin}/\${ad.path}\`;

                    return \`
                        <div class="p-4 bg-white">
                            <div class="flex gap-4 items-start mb-4">
                                <img src="\${ad.banner_url}" class="w-14 h-14 rounded-xl object-cover border shadow-sm bg-slate-50" onerror="this.src='https://placehold.co/100x100?text=AD'">
                                <div class="flex-grow min-w-0">
                                    <h3 class="text-sm font-bold text-slate-900 truncate uppercase tracking-tight">\${ad.client}</h3>
                                    <p class="text-[10px] font-mono text-blue-500 mb-1">/\${ad.path}</p>
                                    <div class="flex gap-3 mt-1">
                                        <div class="text-[10px] font-bold"><span class="text-slate-400 uppercase">Klik:</span> \${clicks}</div>
                                        <div class="text-[10px] font-bold text-green-600"><span class="text-slate-400 uppercase">Rev:</span> Rp\${revenue.toLocaleString('id-ID')}</div>
                                    </div>
                                </div>
                            </div>
                            <div class="grid grid-cols-4 gap-2 border-t pt-3">
                                <button onclick="copy('\${link}')" class="text-[9px] font-bold bg-slate-100 py-2 rounded-lg hover:bg-slate-200 transition uppercase">Link</button>
                                <button onclick="embed('\${link}', '\${ad.banner_url}')" class="text-[9px] font-bold bg-blue-50 text-blue-600 py-2 rounded-lg hover:bg-blue-100 transition uppercase">SEO</button>
                                <button onclick="copy('\${ad.banner_url}')" class="text-[9px] font-bold bg-slate-100 py-2 rounded-lg hover:bg-slate-200 transition uppercase">Asset</button>
                                <button onclick="askDelete('\${ad.path}')" class="text-[9px] font-bold text-red-500 bg-red-50 py-2 rounded-lg hover:bg-red-100 transition uppercase">Hapus</button>
                            </div>
                        </div>
                    \`;
                }).join('');
            } catch (e) { console.log(e); }
        }

        function addAd() {
            Swal.fire({
                title: '<span class="text-sm font-black uppercase">Tambah Campaign</span>',
                html: \`
                    <div class="text-left space-y-2">
                        <input id="sw-client" class="swal2-input !m-0 !w-full" placeholder="Nama Advertiser">
                        <input id="sw-slug" class="swal2-input !m-0 !w-full" placeholder="URL Slug (misal: promo-maret)">
                        <input id="sw-target" class="swal2-input !m-0 !w-full" placeholder="URL Tujuan (https://...)">
                        <input id="sw-price" type="number" class="swal2-input !m-0 !w-full" placeholder="Harga per Klik (Rp)">
                        <input id="sw-file" type="file" class="swal2-input !m-0 !w-full text-xs" accept="image/*">
                    </div>\`,
                showCancelButton: true,
                confirmButtonColor: '#2563eb',
                confirmButtonText: 'DEPLOY NOW',
                preConfirm: () => {
                    const fd = new FormData();
                    fd.append('client', document.getElementById('sw-client').value);
                    fd.append('slug', document.getElementById('sw-slug').value);
                    fd.append('target', document.getElementById('sw-target').value);
                    fd.append('price', document.getElementById('sw-price').value);
                    fd.append('banner', document.getElementById('sw-file').files[0]);
                    return fd;
                }
            }).then(result => {
                if (result.isConfirmed) {
                    Swal.fire({ title: 'Deploying...', didOpen: () => Swal.showLoading() });
                    fetch('/api/create', { method: 'POST', body: result.value }).then(() => {
                        updateData();
                        Swal.fire('Success!', 'Campaign berhasil dibuat.', 'success');
                    });
                }
            });
        }

        function askDelete(slug) {
            Swal.fire({
                title: 'Hapus Campaign?',
                text: "Data statistik /" + slug + " akan hilang selamanya.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#64748b',
                confirmButtonText: 'IYA, HAPUS!'
            }).then((result) => {
                if (result.isConfirmed) {
                    fetch('/api/delete', { method: 'POST', body: JSON.stringify({ slug }) }).then(() => {
                        updateData();
                        Swal.fire('Terhapus!', 'Campaign telah dibersihkan.', 'success');
                    });
                }
            });
        }

        function copy(text) {
            navigator.clipboard.writeText(text);
            Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Berhasil disalin!', showConfirmButton: false, timer: 1500 });
        }

        function embed(link, img) {
            const code = \`<a href="\${link}"><img src="\${img}" width="100%" alt="Ad"></a>\`;
            Swal.fire({
                title: 'SEO Embed Code',
                html: \`<textarea class="w-full h-32 p-3 text-[10px] font-mono border rounded-xl bg-slate-50">\${code}</textarea>\`,
                footer: '<p class="text-[9px] text-slate-400 uppercase font-bold">Paste kode ini di file HTML atau CMS Anda</p>'
            });
        }

        // Jalankan & Auto Refresh tiap 5 detik
        updateData();
        setInterval(updateData, 5000);
    </script>
</body>
</html>`;
}
