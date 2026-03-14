/**
 * REATRIX AD MANAGER PRO - FULL SUITE
 * Media Group Management System
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\/$/g, "");

    // 1. SEO & Access Protection
    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /", { headers: { "Content-Type": "text/plain" } });
    }

    // 2. View Asset (Gambar/Video) dari R2
    if (path.startsWith("view/")) {
      const fileName = path.replace("view/", "");
      const object = await env.AD_BUCKET.get(fileName);
      if (!object) return new Response("Asset Not Found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(object.body, { headers });
    }

    // 3. API: Delete Ad & Cleanup R2
    if (url.pathname === "/api/delete" && request.method === "POST") {
      const { slug, fileName } = await request.json();
      await env.AD_BUCKET.delete(fileName); // Hapus dari R2
      await env.AD_MANAGER_KV.delete(`ad:${slug}`); // Hapus dari KV
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    // 4. API: Create Ad
    if (url.pathname === "/api/create" && request.method === "POST") {
      const formData = await request.formData();
      const client = formData.get("client");
      const slug = formData.get("slug").toLowerCase().replace(/\s+/g, '-');
      const target = formData.get("target");
      const expiry = formData.get("expiry");
      const price = formData.get("price") || 0; // Untuk hitung RPM/CPC
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
    }

    // 5. Redirect & Tracking (Real-time Stats)
    if (path && !["api", "view"].includes(path.split('/')[0])) {
      const adData = await env.AD_MANAGER_KV.get(`ad:${path}`, "json");
      if (adData) {
        const today = new Date().toISOString().split('T')[0];
        if (adData.expiry_date && today > adData.expiry_date) {
          return new Response("Iklan ini telah berakhir (Expired).", { status: 410 });
        }

        // Hitung Views secara pasif (setiap klik dianggap 1 view + 1 klik untuk simplisitas redirect)
        adData.views = (parseInt(adData.views) || 0) + 1;
        adData.clicks = (parseInt(adData.clicks) || 0) + 1;
        await env.AD_MANAGER_KV.put(`ad:${path}`, JSON.stringify(adData));
        return Response.redirect(adData.target_url, 302);
      }
    }

    // 6. Render Dashboard
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reatrix Pro Ad-Center</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      body { background: #020617; color: #f1f5f9; font-family: 'Inter', sans-serif; }
      .glass { background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1); }
      .card-stat { border-bottom: 4px solid #3b82f6; }
    </style>
  </head>
  <body class="p-4 md:p-10">
    <div class="max-w-6xl mx-auto">
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-3xl font-bold text-blue-400">Reatrix Media Adsense</h1>
          <p class="text-sm text-slate-500 uppercase tracking-tighter">Professional Advertiser Dashboard</p>
        </div>
        <button onclick="document.getElementById('modal').style.display='flex'" class="bg-blue-600 px-6 py-2 rounded-xl font-bold text-sm hover:bg-blue-500 transition">Create Campaign</button>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        ${['Total Klik', 'Total Tayang', 'Avg CTR', 'Est. Revenue'].map((label, i) => `
          <div class="glass p-4 rounded-2xl card-stat text-center">
            <p class="text-[10px] text-slate-500 font-bold mb-1">${label}</p>
            <p class="text-xl font-bold text-blue-300">
              ${i === 0 ? ads.reduce((a,b)=>a+(b.clicks||0),0) : 
                i === 1 ? ads.reduce((a,b)=>a+(b.views||0),0) :
                i === 2 ? (ads.reduce((a,b)=>a+(b.clicks/b.views*100||0),0)/ads.length||0).toFixed(2)+'%' :
                'IDR ' + ads.reduce((a,b)=>a+(b.price||0),0).toLocaleString()}
            </p>
          </div>
        `).join('')}
      </div>

      <div class="glass rounded-[2rem] overflow-hidden">
        <table class="w-full text-left border-collapse text-sm">
          <thead class="bg-white/5 text-slate-400">
            <tr>
              <th class="p-4 px-6">Advertiser</th>
              <th class="p-4 px-6">Stats (Klik/View/CTR)</th>
              <th class="p-4 px-6">Finansial (CPC/RPM)</th>
              <th class="p-4 px-6">Durasi</th>
              <th class="p-4 px-6 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5 text-xs">
            ${ads.map(ad => {
              const ctr = ((ad.clicks / ad.views) * 100 || 0).toFixed(2);
              const cpc = (ad.price / ad.clicks || 0).toFixed(0);
              const rpm = (ad.price / ad.views * 1000 || 0).toFixed(0);
              const isExpired = new Date().toISOString().split('T')[0] > ad.expiry_date;
              
              return `
              <tr class="hover:bg-white/5 transition">
                <td class="p-4 px-6 flex items-center gap-3">
                  <img src="${ad.banner_url}" class="w-10 h-10 rounded-lg object-cover">
                  <div>
                    <p class="font-bold text-white text-sm">${ad.client}</p>
                    <p class="text-blue-400 font-mono text-[10px]">link.reatrixweb.com/${ad.path}</p>
                  </div>
                </td>
                <td class="p-4 px-6">
                  <p class="text-white font-bold">${ad.clicks} <span class="text-slate-500 text-[10px]">Clicks</span></p>
                  <p class="text-slate-400">${ad.views} <span class="text-[10px]">Views</span> | CTR: ${ctr}%</p>
                </td>
                <td class="p-4 px-6">
                  <p class="text-green-400 font-bold">CPC: ${cpc}</p>
                  <p class="text-slate-400">RPM: ${rpm}</p>
                </td>
                <td class="p-4 px-6">
                  <p class="${isExpired ? 'text-red-500 font-bold' : 'text-slate-300'}">${ad.expiry_date}</p>
                  <p class="text-[9px] text-slate-600">${isExpired ? 'EXPIRED' : 'ACTIVE'}</p>
                </td>
                <td class="p-4 px-6 text-center">
                  <button onclick="deleteAd('${ad.path}', '${ad.file_name}')" class="text-red-500 hover:text-red-400 font-bold">Hapus</button>
                </td>
              </tr>
            `}).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div id="modal" style="display:none;" class="fixed inset-0 bg-black/90 z-50 items-center justify-center p-4">
      <div class="glass p-8 rounded-3xl w-full max-w-md">
        <h2 class="text-xl font-bold mb-6 text-blue-400">New Advertisement</h2>
        <form id="adForm" class="space-y-4">
          <input name="client" placeholder="Client Name" required class="w-full bg-slate-900 p-3 rounded-xl border border-white/10 outline-none">
          <input name="slug" placeholder="Custom Slug (ex: promo-gaming)" required class="w-full bg-slate-900 p-3 rounded-xl border border-white/10 outline-none text-blue-400 font-mono">
          <input name="target" placeholder="Target URL (WA/Web)" required class="w-full bg-slate-900 p-3 rounded-xl border border-white/10 outline-none">
          <div class="flex gap-4">
            <div class="flex-1">
              <label class="text-[9px] text-slate-500 uppercase ml-1">Price (Budget Iklan)</label>
              <input type="number" name="price" placeholder="IDR" class="w-full bg-slate-900 p-3 rounded-xl border border-white/10 outline-none">
            </div>
            <div class="flex-1">
              <label class="text-[9px] text-slate-500 uppercase ml-1">Expiry Date</label>
              <input type="date" name="expiry" required class="w-full bg-slate-900 p-3 rounded-xl border border-white/10 outline-none text-xs">
            </div>
          </div>
          <input type="file" name="banner" accept="image/*,video/*" required class="w-full text-[10px] text-slate-500">
          <button type="submit" id="btnSubmit" class="w-full bg-blue-600 py-4 rounded-xl font-bold shadow-lg shadow-blue-900/40">Publish Campaign</button>
          <button type="button" onclick="document.getElementById('modal').style.display='none'" class="w-full text-slate-600 text-xs mt-2">Close Dashboard</button>
        </form>
      </div>
    </div>

    <script>
      async function deleteAd(slug, fileName) {
        if(confirm('Hapus iklan ini? File di R2 juga akan dihapus.')) {
          const res = await fetch('/api/delete', {
            method: 'POST',
            body: JSON.stringify({ slug, fileName })
          });
          if(res.ok) location.reload();
        }
      }

      document.getElementById('adForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnSubmit');
        btn.innerText = 'Uploading Asset...';
        btn.disabled = true;

        const formData = new FormData(e.target);
        const res = await fetch('/api/create', { method: 'POST', body: formData });
        if (res.ok) { 
          alert('Iklan Berhasil Diterbitkan!');
          location.reload(); 
        } else {
          alert('Gagal Upload. Pastikan file tidak terlalu besar.');
          btn.disabled = false;
          btn.innerText = 'Publish Campaign';
        }
      };
    </script>
  </body>
  </html>
  `;
}
