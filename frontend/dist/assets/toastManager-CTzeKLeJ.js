import{i as r}from"./index-CAlWI8pf.js";const l="toast-stack",p=3,m={info:"info",success:"success",warn:"warn",error:"error"};let t=null;function f(){return t&&document.body.contains(t)||(t=document.getElementById(l),t||(t=document.createElement("div"),t.id=l,t.className="toast-stack",t.setAttribute("role","status"),t.setAttribute("aria-live","polite"),document.body.appendChild(t))),t}function v(o){var e;for(;o.children.length>p;)(e=o.firstElementChild)==null||e.remove()}function g(o,e="info",n=3e3){const a=f(),i=m[e]?e:"info",s=document.createElement("div");s.className=`toast toast-${i}`,s.innerHTML=`
    <span class="toast-icon">${r(m[i],{size:18})}</span>
    <span class="toast-message"></span>
    <button class="toast-dismiss" aria-label="Dismiss">${r("close",{size:14})}</button>
    <span class="toast-progress"></span>
  `,s.querySelector(".toast-message").textContent=o,a.appendChild(s),v(a),requestAnimationFrame(()=>s.classList.add("toast-in"));const u=s.querySelector(".toast-progress");u.style.animationDuration=`${n}ms`;const c=()=>{s.classList.remove("toast-in"),s.classList.add("toast-out"),setTimeout(()=>s.remove(),220)},d=setTimeout(c,n);s.querySelector(".toast-dismiss").addEventListener("click",()=>{clearTimeout(d),c()})}export{g as showToast};
//# sourceMappingURL=toastManager-CTzeKLeJ.js.map
