/* Premier Prospect CRM — shared API client, navigation, and lead drawer */
const PP = (() => {
  const SB  = 'https://lbvaosyfikkpvcwksiph.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxidmFvc3lmaWtrcHZjd2tzaXBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMDg0MDksImV4cCI6MjA5MDU4NDQwOX0.Gh9whjmUPz4rdKYr5yo8ZHS0nSNpkQUOwdIladX6mG4';
  // Session lives in localStorage. Requests carry the user's JWT so RLS sees
  // role=authenticated; without a session they fall back to anon (which has
  // no data grants once the lockdown is applied).
  const sess = () => { try{ return JSON.parse(localStorage.getItem('pp.session')||'null'); }catch{ return null; } };
  const H = () => ({apikey:KEY, Authorization:'Bearer '+((sess()||{}).access_token||KEY), 'Content-Type':'application/json'});

  async function get(path){
    const r = await fetch(SB+'/rest/v1/'+path, {headers:H()});
    if(!r.ok) throw new Error('HTTP '+r.status+' — '+(await r.text()).slice(0,140));
    return r.json();
  }
  async function rpc(name, body={}){
    const r = await fetch(SB+'/rest/v1/rpc/'+name, {method:'POST', headers:H(), body:JSON.stringify(body)});
    if(r.status===401){ signOut(); return null; }
    if(!r.ok) throw new Error('HTTP '+r.status+' — '+(await r.text()).slice(0,140));
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }

  async function signIn(email, password){
    const r = await fetch(SB+'/auth/v1/token?grant_type=password',{method:'POST',
      headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const d = await r.json();
    if(!r.ok||!d.access_token) throw new Error(d.error_description||d.msg||'Sign-in failed');
    localStorage.setItem('pp.session', JSON.stringify({access_token:d.access_token, refresh_token:d.refresh_token,
      expires_at:Date.now()+ (d.expires_in||3600)*1000, email:d.user?.email, name:d.user?.user_metadata?.name}));
  }
  async function refresh(){
    const s=sess(); if(!s||!s.refresh_token) return false;
    const r=await fetch(SB+'/auth/v1/token?grant_type=refresh_token',{method:'POST',
      headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});
    if(!r.ok){ localStorage.removeItem('pp.session'); return false; }
    const d=await r.json();
    localStorage.setItem('pp.session', JSON.stringify({...s, access_token:d.access_token, refresh_token:d.refresh_token, expires_at:Date.now()+(d.expires_in||3600)*1000}));
    return true;
  }
  function signOut(){ localStorage.removeItem('pp.session'); location.href='login.html'; }
  async function requireAuth(){
    const s=sess();
    if(!s){ location.href='login.html'; return false; }
    if(Date.now() > (s.expires_at||0) - 60000){ if(!(await refresh())){ location.href='login.html'; return false; } }
    return true;
  }

  const NAV = [
    {grp:'Work'},
    {href:'index.html',   ic:'◎', label:'Overview'},
    {href:'leads.html',   ic:'▤', label:'Seller leads', key:'queue'},
    {href:'buyers.html',  ic:'◈', label:'Buyers', key:'buyers'},
    {href:'pipeline.html',ic:'▥', label:'Pipeline'},
    {href:'activity.html',ic:'◷', label:'Activity'},
    {grp:'Understand'},
    {href:'intel.html',   ic:'◇', label:'How scoring works'},
    {href:'system.html',  ic:'⚙', label:'System health'},
  ];

  function shell(title, desc, actionsHtml=''){
    if(!sess()){ location.href='login.html'; return; }
    requireAuth();
    const here = location.pathname.split('/').pop() || 'index.html';
    const nav = NAV.map(n => n.grp
      ? `<div class="grp">${n.grp}</div>`
      : `<a href="${n.href}" class="${n.href===here?'on':''}"><span class="ic">${n.ic}</span>${n.label}${n.key?`<span class="ct" data-ct="${n.key}"></span>`:''}</a>`
    ).join('');
    document.body.innerHTML = `
      <aside class="side">
        <div class="brand"><div class="nm">Premier Prospect<sup>™</sup></div><div class="sub">A Williams &amp; Co. System</div></div>
        <nav class="nav">${nav}</nav>
        <div class="ft"><div><span class="dot" id="pp-dot"></span><span id="pp-health">checking…</span></div>
          <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center"><span>${esc((sess()||{}).name||(sess()||{}).email||'')}</span><a href="#" onclick="PP.signOut();return false" style="color:var(--gold)">Sign out</a></div></div>
      </aside>
      <div class="main">
        <div class="top"><div><h1>${title}</h1><div class="desc">${desc}</div></div><div class="acts">${actionsHtml}</div></div>
        <div class="body" id="body"></div>
      </div>
      <div class="scrim" id="scrim" onclick="PP.closeDrawer()"></div>
      <div class="drawer" id="drawer"></div>`;
    rpc('pp_app_overview').then(o => {
      if(!o) return;
      const q=document.querySelector('[data-ct="queue"]'); if(q) q.textContent=o.queue;
      const h=document.getElementById('pp-health'); const d=document.getElementById('pp-dot');
      if(o.failed_24h>0){ h.textContent=o.failed_24h+' failed runs'; d.classList.add('bad'); }
      else h.textContent='Pipeline healthy · '+(o.last_refresh||'').slice(0,10);
    }).catch(()=>{});
    rpc('pp_app_buyer_overview_cached').then(b=>{ const e=document.querySelector('[data-ct="buyers"]'); if(e&&b) e.textContent=b.total; }).catch(()=>{});
  }

  const cls = s => s>=95?'s-hot':s>=85?'s-warm':s>=70?'s-mid':'s-low';
  const tier = s => s>=88?'Act now':s>=75?'This week':s>=60?'Qualify':s>=45?'Nurture':'Watch';
  const stage = n => ({5:'Auction scheduled',4:'Foreclosure filed',3:'Lender preparing',2:'Creditor action',1:'Financial pressure'})[n]||'Watch';
  const pill = st => {
    if(!st||st==='new') return '<span class="pill p-new">new</span>';
    if(['listed_with_us','sold','appointment'].includes(st)) return `<span class="pill p-won">${st.replace(/_/g,' ')}</span>`;
    if(['dead','do_not_contact','not_interested'].includes(st)) return `<span class="pill p-dim">${st.replace(/_/g,' ')}</span>`;
    return `<span class="pill p-live">${st.replace(/_/g,' ')}</span>`;
  };
  const money = n => n==null?'—':'$'+Math.round(n).toLocaleString();
  const esc = s => (s??'').toString().replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function openLead(r){
    const dr = document.getElementById('drawer');
    const eq = r.equity_proxy;
    dr.innerHTML = `
      <div class="hd"><div><h2>${esc(r.owner_display||'—')}</h2>
        <div class="muted" style="margin-top:3px"><span class="score ${cls(r.conviction_score)}">${r.conviction_score}</span> · ${tier(r.conviction_score)} · ${stage(r.max_stage)}</div></div>
        <button class="btn sm" onclick="PP.closeDrawer()">✕</button></div>
      <div class="bd">
        ${r.why?`<p style="color:var(--gold);font-size:13px;line-height:1.5">${esc(r.why)}</p>`:''}
        <h4>Verify before you call</h4>
        <div class="kv"><span>Property</span><span class="mono">${esc(r.property_ref||'—')}</span></div>
        <div class="kv"><span>County entries</span><span class="mono">${esc(r.county_entries||'—')}</span></div>
        <div class="kv"><span>County</span><span>${esc(r.county||'—')}</span></div>
        <div class="note">Every figure traces to a public county filing. Look it up at the recorder — you're citing a record, not a hunch.</div>
        <h4>Evidence</h4>
        <div class="kv"><span>Distinct documents</span><span>${r.signal_count??'—'}</span></div>
        <div class="kv"><span>Signal types</span><span>${r.distinct_types??'—'}</span></div>
        ${r.stage_span>0?`<div class="kv"><span>Escalated through</span><span>${r.stage_span} stage${r.stage_span>1?'s':''}</span></div>`:''}
        ${r.cluster_flag?`<div class="kv"><span>Timing</span><span>Clustered in 30 days</span></div>`:''}
        ${r.escalation_ratio>1.1?`<div class="kv"><span>Debt growth</span><span>${Number(r.escalation_ratio).toFixed(1)}×</span></div>`:''}
        ${r.total_tax_debt>0?`<div class="kv"><span>Tax owed</span><span>${money(r.total_tax_debt)}</span></div>`:''}
        ${(r.signal_types||[]).length?`<div class="kv"><span>Signals</span><span style="font-size:12px">${(r.signal_types||[]).map(s=>s.replace(/_/g,' ')).join(', ')}</span></div>`:''}
        ${eq!=null?`<h4>Equity indication</h4>
        <div class="kv"><span>Proxy</span><span>${Math.round(eq)}%</span></div>
        ${r.oldest_loan_years?`<div class="kv"><span>Oldest loan</span><span>${Math.round(r.oldest_loan_years)} years old</span></div>`:''}
        <div class="note">Inferred from mortgage vintage, not verified title. Confirm before relying on it.</div>`:''}
        ${(r.scarcity_score||0)>=0.9?`<h4>Competitive edge</h4><div class="note" style="color:var(--amber)">Low-competition signal — this distress sits in raw recorder filings most agents never read.</div>`:''}
        <h4>Record what happened</h4>
        <div class="acts6">
          <button class="btn sm" onclick="PP.rec('${esc(r.entity_key)}','call','no_answer')">No answer</button>
          <button class="btn sm" onclick="PP.rec('${esc(r.entity_key)}','call','contacted')">Spoke with them</button>
          <button class="btn sm ok" onclick="PP.rec('${esc(r.entity_key)}','appointment_set',null)">Appointment set</button>
          <button class="btn sm ok" onclick="PP.rec('${esc(r.entity_key)}','listing_signed',null)">Listing signed</button>
          <button class="btn sm" onclick="PP.rec('${esc(r.entity_key)}','call','not_interested')">Not interested</button>
          <button class="btn sm no" onclick="PP.rec('${esc(r.entity_key)}','disqualified',null)">Disqualify</button>
        </div>
        <div style="margin-top:10px;display:flex;gap:6px"><input id="pp-note" placeholder="Add a note…" style="flex:1"><button class="btn sm" onclick="PP.rec('${esc(r.entity_key)}','note',null,document.getElementById('pp-note').value)">Save</button></div>
        ${r.touch_count?`<h4>History</h4><div class="kv"><span>Touches</span><span>${r.touch_count}</span></div><div class="kv"><span>Status</span><span>${pill(r.lifecycle_state)}</span></div>`:''}
      </div>`;
    dr.classList.add('open'); document.getElementById('scrim').classList.add('open');
  }
  function closeDrawer(){ document.getElementById('drawer').classList.remove('open'); document.getElementById('scrim').classList.remove('open'); }
  async function rec(key, event, outcome, note){
    try{
      await rpc('pp_record_outcome',{p_entity_key:key,p_event_type:event,p_outcome:outcome,p_channel:'phone',p_actor:'crm',p_notes:note||null});
      closeDrawer(); if(window.PP_reload) await window.PP_reload();
    }catch(e){ alert('Could not record: '+e.message); }
  }
  const empty = (ic,title,sub) => `<div class="empty"><div class="ic">${ic}</div><b>${title}</b>${sub||''}</div>`;
  const err = m => `<div class="err">${esc(m)}</div>`;
  const bar = (label,v,total,cls='') => `<div class="fbar ${cls}"><div class="t"><span>${label}</span><b>${v.toLocaleString()}</b></div><div class="b"><i style="width:${Math.max(1,100*v/Math.max(total,1))}%"></i></div></div>`;
  const ago = iso => { if(!iso) return '—'; const m=(Date.now()-new Date(iso))/60000; return m<60?Math.round(m)+'m ago':m<1440?Math.round(m/60)+'h ago':Math.round(m/1440)+'d ago'; };

  return {get, rpc, shell, signIn, signOut, requireAuth, sess, cls, tier, stage, pill, money, esc, openLead, closeDrawer, rec, empty, err, bar, ago};
})();
