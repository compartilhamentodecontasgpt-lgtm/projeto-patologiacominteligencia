\
/* BTX Laudos — Final (V7) build 20260108214805 */
(() => {
  const $ = (id) => document.getElementById(id);

  const toastEl = $("toast");
  const showToast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.add("hidden"), 2600);
  };

  // ----- IndexedDB -----
  const DB_NAME = "btx_laudos_db";
  const DB_VER = 1;
  const STORE = "cases";

  function openDB(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(STORE)){
          db.createObjectStore(STORE, { keyPath:"id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllCases(){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, "readonly");
      const store = t.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function putCase(c){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      t.objectStore(STORE).put(c);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  async function delCase(id){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      t.objectStore(STORE).delete(id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  // ----- Model -----
  const emptyCase = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth()+1).padStart(2,"0");
    const dd = String(now.getDate()).padStart(2,"0");
    return {
      id: crypto.randomUUID(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      status: "draft",
      prof: { nome:"", reg:"", esp:"", inst:"", contato:"" },
      caseInfo: { code:"", date:`${yyyy}-${mm}-${dd}`, goal:"", patId:"", patDemo:"" },
      clinic: { qp:"", hx:"", topo:"", dim:"", morph:"", fatores:"", hip:"", amostra:"", fix:"", coleta:"", obs:"", req:"", final:"" },
      photos: [],
      ia: { question:"", prompt:"", answer:"" }
    };
  };

  let current = null;
  let casesCache = [];
  let autosaveTimer = null;

  function debounceSave(){
    if(!current) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(async () => {
      current.updatedAt = new Date().toISOString();
      await putCase(current);
      $("saveState").textContent = `Salvo • ${new Date().toLocaleTimeString()}`;
      await loadCases(false);
    }, 450);
  }

  // ----- Views -----
  const viewCases = $("viewCases");
  const viewEdit = $("viewEdit");

  function showCases(){
    viewCases.classList.remove("hidden");
    viewEdit.classList.add("hidden");
    $("btnPDF").disabled = true;
    history.replaceState(null, "", location.pathname + location.search + "#cases");
  }

  function showEdit(){
    viewCases.classList.add("hidden");
    viewEdit.classList.remove("hidden");
    $("btnPDF").disabled = false;
    history.replaceState(null, "", location.pathname + location.search + "#edit");
  }

  function fmtDate(iso){
    if(!iso) return "—";
    try{
      const [y,m,d] = iso.split("-");
      return `${d}/${m}/${y}`;
    }catch{
      return iso;
    }
  }
  function statusLabel(s){
    if(s==="sent") return "Enviado";
    if(s==="done") return "Finalizado";
    return "Rascunho";
  }
  function statusBadge(s){
    return `<span class="badge ${s}">${statusLabel(s)}</span>`;
  }
  function caseSummary(c){
    const code = c.caseInfo?.code || "(sem código)";
    const topo = c.clinic?.topo || "";
    const hip = c.clinic?.hip || "";
    const qp  = c.clinic?.qp  || "";
    const txt = [topo, hip, qp].filter(Boolean).join(" • ").slice(0,120);
    return `${code}${txt ? " — "+txt : ""}`;
  }

  // ----- List -----
  async function loadCases(render=true){
    casesCache = await getAllCases();
    casesCache.sort((a,b) => (b.updatedAt||"").localeCompare(a.updatedAt||""));
    if(render) renderCases();
    updateKPIs();
  }

  function updateKPIs(){
    const total = casesCache.length;
    const nDraft = casesCache.filter(c=>c.status==="draft").length;
    const nSent  = casesCache.filter(c=>c.status==="sent").length;
    const nDone  = casesCache.filter(c=>c.status==="done").length;
    $("kpiTotal").textContent = `${total} casos`;
    $("kpiDraft").textContent = `${nDraft} rascunhos`;
    $("kpiSent").textContent  = `${nSent} enviados`;
    $("kpiDone").textContent  = `${nDone} finalizados`;
  }

  function renderCases(){
    const q = ($("q").value || "").trim().toLowerCase();
    const sf = $("statusFilter").value;
    const tbody = $("casesTbody");
    tbody.innerHTML = "";

    const filtered = casesCache.filter(c => {
      if(sf && c.status !== sf) return false;
      if(!q) return true;
      const hay = JSON.stringify({
        code: c.caseInfo?.code,
        pat: c.caseInfo?.patId,
        topo: c.clinic?.topo,
        hip: c.clinic?.hip,
        qp: c.clinic?.qp,
        req: c.clinic?.req
      }).toLowerCase();
      return hay.includes(q);
    });

    if(!filtered.length){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" class="muted">Nenhum caso. Clique em <b>+ Novo caso</b>.</td>`;
      tbody.appendChild(tr);
      return;
    }

    for(const c of filtered){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${(c.caseInfo?.code || "").trim() || "—"}</b></td>
        <td>${fmtDate(c.caseInfo?.date)}</td>
        <td>${statusBadge(c.status)}</td>
        <td>${caseSummary(c)}</td>
        <td class="right">
          <button class="btn" data-open="${c.id}">Abrir</button>
          <button class="btn" data-dup="${c.id}">Duplicar</button>
          <button class="btn danger" data-del="${c.id}">Excluir</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("button[data-open]").forEach(b => b.addEventListener("click", () => openCase(b.dataset.open)));
    tbody.querySelectorAll("button[data-dup]").forEach(b => b.addEventListener("click", () => duplicateCase(b.dataset.dup)));
    tbody.querySelectorAll("button[data-del]").forEach(b => b.addEventListener("click", () => deleteCase(b.dataset.del)));
  }

  async function openCase(id){
    const found = casesCache.find(c=>c.id===id);
    if(!found) return showToast("Caso não encontrado.");
    current = found;
    fillForm();
    showEdit();
    showToast("Caso aberto");
  }

  async function duplicateCase(id){
    const found = casesCache.find(c=>c.id===id);
    if(!found) return;
    const copy = structuredClone(found);
    copy.id = crypto.randomUUID();
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    copy.status = "draft";
    await putCase(copy);
    await loadCases();
    showToast("Caso duplicado");
  }

  async function deleteCase(id){
    if(!confirm("Excluir este caso? Isso não pode ser desfeito.")) return;
    await delCase(id);
    if(current?.id === id){
      current = null;
      showCases();
    }
    await loadCases();
    showToast("Caso excluído");
  }

  // ----- Form -----
  function fillForm(){
    if(!current) return;
    $("caseMeta").textContent = `Caso: ${current.id.slice(0,8)} • ${statusLabel(current.status)} • atualizado ${new Date(current.updatedAt).toLocaleString()}`;
    $("caseStatus").value = current.status;

    $("profNome").value = current.prof.nome || "";
    $("profReg").value = current.prof.reg || "";
    $("profEsp").value = current.prof.esp || "";
    $("profInst").value = current.prof.inst || "";
    $("profContato").value = current.prof.contato || "";

    $("caseCode").value = current.caseInfo.code || "";
    $("caseDate").value = current.caseInfo.date || "";
    $("caseGoal").value = current.caseInfo.goal || "";
    $("patId").value = current.caseInfo.patId || "";
    $("patDemo").value = current.caseInfo.patDemo || "";

    $("qp").value = current.clinic.qp || "";
    $("hx").value = current.clinic.hx || "";
    $("topo").value = current.clinic.topo || "";
    $("dim").value = current.clinic.dim || "";
    $("morph").value = current.clinic.morph || "";
    $("fatores").value = current.clinic.fatores || "";
    $("hip").value = current.clinic.hip || "";
    $("amostra").value = current.clinic.amostra || "";
    $("fix").value = current.clinic.fix || "";
    $("coleta").value = current.clinic.coleta || "";
    $("obs").value = current.clinic.obs || "";
    $("req").value = current.clinic.req || "";
    $("final").value = current.clinic.final || "";

    $("iaQuestion").value = current.ia.question || "";
    $("iaPrompt").value = current.ia.prompt || "";
    $("iaAnswer").value = current.ia.answer || "";

    renderPhotos();
    $("saveState").textContent = "—";
  }

  function attachEditHandlers(){
    $("caseStatus").addEventListener("change", () => {
      if(!current) return;
      current.status = $("caseStatus").value;
      debounceSave();
    });

    const map = [
      ["profNome", v => current.prof.nome=v],
      ["profReg", v => current.prof.reg=v],
      ["profEsp", v => current.prof.esp=v],
      ["profInst", v => current.prof.inst=v],
      ["profContato", v => current.prof.contato=v],
      ["caseCode", v => current.caseInfo.code=v],
      ["caseDate", v => current.caseInfo.date=v],
      ["caseGoal", v => current.caseInfo.goal=v],
      ["patId", v => current.caseInfo.patId=v],
      ["patDemo", v => current.caseInfo.patDemo=v],
      ["qp", v => current.clinic.qp=v],
      ["hx", v => current.clinic.hx=v],
      ["topo", v => current.clinic.topo=v],
      ["dim", v => current.clinic.dim=v],
      ["morph", v => current.clinic.morph=v],
      ["fatores", v => current.clinic.fatores=v],
      ["hip", v => current.clinic.hip=v],
      ["amostra", v => current.clinic.amostra=v],
      ["fix", v => current.clinic.fix=v],
      ["coleta", v => current.clinic.coleta=v],
      ["obs", v => current.clinic.obs=v],
      ["req", v => current.clinic.req=v],
      ["final", v => current.clinic.final=v],
      ["iaQuestion", v => current.ia.question=v],
      ["iaPrompt", v => current.ia.prompt=v],
      ["iaAnswer", v => current.ia.answer=v],
    ];

    for(const [id, setter] of map){
      $(id).addEventListener("input", (e) => {
        if(!current) return;
        setter(e.target.value);
        $("saveState").textContent = "Salvando...";
        debounceSave();
      });
    }

    $("btnDelete").addEventListener("click", async () => {
      if(!current) return;
      await deleteCase(current.id);
    });

    $("btnBack").addEventListener("click", () => {
      current = null;
      showCases();
      loadCases();
    });

    // Photos
    $("photoInput").addEventListener("change", async (e) => {
      if(!current){ showToast("Crie/abra um caso primeiro."); e.target.value=""; return; }
      const files = Array.from(e.target.files || []);
      if(!files.length) return;

      for(const file of files){
        const dataUrl = await fileToDataUrl(file);
        current.photos.push({ id: crypto.randomUUID(), dataUrl, caption:"" });
      }
      e.target.value = "";
      renderPhotos();
      debounceSave();
      showToast("Foto(s) adicionada(s)");
    });

    $("btnClearPhotos").addEventListener("click", () => {
      if(!current) return;
      if(!current.photos.length) return showToast("Sem fotos.");
      if(!confirm("Remover todas as fotos deste caso?")) return;
      current.photos = [];
      renderPhotos();
      debounceSave();
    });

    // IA
    $("btnIA").addEventListener("click", async () => {
      if(!current) return showToast("Crie/abra um caso primeiro.");
      const prompt = buildPrompt(current, $("iaQuestion").value || "");
      $("iaPrompt").value = prompt;
      current.ia.prompt = prompt;
      debounceSave();
      await copyToClipboard(prompt);
      showToast("Prompt copiado. Cole no ChatGPT/OpenAI.");
    });

    $("btnCopyPrompt").addEventListener("click", async () => {
      const p = $("iaPrompt").value || "";
      if(!p.trim()) return showToast("Sem prompt ainda.");
      await copyToClipboard(p);
      showToast("Prompt copiado.");
    });

    $("btnReset").addEventListener("click", async () => {
      if(!confirm("Resetar o app? Isso apaga TODOS os casos deste navegador.")) return;
      await resetAll();
    });
  }

  function fileToDataUrl(file){
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
  }

  function renderPhotos(){
    const list = $("photosList");
    list.innerHTML = "";
    const photos = current?.photos || [];
    if(!photos.length){
      list.innerHTML = `<div class="muted">Nenhuma foto anexada.</div>`;
      return;
    }

    for(let i=0;i<photos.length;i++){
      const p = photos[i];
      const div = document.createElement("div");
      div.className = "photoCard";
      div.innerHTML = `
        <img src="${p.dataUrl}" alt="Foto ${i+1}">
        <div class="photoTools">
          <input placeholder="Legenda" value="${escapeHtml(p.caption||"")}">
          <button class="btn" data-up="${p.id}">↑</button>
          <button class="btn" data-down="${p.id}">↓</button>
          <button class="btn danger" data-rm="${p.id}">Remover</button>
        </div>
      `;
      const input = div.querySelector("input");
      input.addEventListener("input", () => { p.caption = input.value; debounceSave(); });
      div.querySelector("button[data-up]").addEventListener("click", () => movePhoto(p.id, -1));
      div.querySelector("button[data-down]").addEventListener("click", () => movePhoto(p.id, +1));
      div.querySelector("button[data-rm]").addEventListener("click", () => removePhoto(p.id));
      list.appendChild(div);
    }
  }

  function movePhoto(id, delta){
    const idx = current.photos.findIndex(x=>x.id===id);
    if(idx<0) return;
    const nidx = idx + delta;
    if(nidx<0 || nidx>=current.photos.length) return;
    const [item] = current.photos.splice(idx,1);
    current.photos.splice(nidx,0,item);
    renderPhotos();
    debounceSave();
  }

  function removePhoto(id){
    const idx = current.photos.findIndex(x=>x.id===id);
    if(idx<0) return;
    current.photos.splice(idx,1);
    renderPhotos();
    debounceSave();
  }

  function buildPrompt(c, question){
    const header = `Você é um assistente clínico para REDAÇÃO e ORGANIZAÇÃO de encaminhamentos/laudos.\nREGRAS:\n- NÃO diagnosticar.\n- NÃO interpretar imagens.\n- NÃO inventar dados.\n- Se faltar informação, diga o que falta.\n- Responda em português, direto e prático.\n- Entregue: (1) checklist do que falta, (2) sugestões, (3) texto final pronto para colar.`;
    const task = question.trim()
      ? `TAREFA: Responda à dúvida sem diagnosticar. Dúvida: "${question.trim()}".`
      : `TAREFA: Revise o caso e diga o que falta para ficar completo, sem diagnosticar.`;
    const data = [
      `PROFISSIONAL: ${c.prof.nome} | ${c.prof.reg} | ${c.prof.esp} | ${c.prof.inst} | ${c.prof.contato}`,
      `CASO: código=${c.caseInfo.code} | data=${c.caseInfo.date} | finalidade=${c.caseInfo.goal}`,
      `PACIENTE: id=${c.caseInfo.patId} | idade/sexo=${c.caseInfo.patDemo}`,
      `QUEIXA PRINCIPAL: ${c.clinic.qp}`,
      `HISTÓRIA/EVOLUÇÃO: ${c.clinic.hx}`,
      `LOCALIZAÇÃO: ${c.clinic.topo}`,
      `DIMENSÕES: ${c.clinic.dim}`,
      `DESCRIÇÃO MORFOLÓGICA: ${c.clinic.morph}`,
      `FATORES: ${c.clinic.fatores}`,
      `HIPÓTESES (SEM FECHAR DIAGNÓSTICO): ${c.clinic.hip}`,
      `AMOSTRA: ${c.clinic.amostra}`,
      `FIXADOR: ${c.clinic.fix}`,
      `COLETA: ${c.clinic.coleta}`,
      `OBS.: ${c.clinic.obs}`,
      `SOLICITAÇÃO: ${c.clinic.req}`,
      `OBS. FINAIS: ${c.clinic.final}`,
      `FOTOS: ${(c.photos||[]).length} foto(s) anexada(s) (não interpretar imagens).`,
    ].join("\n");
    return `${header}\n\n${task}\n\nCONTEXTO DO CASO:\n${data}`;
  }

  async function copyToClipboard(text){
    try{
      await navigator.clipboard.writeText(text);
    }catch{
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  function escapeHtml(s){
    return (s||"").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[c]));
  }

  // ----- Export/Import -----
  async function exportAll(){
    const all = await getAllCases();
    const blob = new Blob([JSON.stringify({ version:"7.0.0", exportedAt:new Date().toISOString(), cases:all }, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `btx_laudos_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Backup exportado");
  }

  async function importAll(file){
    const txt = await file.text();
    const data = JSON.parse(txt);
    const items = data.cases || data || [];
    if(!Array.isArray(items)) throw new Error("Formato inválido.");
    for(const c of items){
      if(!c.id) c.id = crypto.randomUUID();
      c.updatedAt = new Date().toISOString();
      await putCase(c);
    }
    await loadCases();
    showToast(`Importado: ${items.length} caso(s)`);
  }

  // ----- PDF -----
  function buildPrint(){
    if(!current) return;
    const tpl = document.querySelector("#printTemplate");
    const node = tpl.content.cloneNode(true);

    const set = (id, html) => node.querySelector("#"+id).innerHTML = html || "<span class='muted'>—</span>";
    set("p_meta", `Código: <b>${escapeHtml(current.caseInfo.code||"—")}</b> • Data: ${fmtDate(current.caseInfo.date)} • Status: ${statusLabel(current.status)}`);

    set("p_prof", `
      <div><b>Profissional:</b> ${escapeHtml(current.prof.nome||"—")}</div>
      <div><b>Registro:</b> ${escapeHtml(current.prof.reg||"—")}</div>
      <div><b>Especialidade:</b> ${escapeHtml(current.prof.esp||"—")}</div>
      <div><b>Instituição:</b> ${escapeHtml(current.prof.inst||"—")}</div>
      <div><b>Contato:</b> ${escapeHtml(current.prof.contato||"—")}</div>
    `);

    set("p_case", `
      <div><b>Finalidade:</b> ${escapeHtml(current.caseInfo.goal||"—")}</div>
      <div><b>Paciente:</b> ${escapeHtml(current.caseInfo.patId||"—")}</div>
      <div><b>Idade/sexo:</b> ${escapeHtml(current.caseInfo.patDemo||"—")}</div>
    `);

    const br = (t) => escapeHtml(t||"—").replace(/\n/g,"<br>");
    set("p_qp", `<div>${br(current.clinic.qp)}</div>`);
    set("p_hx", `<div>${br(current.clinic.hx)}</div>`);
    set("p_morph", `<div><b>Localização:</b> ${escapeHtml(current.clinic.topo||"—")}</div><div><b>Dimensões:</b> ${escapeHtml(current.clinic.dim||"—")}</div><div style="margin-top:6px">${br(current.clinic.morph)}</div>`);
    set("p_hip", `<div><b>Fatores:</b><br>${br(current.clinic.fatores)}</div><div style="margin-top:8px"><b>Hipóteses:</b><br>${br(current.clinic.hip)}</div>`);
    set("p_mat", `<div><b>Amostra:</b> ${escapeHtml(current.clinic.amostra||"—")}</div><div><b>Fixador:</b> ${escapeHtml(current.clinic.fix||"—")}</div><div><b>Coleta:</b> ${escapeHtml(current.clinic.coleta||"—")}</div><div><b>Obs.:</b> ${escapeHtml(current.clinic.obs||"—")}</div>`);
    set("p_req", `<div>${br(current.clinic.req)}</div>`);
    set("p_final", `<div>${br(current.clinic.final)}</div>`);

    const wrap = node.querySelector("#p_photos");
    wrap.className = "printPhotos";
    const photos = current.photos || [];
    if(!photos.length){
      wrap.innerHTML = "<div class='muted'>Sem fotos anexadas.</div>";
    }else{
      for(let i=0;i<photos.length;i++){
        const p = photos[i];
        const div = document.createElement("div");
        div.className = "printPhoto";
        div.innerHTML = `<div class="muted small">Foto ${i+1} — ${escapeHtml(p.caption||"sem legenda")}</div><img src="${p.dataUrl}" alt="Foto ${i+1}">`;
        wrap.appendChild(div);
      }
    }

    node.querySelector("#p_gen").textContent = new Date().toLocaleString();

    let holder = document.getElementById("printHolder");
    if(!holder){
      holder = document.createElement("div");
      holder.id = "printHolder";
      document.body.appendChild(holder);
    }
    holder.innerHTML = "";
    holder.appendChild(node);
  }

  function doPrint(){
    if(!current) return showToast("Abra um caso primeiro.");
    buildPrint();
    setTimeout(() => window.print(), 80);
  }

  // ----- Install prompt -----
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("btnInstall").disabled = false;
  });
  $("btnInstall").addEventListener("click", async () => {
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("btnInstall").disabled = true;
  });

  // ----- Reset -----
  async function resetAll(){
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    if("serviceWorker" in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if("caches" in window){
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    showToast("Resetado. Recarregando...");
    setTimeout(() => location.reload(), 600);
  }

  // ----- New case -----
  async function newCase(){
    const c = emptyCase();
    const seq = (casesCache.length + 1).toString().padStart(4,"0");
    c.caseInfo.code = `BTX-${new Date().getFullYear()}-${seq}`;
    await putCase(c);
    await loadCases();
    current = c;
    fillForm();
    showEdit();
    showToast("Novo caso criado");
  }

  function wireTopbar(){
    $("btnCases").addEventListener("click", () => showCases());
    $("btnNew").addEventListener("click", () => newCase());
    $("btnExport").addEventListener("click", () => exportAll());
    $("fileImport").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if(!file) return;
      try{
        await importAll(file);
      }catch(err){
        console.error(err);
        alert("Falha ao importar: " + (err?.message || err));
      }finally{
        e.target.value = "";
      }
    });
    $("btnPDF").addEventListener("click", () => doPrint());
    $("q").addEventListener("input", () => renderCases());
    $("statusFilter").addEventListener("change", () => renderCases());
  }

  document.addEventListener("DOMContentLoaded", async () => {
    wireTopbar();
    attachEditHandlers();
    await loadCases();
    showCases();
    showToast("Pronto ✅");
  });
})();
