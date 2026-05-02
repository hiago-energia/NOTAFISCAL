"use client";
import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function extractNF(file, apiKey) {
  const fileData = await fileToBase64(file);
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileData, mimeType: file.type, apiKey }),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
  return json.result;
}

function exportXLSX(rows) {
  const header = ["Nº NF","Competência","Data Emissão","Prestador","CNPJ/CPF","Tomador","Descrição Serviço","Valor (R$)","ISS (%)","Banco","Agência","Conta","Favorecido","Arquivo"];
  const keys   = ["numero_nf","competencia","data_emissao","prestador","cnpj_cpf","tomador","descricao_servico","valor","iss_percentual","banco","agencia","conta","favorecido","_source"];
  const wsData = [header, ...rows.map(r => keys.map(k => r[k] || ""))];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [10,12,13,22,16,22,35,12,7,15,10,14,18,22].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "NFs");
  XLSX.writeFile(wb, `nfs_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.xlsx`);
}

const EMPTY = () => ({
  numero_nf:"", competencia:"", data_emissao:"", prestador:"",
  cnpj_cpf:"", tomador:"", descricao_servico:"", valor:"",
  iss_percentual:"", banco:"", agencia:"", conta:"", favorecido:"", _source:"manual"
});

const FIELDS = [
  { k:"numero_nf",         label:"Nº NF",       w:85,  mono:true, color:"#22d3a5" },
  { k:"competencia",       label:"Competência",  w:105 },
  { k:"data_emissao",      label:"Emissão",      w:95  },
  { k:"prestador",         label:"Prestador",    w:165 },
  { k:"cnpj_cpf",          label:"CNPJ/CPF",     w:130, mono:true },
  { k:"tomador",           label:"Tomador",      w:165 },
  { k:"descricao_servico", label:"Serviço",      w:210 },
  { k:"valor",             label:"Valor (R$)",   w:105, mono:true, color:"#60a5fa" },
  { k:"iss_percentual",    label:"ISS%",         w:55,  mono:true },
  { k:"banco",             label:"Banco",        w:120 },
  { k:"agencia",           label:"Agência",      w:80,  mono:true },
  { k:"conta",             label:"Conta",        w:115, mono:true },
  { k:"favorecido",        label:"Favorecido",   w:155 },
];

const C = {
  bg:"#0a0c10", surf:"#111318", surf2:"#181c24", border:"#252c3a",
  accent:"#22d3a5", blue:"#60a5fa", danger:"#f87171", muted:"#5a6480", text:"#dde3f0",
};

export default function Home() {
  const [apiKey, setApiKey]     = useState("");
  const [showKey, setShowKey]   = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [savedKey, setSavedKey] = useState("");
  const [files, setFiles]       = useState([]);
  const [statuses, setStatuses] = useState({});
  const [rows, setRows]         = useState([]);
  const [busy, setBusy]         = useState(false);
  const [progress, setProgress] = useState(0);
  const [alerts, setAlerts]     = useState([]);
  const [drag, setDrag]         = useState(false);
  const inputRef = useRef();

  const addFiles = (list) => {
    const valid = [...list].filter(f => f.type.startsWith("image/") || f.type === "application/pdf");
    setFiles(prev => {
      const ex = new Set(prev.map(f => f.name + f.size));
      return [...prev, ...valid.filter(f => !ex.has(f.name + f.size))];
    });
  };

  const onDrop = useCallback(e => {
    e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files);
  }, []);

  const removeFile = (i) => {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
    setStatuses(prev => { const n = {...prev}; delete n[i]; return n; });
  };

  const saveKey = () => {
    const k = apiKey.trim();
    if (!k) { alert("Cole a chave antes de confirmar."); return; }
    setSavedKey(k);
    setKeySaved(true);
  };

  const process = async () => {
    const key = savedKey || apiKey.trim();
    if (!key) { alert("Confirme sua chave Gemini no Passo 1."); return; }
    if (!files.length) { alert("Adicione pelo menos uma NF."); return; }
    setBusy(true); setAlerts([]); setProgress(0);
    const newRows = [];
    for (let i = 0; i < files.length; i++) {
      setStatuses(p => ({ ...p, [i]: "proc" }));
      setProgress(Math.round(i / files.length * 100));
      try {
        const d = await extractNF(files[i], key);
        d._source = files[i].name;
        newRows.push(d);
        setStatuses(p => ({ ...p, [i]: "ok" }));
      } catch(err) {
        setStatuses(p => ({ ...p, [i]: "err" }));
        setAlerts(p => [...p, `Erro em "${files[i].name}": ${err.message}`]);
      }
    }
    setProgress(100);
    setRows(prev => [...prev, ...newRows]);
    setBusy(false);
  };

  const upd = (i, k, v) => setRows(prev => prev.map((r, idx) => idx === i ? {...r, [k]: v} : r));
  const del = (i) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const dotColor = s => s==="ok" ? C.accent : s==="err" ? C.danger : s==="proc" ? "#fbbf24" : C.muted;

  const th = { padding:"10px 12px", background:C.surf2, fontFamily:"monospace", fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:".5px", whiteSpace:"nowrap", borderBottom:`1px solid ${C.border}`, textAlign:"left" };
  const td = { padding:"6px 8px", borderBottom:`1px solid ${C.border}` };

  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif", background:C.bg, minHeight:"100vh", color:C.text, padding:"32px 24px 80px" }}>
      <div style={{ maxWidth:1280, margin:"0 auto" }}>

        {/* HEADER */}
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:36 }}>
          <div style={{ width:48, height:48, background:`linear-gradient(135deg,${C.accent},${C.blue})`, borderRadius:13, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>🧾</div>
          <div>
            <div style={{ fontSize:26, fontWeight:800, letterSpacing:"-1px" }}>
              Leitor<span style={{ color:C.accent }}>NF</span>
              <span style={{ marginLeft:10, fontSize:11, fontWeight:500, fontFamily:"monospace", color:C.muted, background:C.surf2, border:`1px solid ${C.border}`, borderRadius:6, padding:"2px 8px", verticalAlign:"middle" }}>Gemini · gratuito</span>
            </div>
            <div style={{ fontSize:12, color:C.muted, fontFamily:"monospace", marginTop:3 }}>extração automática de dados de notas fiscais de serviço</div>
          </div>
        </div>

        {/* PASSO 1 — CHAVE */}
        <div style={{ background:C.surf, border:`1px solid ${C.border}`, borderRadius:14, padding:"20px 24px", marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:10, textTransform:"uppercase", letterSpacing:".8px" }}>Passo 1 — Chave API Gemini</div>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setKeySaved(false); }}
              onKeyDown={e => e.key === "Enter" && saveKey()}
              placeholder="AIzaSy..."
              style={{ flex:1, minWidth:200, background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 13px", color:C.text, fontFamily:"monospace", fontSize:13, outline:"none" }}
            />
            <button onClick={() => setShowKey(s => !s)} style={{ background:C.surf2, border:`1px solid ${C.border}`, borderRadius:8, color:C.muted, padding:"10px 14px", cursor:"pointer", fontSize:14 }}>
              {showKey ? "🙈" : "👁️"}
            </button>
            <button onClick={saveKey} style={{ background:`linear-gradient(135deg,${C.accent},#16b891)`, color:"#000", border:"none", borderRadius:9, padding:"10px 20px", fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit", opacity: keySaved ? .65 : 1 }}>
              {keySaved ? "✔ Chave confirmada" : "✔ Confirmar chave"}
            </button>
          </div>
          {keySaved && <div style={{ fontSize:13, color:C.accent, fontFamily:"monospace", marginTop:8 }}>✔ Pronto! Agora envie as NFs abaixo.</div>}
          <div style={{ fontSize:11, color:C.muted, fontFamily:"monospace", marginTop:7 }}>
            Não tem chave?{" "}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" style={{ color:C.blue }}>Crie grátis aqui →</a>
            {" "}(login Google · sem cartão · 1.500 req/dia)
          </div>
        </div>

        {/* PASSO 2 — UPLOAD */}
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current.click()}
          style={{ border:`2px dashed ${drag ? C.accent : C.border}`, borderRadius:14, padding:"44px 24px", textAlign:"center", cursor:"pointer", background: drag ? "#111c18" : C.surf, transition:"all .2s", marginBottom:16 }}
        >
          <div style={{ fontSize:48, marginBottom:12 }}>📂</div>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:6 }}>Passo 2 — Arraste as NFs aqui</div>
          <div style={{ fontSize:13, color:C.muted, fontFamily:"monospace" }}>PDF, PNG, JPG — múltiplos arquivos</div>
          <input ref={inputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" style={{display:"none"}} onChange={e => addFiles(e.target.files)} />
        </div>

        {/* CHIPS */}
        {files.length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:20 }}>
            {files.map((f, i) => (
              <div key={i} style={{ display:"inline-flex", alignItems:"center", gap:7, background:C.surf2, border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 10px", fontSize:12, fontFamily:"monospace" }}>
                <div style={{ width:7, height:7, borderRadius:"50%", background:dotColor(statuses[i]), flexShrink:0 }} />
                <span style={{ color:C.muted, maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
                {!busy && <span onClick={e => { e.stopPropagation(); removeFile(i); }} style={{ cursor:"pointer", color:C.muted, fontSize:11, marginLeft:2 }}>✕</span>}
              </div>
            ))}
          </div>
        )}

        {/* PASSO 3 */}
        {files.length > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:28, flexWrap:"wrap" }}>
            <button
              onClick={process}
              disabled={busy}
              style={{ background: busy ? C.surf2 : `linear-gradient(135deg,${C.accent},#16b891)`, color: busy ? C.muted : "#000", border:"none", borderRadius:10, padding:"12px 28px", fontWeight:800, fontSize:15, cursor: busy ? "not-allowed" : "pointer", fontFamily:"inherit" }}
            >
              {busy ? "⏳ Processando…" : "⚡ Passo 3 — Extrair dados com IA"}
            </button>
            {busy && (
              <>
                <div style={{ flex:1, minWidth:80, background:C.surf2, borderRadius:100, height:4, overflow:"hidden" }}>
                  <div style={{ width:progress+"%", height:"100%", background:`linear-gradient(90deg,${C.accent},${C.blue})`, transition:"width .4s" }} />
                </div>
                <span style={{ fontSize:12, color:C.muted, fontFamily:"monospace" }}>{progress}%</span>
              </>
            )}
          </div>
        )}

        {/* ALERTAS */}
        {alerts.map((a, i) => (
          <div key={i} style={{ padding:"10px 14px", borderRadius:8, fontSize:13, marginBottom:8, background:"rgba(248,113,113,.1)", border:"1px solid rgba(248,113,113,.25)", color:C.danger }}>
            ⚠️ {a}
          </div>
        ))}

        {/* TABELA */}
        {rows.length > 0 && (
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontWeight:700, fontSize:15 }}>📊 Dados extraídos</span>
                <span style={{ background:C.surf2, border:`1px solid ${C.border}`, borderRadius:100, padding:"2px 10px", fontSize:11, fontFamily:"monospace", color:C.accent }}>
                  {rows.length} NF{rows.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => setRows(p => [...p, EMPTY()])} style={{ background:C.surf2, color:C.text, border:`1px solid ${C.border}`, borderRadius:9, padding:"8px 16px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
                  + Linha manual
                </button>
                <button onClick={() => exportXLSX(rows)} style={{ background:`linear-gradient(135deg,${C.blue},#3b82f6)`, color:"#fff", border:"none", borderRadius:9, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  ⬇️ Exportar .xlsx
                </button>
              </div>
            </div>

            <div style={{ overflowX:"auto", borderRadius:12, border:`1px solid ${C.border}` }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr>
                    <th style={th}>#</th>
                    {FIELDS.map(f => <th key={f.k} style={th}>{f.label}</th>)}
                    <th style={th}>Arquivo</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? C.surf : "#0e1117" }}>
                      <td style={{ ...td, color:C.muted, fontFamily:"monospace", fontSize:12, padding:"6px 12px" }}>{idx+1}</td>
                      {FIELDS.map(f => (
                        <td key={f.k} style={td}>
                          <input
                            value={row[f.k] || ""}
                            onChange={e => upd(idx, f.k, e.target.value)}
                            style={{ background:"transparent", border:"1px solid transparent", borderRadius:6, color:f.color||C.text, fontFamily:f.mono?"monospace":"inherit", fontSize:13, padding:"3px 6px", width:f.w, minWidth:50, outline:"none" }}
                            onFocus={e => e.target.style.borderColor = C.border}
                            onBlur={e => e.target.style.borderColor = "transparent"}
                          />
                        </td>
                      ))}
                      <td style={{ ...td, color:C.muted, fontSize:11, fontFamily:"monospace", maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{row._source || ""}</td>
                      <td style={td}>
                        <button onClick={() => del(idx)} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:15, padding:4 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ marginTop:56, textAlign:"center", fontSize:11, color:C.muted, fontFamily:"monospace" }}>
          LeitorNF · dados enviados apenas ao Google Gemini · nada é armazenado
        </div>
      </div>
    </div>
  );
}
