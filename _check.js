
var ex=[],sb=[];
var $=function(i){return document.getElementById(i)};
function inr(n){return "₹"+Math.round(n).toLocaleString("en-IN")}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function mon(s){return s.cy==="y"?s.a/12:s.a}
var MICRO=200, CPU=150;

function verdict(s){
  var m=mon(s);
  if(s.u===0)return{t:"Unused: cancel it",c:"t-bad",flag:1};
  var cpu=m/s.u;
  if(cpu>CPU)return{t:inr(cpu)+" per use: review",c:"t-warn",flag:1};
  return{t:inr(cpu)+" per use: worth it",c:"t-ok",flag:0};
}

function renderDx(){
  var ym=new Date().toISOString().slice(0,7);
  var mi=ex.filter(function(x){return x.d.slice(0,7)===ym});
  var micro=mi.filter(function(x){return x.a<=MICRO});
  var microSum=micro.reduce(function(a,x){return a+x.a},0);
  var subM=sb.reduce(function(a,s){return a+mon(s)},0);
  var flagged=sb.filter(function(s){return verdict(s).flag});
  var saveM=flagged.reduce(function(a,s){return a+mon(s)},0);
  // repeat micro-spends
  var g={};micro.forEach(function(x){var k=x.n.toLowerCase();g[k]=g[k]||{n:x.n,c:0,s:0};g[k].c++;g[k].s+=x.a});
  var leaks=Object.keys(g).map(function(k){return g[k]}).filter(function(o){return o.c>=3}).sort(function(a,b){return b.s-a.s});
  var leakY=leaks.reduce(function(a,o){return a+o.s},0)*12;
  var pot=saveM*12;
  var h='<div class="hero-card"><p class="eyebrow">Your yearly savings opportunity</p><div class="hero">'+inr(pot)+'</div><p class="sub">potential savings if you cancel subscriptions that need a second look</p></div>';
  h+='<div class="row"><div class="stat"><b>'+inr(subM)+'</b><span>Subscriptions / month</span></div><div class="stat"><b>'+inr(subM*12)+'</b><span>Subscriptions / year</span></div></div>';
  h+='<div class="row"><div class="stat"><b>'+inr(microSum)+'</b><span>Micro spends this month (₹'+MICRO+' or less)</span></div><div class="stat"><b>'+inr(microSum*12)+'</b><span>If this continues for a year</span></div></div>';
  h+='<div class="section-title"><h2>Your spending insights</h2><span>Based on what you log</span></div><div class="panel">';
  var any=false;
  flagged.forEach(function(s){any=true;var v=verdict(s);h+='<div class="finding bad"><b>'+esc(s.n)+'</b>: '+v.t.toLowerCase()+'. Costs '+inr(mon(s))+' a month, '+inr(mon(s)*12)+' a year.</div>'});
  leaks.forEach(function(o){any=true;h+='<div class="finding"><b>'+esc(o.n)+'</b> bought '+o.c+' times this month for '+inr(o.s)+'. That is '+inr(o.s*12)+' a year.</div>'});
  var cats={};sb.forEach(function(s){cats[s.n.toLowerCase()]=1});
  if(!any)h+='<p class="empty">'+((ex.length||sb.length)?'No leaks found yet. Keep logging expenses and subscription usage.':'Add your subscriptions and daily small expenses. The diagnosis appears here.')+'</p>';
  if(leakY&&pot)h+='<p class="sub">Total leak found: '+inr(leakY+pot)+' per year.</p>';
  h+='</div>';
  $("dx").innerHTML=h;
}

function renderEx(){
  var l=ex.slice().reverse().slice(0,40);
  $("el").innerHTML=l.length?l.map(function(x){return '<div class="item"><div>'+esc(x.n)+'<small>'+esc(x.c)+' · '+new Date(x.d).toLocaleDateString("en-IN",{day:"numeric",month:"short"})+'</small></div><div><span class="amt">'+inr(x.a)+'</span> <button class="del" data-e="'+x.id+'" aria-label="Delete '+esc(x.n)+'">Delete</button></div></div>'}).join(""):'<p class="empty">No expenses yet. Log even the ₹10 ones.</p>';
}
function renderSb(){
  $("sl").innerHTML=sb.length?sb.map(function(s){var v=verdict(s);return '<div class="item"><div>'+esc(s.n)+'<small>'+inr(s.a)+(s.cy==="y"?' / year':' / month')+' · used '+s.u+'x a month</small><span class="tag '+v.c+'">'+v.t+'</span></div><button class="del" data-s="'+s.id+'" aria-label="Delete '+esc(s.n)+'">Delete</button></div>'}).join(""):'<p class="empty">No subscriptions yet. Add the ones you pay for every month or year.</p>';
}
function all(){renderDx();renderEx();renderSb()}

var noticeTimer;
function report(err){var n=$("notice");n.textContent=err&&err.message?err.message:"Something went wrong. Please try again.";n.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(function(){n.hidden=true},4500)}
function api(u,m,b){return fetch(u,{method:m||"GET",headers:{"Content-Type":"application/json"},body:b?JSON.stringify(b):undefined}).then(function(r){return r.json().then(function(data){if(!r.ok)throw Error(data.error||"Request failed");return data})})}
function refresh(){return Promise.all([api("/api/expenses"),api("/api/subs")]).then(function(r){ex=r[0];sb=r[1];all()})}
$("fe").addEventListener("submit",function(e){e.preventDefault();var a=parseFloat($("ea").value);if(!(a>0))return;var f=this;api("/api/expenses","POST",{n:$("en").value.trim(),a:a,c:$("ec").value}).then(function(){f.reset();return refresh()}).catch(report)});
$("fs").addEventListener("submit",function(e){e.preventDefault();var a=parseFloat($("sa").value),u=parseInt($("su").value,10);if(!(a>0)||isNaN(u))return;var f=this;api("/api/subs","POST",{n:$("sn").value.trim(),a:a,cy:$("sc").value,u:u}).then(function(){f.reset();return refresh()}).catch(report)});
document.addEventListener("click",function(e){
  var t=e.target,i;
  if(i=t.getAttribute("data-e")){api("/api/expenses/"+i,"DELETE").then(refresh).catch(report)}
  else if(i=t.getAttribute("data-s")){api("/api/subs/"+i,"DELETE").then(refresh).catch(report)}
  else if(t.getAttribute("role")==="tab"){document.querySelectorAll("nav button").forEach(function(b){b.setAttribute("aria-selected",b===t)});["dx","ex","sb"].forEach(function(s){$(s).hidden=s!==t.getAttribute("data-t")})}
});
refresh().catch(report);
