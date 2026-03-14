/**
 * REATRIX AD MANAGER PRO - ULTRA PREMIUM VERSION
 * Custom UI for Mobile & Desktop
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /", { headers: { "Content-Type": "text/plain" } });
    }

    if (path.startsWith("view/")) {
      const fileName = path.replace("view/", "");
      const object = await env.AD_BUCKET.get(fileName);
      if (!object) return new Response("Asset Not Found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(object.body, { headers });
    }

    if (url.pathname === "/api/delete" && request.method === "POST") {
      const { slug, fileName } = await request.json();
      await env.AD_BUCKET.delete(fileName);
      await env.AD_MANAGER_KV.delete(`ad:${slug}`);
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (url.pathname === "/api/create" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const client = formData.get("client");
        const slug = formData.get("slug").toLowerCase().replace(/\s+/g, '-');
        const target = formData.get("target");
        const expiry = formData.get("expiry");
        const price = formData.get("price") || 0;
        const file = formData.get("banner");

        const fileExt = file.name.split('.').pop();
        const fileName = `${slug}-${Date.now()}.${fileExt}`;
        await env.AD_BUCKET.put(fileName, file.stream(), { httpMetadata: { contentType: file.type } });

        const adData = {
          client,
          path: slug,
          target_url: target,
          banner_url: `${url.origin}/view/${fileName}`,
          file_name: fileName,
          expiry_date: expiry,
          price: parseFloat(price),
          clicks: 0,
          views: 0,
          created_at: new Date().toISOString()
        };

        await env.AD_MANAGER_KV.put(`ad:${slug}`, JSON.stringify(adData));
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
      }
    }

    if (path && !["api", "view"].includes(path.split('/')[0])) {
      const adData = await env.AD_MANAGER_KV.get(`ad:${path}`, "json");
      if (adData) {
        const today = new Date().toISOString().split('T')[0];
        if (adData.expiry_date && today > adData.expiry_date) {
          return new Response("Masa tayang iklan berakhir.", { status: 410 });
        }
        adData.views = (parseInt(adData.views) || 0) + 1;
        adData.clicks = (parseInt(adData.clicks) || 0) + 1;
        await env.AD_MANAGER_KV.put(`ad:${path}`, JSON.stringify(adData));
        return Response.redirect(adData.target_url, 302);
      }
    }

    const adList = await env.AD_MANAGER_KV.list({ prefix: "ad:" });
    const ads = [];
    for (const key of adList.keys) {
      const data = await env.AD_MANAGER_KV.get(key.name, "json");
      if (data) ads.push(data);
    }

    return new Response(renderHTML(ads), { 
      headers: { "Content-Type": "text/html", "X-Robots-Tag": "noindex" } 
    });
  }
};

function renderHTML(ads) {
  return `
  <!DOCTYPE html>
  <html lang="id">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Reatrix Media Adsense</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
      body { background: #050a18; color: #f1f5f9; font-family: 'Plus Jakarta Sans', sans-serif; }
      .glass { background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(15px); border: 1px solid rgba(255,255,255,0.08); }
      .btn-glow { transition: all 0.3s; box-shadow: 0 0 20px rgba(59, 130, 246, 0.3); }
      .btn-glow:hover { transform: translateY(-2px); box-shadow: 0 0 30px rgba(59, 130, 246, 0.5); }
      .swal2-popup { border-radius: 2rem !important; background: #0f172a !important; color: white !important; }
    </style>
  </head>
  <body class="p-4 md:p-10 pb-24">
    <div class="max-w-4xl mx-auto">
      <header class="flex justify-between items-center mb-10">
        <div>
          <h1 class="text-2xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">Reatrix Ads</h1>
          <p class="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">Advertiser Cloud System</p>
        </div>
        <button onclick="showModal()" class="btn-glow bg-blue-600 px-5 py-2.5 rounded-2xl font-bold text-xs">New Ads</button>
      </header>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        ${['Clicks', 'Impressions', 'Avg CTR', 'Revenue'].map((label, i) => `
          <div class="glass p-4 rounded-3xl">
            <p class="text-[9px] text-slate-500 font-bold mb-1 uppercase tracking-wider">${label}</p>
            <p class="text-lg md:text-xl font-extrabold text-blue-400">
              ${i === 0 ? ads.reduce((a,b)=>a+(b.clicks||0),0) : 
                i === 1 ? ads.reduce((a,b)=>a+(b.views||0),0) :
                i === 2 ? (ads.reduce((a,b)=>a+(b.clicks/b.views*100||0),0)/ads.length||0).toFixed(1)+'%' :
                'Rp ' + ads.reduce((a,b)=>a+(b.price||0),0).toLocaleString('id-ID')}
            </p>
          </div>
        `).join('')}
      </div>

      <div class="space-y-4">
        <h2 class="text-sm font-bold text-slate-400 px-2 uppercase tracking-widest">Active Campaigns</h2>
        ${ads.length === 0 ? '<p class="text-center py-10 text-slate-600">No active ads found.</p>' : ''}
        ${ads.map(ad => {
          const isExpired = new Date().toISOString().split('T')[0] > ad.expiry_date;
          const remainingDays = Math.ceil((new Date(ad.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
          
          return `
          <div class="glass p-4 rounded-[2rem] flex items-center gap-4 relative overflow-hidden">
            <img src="${ad.banner_url}" class="w-16 h-16 rounded-2xl object-cover bg-slate-800">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-sm truncate uppercase">${ad.client}</h3>
                ${isExpired ? '<span class="bg-red-500/20 text-red-500 text-[8px] px-2 py-0.5 rounded-full font-bold">EXPIRED</span>' : 
                remainingDays <= 3 ? '<span class="bg-orange-500/20 text-orange-500 text-[8px] px-2 py-0.5 rounded-full font-bold animate-pulse">ENDING SOON</span>' : ''}
              </div>
              <p class="text-blue-400 font-mono text-[9px] truncate mt-1">link.reatrixweb.com/${ad.path}</p>
              <div class="flex gap-4 mt-2">
                <div><p class="text-[8px] text-slate-500 uppercase">Clicks</p><p class="text-xs font-bold">${ad.clicks}</p></div>
                <div><p class="text-[8px] text-slate-500 uppercase">Expiry</p><p class="text-xs font-bold">${ad.expiry_date}</p></div>
                <div><p class="text-[8px] text-slate-500 uppercase">Price</p><p class="text-xs font-bold text-green-400">Rp ${ad.price.toLocaleString()}</p></div>
              </div>
            </div>
            <button onclick="confirmDelete('${ad.path}', '${ad.file_name}')" class="p-2 text-red-500/50 hover:text-red-500 transition">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        `}).join('')}
      </div>
    </div>

    <template id="formTemplate">
      <form id="adForm" class="text-left space-y-4 p-2">
        <input name="client" placeholder="Client Name" class="w-full bg-slate-800 p-4 rounded-2xl border-none outline-none text-sm text-white focus:ring-2 focus:ring-blue-500" required>
        <input name="slug" placeholder="Custom Slug (ex: promo-shop)" class="w-full bg-slate-800 p-4 rounded-2xl border-none outline-none text-sm text-blue-400 font-mono" required>
        <input name="target" placeholder="Target Link (WA/Web)" class="w-full bg-slate-800 p-4 rounded-2xl border-none outline-none text-sm" required>
        <div class="flex gap-3">
          <input type="number" name="price" placeholder="IDR Price" class="w-1/2 bg-slate-800 p-4 rounded-2xl border-none outline-none text-sm">
          <input type="date" name="expiry" class="w-1/2 bg-slate-800 p-4 rounded-2xl border-none outline-none text-xs text-white" required>
        </div>
        <div class="bg-slate-800 p-4 rounded-2xl">
          <p class="text-[10px] text-slate-500 mb-2 uppercase font-bold">Banner/Video Asset</p>
          <input type="file" name="banner" accept="image/*,video/*" class="text-xs text-slate-400 w-full" required>
        </div>
      </form>
    </template>

    <script>
      function showModal() {
        Swal.fire({
          title: '<span class="text-blue-400">Create Campaign</span>',
          html: document.getElementById('formTemplate').innerHTML,
          showCancelButton: true,
          confirmButtonText: 'Publish Now',
          confirmButtonColor: '#2563eb',
          cancelButtonText: 'Cancel',
          preConfirm: () => {
            const form = Swal.getPopup().querySelector('#adForm');
            if (!form.checkValidity()) {
              Swal.showValidationMessage('Semua kolom wajib diisi!');
              return false;
            }
            return new FormData(form);
          }
        }).then((result) => {
          if (result.isConfirmed) {
            saveAd(result.value);
          }
        });
      }

      async function saveAd(formData) {
        Swal.fire({ title: 'Uploading...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const res = await fetch('/api/create', { method: 'POST', body: formData });
        if (res.ok) {
          Swal.fire({ icon: 'success', title: 'Iklan Aktif!', text: 'Kampanye berhasil diterbitkan.', timer: 2000, showConfirmButton: false })
          .then(() => location.reload());
        } else {
          Swal.fire('Gagal!', 'Pastikan file tidak terlalu besar.', 'error');
        }
      }

      function confirmDelete(slug, fileName) {
        Swal.fire({
          title: 'Hapus Iklan?',
          text: "File di R2 juga akan dihapus permanen.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#ef4444',
          confirmButtonText: 'Ya, Hapus!'
        }).then(async (result) => {
          if (result.isConfirmed) {
            const res = await fetch('/api/delete', { method: 'POST', body: JSON.stringify({ slug, fileName }) });
            if (res.ok) location.reload();
          }
        });
      }
    </script>
  </body>
  </html>
  `;
}
