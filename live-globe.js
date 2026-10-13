(function(){
const LIBS=['https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js','https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js'];
const load=src=>new Promise((res,rej)=>{if(document.querySelector('script[src="'+src+'"]')){const t=setInterval(()=>{if((src.includes('topojson')?window.topojson:window.d3)){clearInterval(t);res();}},30);return;}const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});
let dataP=null;
function getData(){
  if(!dataP) dataP=(async()=>{await load(LIBS[0]);await load(LIBS[1]);
    const topo=await (await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-50m.json')).json();
    const land=topojson.feature(topo,topo.objects.land);
    const W=2048,H=1024,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
    const pr=d3.geoEquirectangular().scale(W/(2*Math.PI)).translate([W/2,H/2]);
    x.fillStyle='#000';x.beginPath();d3.geoPath(pr,x)(land);x.fill();
    const px=x.getImageData(0,0,W,H).data;
    const isLand=(lon,lat)=>{const i=Math.floor((lon+180)/360*W)%W,j=Math.min(H-1,Math.max(0,Math.floor((90-lat)/180*H)));return px[(j*W+i)*4+3]>100;};
    const step=1.15,pts=[];
    for(let lat=-84;lat<=84;lat+=step*0.866){const row=Math.round((lat+84)/(step*0.866));const dl=step/Math.cos(lat*Math.PI/180);const off=(row%2)*dl/2;
      for(let lon=-180+off;lon<180;lon+=dl){if(isLand(lon,lat))pts.push([lon,lat]);}}
    return {pts,step};
  })();
  return dataP;
}
const CITIES=[{n:'תל אביב',c:[34.78,32.08],main:true},{n:'חיפה',c:[34.99,32.79]},{n:'ירושלים',c:[35.21,31.77]},{n:'באר שבע',c:[34.79,31.25]}];
class LiveGlobe extends HTMLElement{
  static get observedAttributes(){return ['labels'];}
  constructor(){super();this.rot=[-35,-27];this.k=1;this._labels=false;
    const r=this.attachShadow({mode:'open'});
    r.innerHTML=`<style>
:host{display:block;position:relative;width:100%;height:100%;overflow:hidden;touch-action:none}
canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab}canvas.drag{cursor:grabbing}
.pin{position:absolute;transform:translate(-50%,-100%);pointer-events:none}
.dot{position:absolute;width:8px;height:8px;border-radius:50%;background:#7fd0f2;box-shadow:0 0 0 4px rgba(127,208,242,.3);transform:translate(-50%,-50%);animation:p 2.2s ease-in-out infinite;pointer-events:none}
@keyframes p{0%,100%{box-shadow:0 0 0 3px rgba(127,208,242,.35)}50%{box-shadow:0 0 0 8px rgba(127,208,242,0)}}
.lab{position:absolute;transform:translate(-50%,-150%);white-space:nowrap;font:600 11px Assistant,system-ui,sans-serif;background:#fff;color:#303030;padding:1px 6px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.15);pointer-events:none}
.zoom{position:absolute;left:16px;bottom:44px;display:flex;flex-direction:column;gap:6px}
.zoom button{width:28px;height:28px;border:none;border-radius:50%;background:#ebebeb;color:#303030;font:600 18px/1 system-ui;cursor:pointer;display:grid;place-items:center}
.zoom button:hover{background:#e3e3e3}.zoom button:disabled{color:#b5b5b5;background:#f3f3f3;cursor:default}
.load{position:absolute;inset:0;display:grid;place-items:center;font:14px Assistant,system-ui;color:#8a8a8a}
</style><canvas></canvas><div class="ov"></div><div class="zoom"><button class="in" aria-label="הגדלה">+</button><button class="out" aria-label="הקטנה">−</button></div><div class="load">טוען מפה…</div>`;
    this.cv=r.querySelector('canvas');this.ov=r.querySelector('.ov');
    r.querySelector('.in').onclick=()=>this.zoom(1.35);r.querySelector('.out').onclick=()=>this.zoom(1/1.35);
    this.bIn=r.querySelector('.in');this.bOut=r.querySelector('.out');
  }
  set labels(v){this._labels=!!v&&v!=='false';this.draw();}
  get labels(){return this._labels;}
  attributeChangedCallback(n,o,v){if(n==='labels')this.labels=v;}
  zoom(f){this.k=Math.max(1,Math.min(3.5,this.k*f));this.bIn.disabled=this.k>=3.5;this.bOut.disabled=this.k<=1;this.draw();}
  connectedCallback(){
    this.ro=new ResizeObserver(()=>this.draw());this.ro.observe(this);
    let p=null;
    this.cv.addEventListener('pointerdown',e=>{p=[e.clientX,e.clientY];this.cv.setPointerCapture(e.pointerId);this.cv.classList.add('drag');});
    this.cv.addEventListener('pointermove',e=>{if(!p)return;const dx=e.clientX-p[0],dy=e.clientY-p[1];p=[e.clientX,e.clientY];
      this.rot=[this.rot[0]+dx*.3/this.k,Math.max(-80,Math.min(80,this.rot[1]-dy*.3/this.k))];this.draw();});
    const up=()=>{p=null;this.cv.classList.remove('drag');};this.cv.addEventListener('pointerup',up);this.cv.addEventListener('pointercancel',up);
    this.cv.addEventListener('wheel',e=>{e.preventDefault();this.zoom(e.deltaY<0?1.12:1/1.12);},{passive:false});
    getData().then(d=>{this.data=d;this.shadowRoot.querySelector('.load').remove();this.draw();}).catch(()=>{this.shadowRoot.querySelector('.load').textContent='המפה לא נטענה';});
    this.bOut.disabled=true;
  }
  disconnectedCallback(){this.ro&&this.ro.disconnect();}
  draw(){
    if(this._raf)return;this._raf=requestAnimationFrame(()=>{this._raf=0;this.render();});
  }
  render(){
    const w=this.clientWidth,h=this.clientHeight;if(!w||!h)return;const dpr=Math.min(2,window.devicePixelRatio||1);
    const cv=this.cv;if(cv.width!==w*dpr||cv.height!==h*dpr){cv.width=w*dpr;cv.height=h*dpr;}
    const x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);
    const R=Math.min(w,h)*0.43*this.k,cx=w/2,cy=h/2;
    x.save();x.beginPath();x.arc(cx,cy,R,0,7);x.shadowColor='rgba(120,230,190,.6)';x.shadowBlur=R*.25;x.shadowOffsetX=-R*.08*dpr;x.shadowOffsetY=-R*.08*dpr;x.fillStyle='#dbeaf3';x.fill();x.restore();
    x.save();x.beginPath();x.arc(cx,cy,R,0,7);x.shadowColor='rgba(150,150,255,.5)';x.shadowBlur=R*.25;x.shadowOffsetX=R*.08*dpr;x.shadowOffsetY=R*.08*dpr;x.fillStyle='#dbeaf3';x.fill();x.restore();
    const g=x.createRadialGradient(cx-R*.3,cy-R*.4,R*.1,cx,cy,R);g.addColorStop(0,'#eef7f6');g.addColorStop(.6,'#dbeaf3');g.addColorStop(1,'#c3def4');
    x.beginPath();x.arc(cx,cy,R,0,7);x.fillStyle=g;x.fill();
    if(!this.data||!window.d3){this.ov.innerHTML='';return;}
    const pr=d3.geoOrthographic().scale(R).translate([cx,cy]).rotate(this.rot).clipAngle(90);
    const ctr=[-this.rot[0],-this.rot[1]];const hs=R*(this.data.step*Math.PI/180)*0.56;
    x.save();x.beginPath();x.arc(cx,cy,R,0,7);x.clip();
    const top=cy-R,span=2*R;
    for(const pt of this.data.pts){const dd=d3.geoDistance(pt,ctr);if(dd>1.56)continue;const q=pr(pt);if(!q)continue;
      const cs=Math.cos(dd),t=(q[1]-top)/span;
      x.fillStyle=`rgb(${Math.round(70+t*55)},${Math.round(214-t*30)},${Math.round(196+t*44)})`;
      const a=Math.atan2(q[1]-cy,q[0]-cx);x.setTransform(dpr,0,0,dpr,0,0);x.translate(q[0],q[1]);x.rotate(a);x.scale(Math.max(.12,cs),1);
      x.beginPath();for(let i=0;i<6;i++){const an=Math.PI/6+i*Math.PI/3;const px=Math.cos(an)*hs,py=Math.sin(an)*hs;i?x.lineTo(px,py):x.moveTo(px,py);}x.closePath();x.fill();}
    x.restore();x.setTransform(dpr,0,0,dpr,0,0);
    let html='';
    for(const c of CITIES){if(d3.geoDistance(c.c,ctr)>1.5)continue;const q=pr(c.c);if(!q)continue;
      if(c.main)html+=`<svg class="pin" style="left:${q[0]}px;top:${q[1]}px" width="18" height="24" viewBox="0 0 18 24"><path d="M9 23s7-7.6 7-13A7 7 0 0 0 2 10c0 5.4 7 13 7 13z" fill="#6b3fe0"/><circle cx="9" cy="9.5" r="3" fill="#cdbdff"/></svg>`;
      else html+=`<span class="dot" style="left:${q[0]}px;top:${q[1]}px"></span>`;
      if(this._labels)html+=`<span class="lab" style="left:${q[0]}px;top:${q[1]-(c.main?14:0)}px">${c.n}</span>`;}
    this.ov.innerHTML=html;
  }
}
if(!customElements.get('live-globe'))customElements.define('live-globe',LiveGlobe);
})();
