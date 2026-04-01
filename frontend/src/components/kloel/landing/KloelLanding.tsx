// @ts-nocheck
'use client';
import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { THANOS_ICONS } from "./thanos-icons";

const F = "var(--font-sora), 'Sora', sans-serif";
const M = "var(--font-jetbrains), 'JetBrains Mono', monospace";
const E = "#E85D30";
const V = "#0A0A0C";
const GC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&!?<>{}|/\\~";
const rc = () => GC[Math.floor(Math.random() * GC.length)];
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

function Heartbeat() {
  const cv = useRef<any>(null), raf = useRef<any>(0), wp = useRef<any>(0), h = useRef<any>(null), wi = useRef<any>(0), si = useRef<any>(0), wv = useRef<any>([]);
  useEffect(() => {
    const el = cv.current; if (!el) return;
    const ctx = el.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio||1;
    function gen(){const pk=(22+20*Math.random()),dp=(6+14*Math.random()),tw=(3+6*Math.random()),pa=2+4*Math.random(),bl=35+Math.floor(25*Math.random()),rl=4+Math.floor(4*Math.random()),td=20+Math.floor(8*Math.random()),tl=12+Math.floor(6*Math.random()),tot=bl+6+2*rl+8+tl+15,s=[];for(let i=0;i<tot;i++){if(i<bl)s.push((Math.random()-.5)*.3);else if(i<bl+3)s.push(-((i-bl)/3)*pa);else if(i<bl+3+rl)s.push(-pa-((i-bl-3)/rl)*(pk-pa));else if(i<bl+3+2*rl)s.push(-pk+((i-bl-3-rl)/rl)*(pk+dp));else if(i<bl+3+2*rl+8)s.push(dp-((i-bl-3-2*rl)/8)*dp);else{const p=i-(bl+3+2*rl+8);if(p>=td&&p<td+tl){const t2=(p-td)/tl;s.push(-(t2<.5?t2/.5:1-(t2-.5)/.5)*tw)}else s.push((Math.random()-.5)*.3)}}return s;}
    for(let i=0;i<30;i++)wv.current.push(gen());
    function draw(){const w=el.offsetWidth,ht=el.offsetHeight;el.width=w*dpr;el.height=ht*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,ht);const tw2=Math.min(Math.floor(.7*w),600),ox=Math.floor((w-tw2)/2),my=ht/2+2;if(!h.current||h.current.length!==tw2){h.current=new Float32Array(tw2);wp.current=0}for(let n=0;n<2;n++){const wave=wv.current[wi.current%wv.current.length],idx=Math.floor(si.current);h.current[wp.current]=idx<wave.length?wave[idx]:(Math.random()-.5)*.3;si.current++;if(si.current>=wave.length){si.current=0;wi.current++}wp.current=(wp.current+1)%tw2}for(let g=1;g<=25;g++)h.current[(wp.current+g)%tw2]=NaN;function tr(f2,t2){let p=false;for(let x=f2;x<t2;x++){const v2=h.current[x];if(isNaN(v2)){p=false;continue}if(p)ctx.lineTo(ox+x,my+v2);else{ctx.moveTo(ox+x,my+v2);p=true}}}ctx.beginPath();tr(0,tw2);const gr=ctx.createLinearGradient(ox,0,ox+tw2,0);gr.addColorStop(0,"rgba(232,93,48,0)");gr.addColorStop(.05,"rgba(232,93,48,0.8)");gr.addColorStop(.12,"rgba(232,93,48,1)");gr.addColorStop(.88,"rgba(232,93,48,1)");gr.addColorStop(.95,"rgba(232,93,48,0.8)");gr.addColorStop(1,"rgba(232,93,48,0)");ctx.strokeStyle=gr;ctx.lineWidth=2;ctx.lineJoin="bevel";ctx.stroke();ctx.save();ctx.globalAlpha=.08;ctx.filter="blur(5px)";ctx.lineWidth=8;ctx.strokeStyle=E;ctx.beginPath();tr(0,tw2);ctx.stroke();ctx.restore();const cx2=ox+wp.current,cv2=h.current[wp.current];if(!isNaN(cv2)){const cy=my+cv2;ctx.beginPath();ctx.arc(cx2,cy,3,0,2*Math.PI);ctx.fillStyle=E;ctx.fill();const rg=ctx.createRadialGradient(cx2,cy,0,cx2,cy,10);rg.addColorStop(0,"rgba(232,93,48,0.4)");rg.addColorStop(1,"rgba(232,93,48,0)");ctx.beginPath();ctx.arc(cx2,cy,10,0,2*Math.PI);ctx.fillStyle=rg;ctx.fill()}raf.current=requestAnimationFrame(draw);}draw();return()=>{if(raf.current)cancelAnimationFrame(raf.current)};
  },[]);
  return <canvas ref={cv} style={{width:"100%",height:90,display:"block"}}/>;
}

function HeroLoop() {
  const L1 = "O Marketing Digital";
  const DEATH = " acabou.";
  const L2 = "O Marketing Artificial começou.";
  const [vis, setVis] = useState({ text: "", strike: 0, suffix: "", phase: "idle" });
  const [gx, setGx] = useState({ on: false, text: "", shk: [0,0], chr: 0, slices: [], flash: false });
  const [resurrected, setResurrected] = useState(false);
  const noiseRef = useRef<any>(null);
  const gxRef = useRef<any>(false);
  const m = useRef<any>(true);

  useEffect(() => { gxRef.current = gx.on; }, [gx.on]);

  useEffect(() => {
    const cv = noiseRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); cv.width = 600; cv.height = 120;
    let raf2;
    const drawN = () => {
      if (!gxRef.current) { ctx.clearRect(0,0,600,120); raf2 = requestAnimationFrame(drawN); return; }
      const img = ctx.createImageData(600,120);
      for(let i=0;i<img.data.length;i+=4){const v2=Math.random()*255;img.data[i]=v2;img.data[i+1]=v2;img.data[i+2]=v2;img.data[i+3]=Math.random()*30;}
      ctx.putImageData(img,0,0);
      for(let y=0;y<120;y+=3){ctx.fillStyle=`rgba(0,0,0,${.1+Math.random()*.06})`;ctx.fillRect(0,y,600,1);}
      raf2=requestAnimationFrame(drawN);
    };
    raf2=requestAnimationFrame(drawN);
    return () => { cancelAnimationFrame(raf2); };
  }, []);

  const scramble = (src, chaos) => src.split("").map(c => c===" "?" ":Math.random()<chaos?rc():c).join("");
  const mkSlices = () => Array.from({length:5},()=>({top:Math.random()*100,h:2+Math.random()*14,off:(Math.random()-.5)*28}));

  useEffect(() => {
    const run = async () => {
      while (m.current) {
        setResurrected(false);
        setGx({on:false,text:"",shk:[0,0],chr:0,slices:[],flash:false});
        // TYPE
        for (let i=0;i<=L1.length;i++){if(!m.current)return;setVis({text:L1.slice(0,i),strike:0,suffix:"",phase:"typing"});await wait(L1[i]===" "?45:55+Math.random()*35);}
        await wait(450);
        // STRIKE
        setVis(d=>({...d,phase:"strike"}));
        for(let i=0;i<=100;i+=3){if(!m.current)return;setVis(d=>({...d,strike:i}));await wait(7);}
        await wait(250);
        // MORREU
        for(let i=0;i<=DEATH.length;i++){if(!m.current)return;setVis(d=>({...d,suffix:DEATH.slice(0,i),phase:"death"}));await wait(75+Math.random()*35);}
        await wait(700);
        // GLITCH BUILD
        const full=L1+DEATH;
        for(let i=0;i<8;i++){if(!m.current)return;setGx({on:true,text:scramble(full,i*.06),shk:[(Math.random()-.5)*i*.6,(Math.random()-.5)*i*.4],chr:i*1.8,slices:i>4?mkSlices():[],flash:false});await wait(45);}
        // CHAOS
        for(let i=0;i<16;i++){if(!m.current)return;setGx({on:true,text:scramble(full,Math.min(1,.3+i*.05)),shk:[(Math.random()-.5)*14,(Math.random()-.5)*7],chr:8+Math.random()*7,slices:mkSlices(),flash:i===8});await wait(38);}
        // FLASH
        setGx(g=>({...g,flash:true,chr:20}));await wait(50);
        // RESOLVE
        setVis(d=>({...d,phase:"hidden"}));
        for(let i=0;i<14;i++){if(!m.current)return;const p=i/14;const mixed=L2.split("").map((c2,ci)=>c2===" "?" ":Math.random()<p?c2:rc()).join("");setGx({on:true,text:mixed,shk:[(Math.random()-.5)*(7-p*7),(Math.random()-.5)*(3-p*3)],chr:(1-p)*10,slices:p>.6?[]:mkSlices(),flash:false});await wait(38);}
        // CLEAN
        setGx({on:false,text:"",shk:[0,0],chr:0,slices:[],flash:false});
        setResurrected(true);
        await wait(3200);
        // GLITCH BACK
        for(let i=0;i<6;i++){if(!m.current)return;setGx({on:true,text:scramble(L2,i*.14),shk:[(Math.random()-.5)*i*1.8,(Math.random()-.5)*i],chr:i*2.5,slices:i>3?mkSlices():[],flash:false});await wait(45);}
        setGx(g=>({...g,flash:true}));await wait(40);
        setResurrected(false);setGx({on:false,text:"",shk:[0,0],chr:0,slices:[],flash:false});
        await wait(250);
      }
    };
    run();
    return()=>{m.current=false};
  }, []);

  const ts = { fontSize:"clamp(26px,5vw,50px)", fontWeight:800, fontFamily:F, letterSpacing:"-.03em", lineHeight:1.2, whiteSpace:"nowrap" };
  return (
    <div style={{ position:"relative", textAlign:"center", minHeight:100, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <canvas ref={noiseRef} style={{ position:"absolute", inset:-20, width:"calc(100% + 40px)", height:"calc(100% + 40px)", pointerEvents:"none", zIndex:3, opacity: gx.on ? 0.55 : 0, mixBlendMode:"screen" }}/>
      {gx.flash && <div style={{ position:"absolute", inset:-40, background:E, zIndex:4, opacity:.25, pointerEvents:"none" }}/>}
      <div style={{ transform:`translate(${gx.shk[0]}px,${gx.shk[1]}px)`, position:"relative", zIndex:2 }}>
        {gx.chr>0 && <>
          <div style={{ ...ts, position:"absolute", left:-gx.chr, top:0, color:"#FF000055", zIndex:1 }}>{gx.text}</div>
          <div style={{ ...ts, position:"absolute", left:gx.chr, top:0, color:"#0000FF45", zIndex:1 }}>{gx.text}</div>
        </>}
        {gx.slices.map((s,i)=><div key={i} style={{ position:"absolute", left:s.off, top:`${s.top}%`, height:s.h, width:"100%", overflow:"hidden", zIndex:5 }}><div style={{ ...ts, color:"#E0DDD8", transform:`translateY(-${s.top}%)` }}>{gx.text}</div></div>)}
        {vis.phase!=="hidden" && !resurrected && (
          <div style={{ position:"relative", display:"inline" }}>
            <span style={{ ...ts, color:"#E0DDD8" }}>{vis.text}</span>
            <span style={{ ...ts, color:"#E0DDD8" }}>{vis.suffix}</span>
            {vis.phase==="typing" && <span style={{ ...ts, color:E, animation:"blink 1s ease infinite", marginLeft:2 }}>|</span>}
          </div>
        )}
        {gx.on && vis.phase==="hidden" && !resurrected && <span style={{ ...ts, color:"#E0DDD8" }}>{gx.text}</span>}
        {gx.on && vis.phase!=="hidden" && <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:6 }}><span style={{ ...ts, color:"#E0DDD8" }}>{gx.text}</span></div>}
        {resurrected && !gx.on && <span style={{ ...ts, color:E, transition:"opacity .4s" }}>O Marketing Artificial começou.</span>}
      </div>
    </div>
  );
}

function MultiChannel() {
  const [msgs, setMsgs] = useState({wa:[],ig:[],em:[]});
  const ref = useRef<any>(null);
  const [go, setGo] = useState(false);
  const flow = [
    {ch:"wa",f:"lead",n:"Marina C.",text:"Vi o anuncio, quanto custa?",t:"09:02"},
    {ch:"ig",f:"lead",n:"Pedro A.",text:"Amei o produto! Como compro?",t:"09:03"},
    {ch:"wa",f:"ai",text:"Ola Marina! R$497 a vista ou 12x. Posso enviar o link?",t:"09:02"},
    {ch:"em",f:"ai",n:"Email",text:"Assunto: Julia, seu bonus expira hoje — 30% OFF",t:"09:04"},
    {ch:"ig",f:"ai",text:"Ola Pedro! Acesso vitalício por R$497. Cupom INSTA20 = 20% OFF!",t:"09:03"},
    {ch:"wa",f:"lead",n:"Marina C.",text:"Quero sim!",t:"09:05"},
    {ch:"wa",f:"ai",text:"Link: pay.kloel.com/ck/abc — Pix, cartão ou boleto.",t:"09:05"},
    {ch:"ig",f:"lead",n:"Pedro A.",text:"Me manda o link!",t:"09:06"},
    {ch:"em",f:"ai",n:"Evento",text:"Julia clicou no link — checkout aberto",t:"09:06"},
    {ch:"ig",f:"ai",text:"pay.kloel.com/ck/pedro — Cupom INSTA20 já aplicado!",t:"09:06"},
    {ch:"wa",f:"ok",text:"Pagamento confirmado — R$397 via Pix",t:"09:08"},
    {ch:"ig",f:"ok",text:"Pagamento confirmado — R$397,60 via cartão",t:"09:09"},
    {ch:"em",f:"ok",text:"Pagamento confirmado — R$347,90 via Pix",t:"09:10"},
  ];
  useEffect(()=>{const el=ref.current;if(!el)return;const o=new IntersectionObserver(([e])=>{if(e.isIntersecting){setGo(true);o.disconnect()}},{threshold:.12});o.observe(el);return()=>o.disconnect()},[]);
  useEffect(()=>{if(!go)return;let c=false;const run=async()=>{for(let i=0;i<flow.length;i++){if(c)return;await wait(flow[i].f==="ai"?1100:flow[i].f==="ok"?1400:650);if(c)return;const msg=flow[i];setMsgs(p=>({...p,[msg.ch]:[...p[msg.ch],msg]}));}};run();return()=>{c=true}},[go]);
  const colors={wa:"#25D366",ig:"#E1306C",em:E};
  const names={wa:"WhatsApp",ig:"Instagram DM",em:"Email"};
  const Panel=({ch})=>(
    <div style={{background:"#111113",border:"1px solid #222226",borderRadius:6,overflow:"hidden",height:"100%"}}>
      <div style={{padding:"7px 11px",borderBottom:"1px solid #222226",display:"flex",alignItems:"center",gap:5}}>
        <div style={{width:5,height:5,borderRadius:3,background:colors[ch],boxShadow:`0 0 6px ${colors[ch]}50`}}/>
        <span style={{fontSize:10,fontWeight:600,color:colors[ch],fontFamily:M}}>{names[ch]}</span>
        <span style={{marginLeft:"auto",fontSize:8,color:"#3A3A3F",fontFamily:M}}>AO VIVO</span>
      </div>
      <div style={{padding:8,minHeight:190,display:"flex",flexDirection:"column",gap:4}}>
        {(msgs[ch]||[]).map((msg,i)=>msg.f==="ok"?(
          <div key={i} style={{textAlign:"center",padding:"5px 0",animation:"fm .3s ease both"}}><span style={{background:"rgba(16,185,129,.1)",border:"1px solid rgba(16,185,129,.2)",borderRadius:4,padding:"2px 8px",fontSize:9,fontWeight:600,color:"#10B981",fontFamily:M}}>{msg.text}</span></div>
        ):(
          <div key={i} style={{alignSelf:msg.f==="ai"?"flex-end":"flex-start",maxWidth:"88%",animation:"fm .25s ease both"}}>
            {msg.f==="ai"&&<div style={{fontSize:7,color:E,fontWeight:700,fontFamily:M,letterSpacing:".08em",marginBottom:1}}>KLOEL IA</div>}
            {msg.f==="lead"&&msg.n&&<div style={{fontSize:7,color:"#6E6E73",fontWeight:600,fontFamily:F,marginBottom:1}}>{msg.n}</div>}
            <div style={{background:msg.f==="ai"?"#19191C":`${colors[ch]}12`,border:`1px solid ${msg.f==="ai"?"#222226":colors[ch]+"25"}`,borderRadius:4,padding:"4px 7px",fontSize:10.5,color:"#E0DDD8",lineHeight:1.4,fontFamily:F}}>{msg.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div ref={ref}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}} className="grid3"><Panel ch="wa"/><Panel ch="ig"/><Panel ch="em"/></div>
      <div style={{textAlign:"center",marginTop:12}}><span style={{fontFamily:M,fontSize:9,color:"#3A3A3F",letterSpacing:".12em"}}>3 CANAIS · 3 VENDAS · ZERO INTERVENÇÃO HUMANA</span></div>
    </div>
  );
}

function Reveal({children,delay=0}:{children:any,delay?:number}){const ref=useRef<any>(null);const[v,setV]=useState(false);useEffect(()=>{const el=ref.current;if(!el)return;const o=new IntersectionObserver(([e])=>{if(e.isIntersecting){setV(true);o.disconnect()}},{threshold:.1});o.observe(el);return()=>o.disconnect()},[]);return (<div ref={ref} style={{opacity:v?1:0,transform:v?"translateY(0)":"translateY(28px)",transition:`opacity .8s ease ${delay}ms, transform .8s ease ${delay}ms`}}>{v?children:<div style={{minHeight:50}}/>}</div>);}

function LivePulse() {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
      <div style={{width:6,height:6,borderRadius:3,background:"#10B981",animation:"pulse 2s ease infinite"}} />
      <span style={{fontFamily:M,fontSize:11,color:"#6E6E73"}}>
        Plataforma <span style={{color:"#10B981",fontWeight:600}}>operacional</span> — vendas automáticas 24/7
      </span>
    </div>
  );
}

function thanosLoadImages(icons) {
  return Promise.all(icons.map(ic => new Promise(resolve => {
    const img = new Image(); img.onload = () => resolve({...ic,img}); img.onerror = () => resolve(null); img.src = ic.d;
  }))).then(r => r.filter(Boolean));
}

function ThanosOmniSales(){
  const[msgs,setMsgs]=useState<any>({wa:[],ig:[],fb:[],em:[],sms:[],tt:[]});
  const ref=useRef<any>(null);const[go,setGo]=useState(false);
  useEffect(()=>{const el=ref.current;if(!el)return;const o=new IntersectionObserver(([e])=>{if(e.isIntersecting){setGo(true);o.disconnect()}},{threshold:.1});o.observe(el);return()=>o.disconnect()},[]);
  const flow=[{ch:"wa",f:"l",t:"Oi, vi o anúncio!"},{ch:"ig",f:"l",t:"Amei o produto!"},{ch:"wa",f:"a",t:"Olá! R$497 ou 12x."},{ch:"fb",f:"l",t:"Tem disponível?"},{ch:"em",f:"a",t:"Julia, bônus expira — 30% OFF"},{ch:"ig",f:"a",t:"Cupom INSTA20 = 20% OFF!"},{ch:"sms",f:"a",t:"Carrinho aberto!"},{ch:"tt",f:"l",t:"Vi no TikTok!"},{ch:"fb",f:"a",t:"R$497, acesso vitalício."},{ch:"wa",f:"l",t:"Quero!"},{ch:"tt",f:"a",t:"Últimas vagas!"},{ch:"wa",f:"a",t:"pay.kloel.com/ck/abc"},{ch:"ig",f:"l",t:"Me manda!"},{ch:"ig",f:"a",t:"pay.kloel.com/ck/pedro"},{ch:"wa",f:"$",t:"R$397 Pix"},{ch:"em",f:"$",t:"R$347 Pix"},{ch:"ig",f:"$",t:"R$397 cartão"},{ch:"fb",f:"$",t:"R$497 Pix"},{ch:"sms",f:"$",t:"R$297 recuperado"},{ch:"tt",f:"$",t:"R$397 Pix"}];
  useEffect(()=>{if(!go)return;let c=false;const run=async()=>{for(const msg of flow){if(c)return;await wait(msg.f==="$"?900:msg.f==="a"?600:400);if(c)return;setMsgs(p=>({...p,[msg.ch]:[...p[msg.ch],msg]}))}};run();return()=>{c=true}},[go]);
  const ch={wa:{n:"WhatsApp",c:"#25D366"},ig:{n:"Instagram",c:"#E1306C"},fb:{n:"Messenger",c:"#0084FF"},em:{n:"Email",c:E},sms:{n:"SMS",c:"#10B981"},tt:{n:"TikTok",c:"#FF0050"}};
  return (<div ref={ref} style={{animation:"sIn .8s ease both"}}><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}} className="gridOmni">{Object.keys(ch).map(k=>(<div key={k} style={{background:"#0D0D10",borderRadius:6,overflow:"hidden",border:"1px solid #19191C"}}><div style={{padding:"8px 12px",borderBottom:"1px solid #19191C",display:"flex",alignItems:"center",gap:6}}><div style={{width:5,height:5,borderRadius:3,background:ch[k].c}}/><span style={{fontSize:10,fontWeight:600,color:ch[k].c,fontFamily:M}}>{ch[k].n}</span></div><div style={{padding:"8px 10px",display:"flex",flexDirection:"column",gap:4,minHeight:85}}>{(msgs[k]||[]).slice(-3).map((m,i)=>m.f==="$"?(<div key={i} style={{textAlign:"center",animation:"sIn .2s ease both"}}><span style={{fontSize:9,fontWeight:700,color:"#10B981",fontFamily:M}}>{m.t}</span></div>):(<div key={i} style={{alignSelf:m.f==="a"?"flex-end":"flex-start",maxWidth:"85%",animation:"sIn .2s ease both"}}><div style={{background:m.f==="a"?"#19191C":`${ch[k].c}12`,borderRadius:4,padding:"4px 8px",fontSize:10,color:"#E0DDD8",lineHeight:1.4,fontFamily:F}}>{m.t}</div></div>))}</div></div>))}</div></div>);
}

function ThanosSection(){
  const cvRef=useRef<any>(null),secRef=useRef<any>(null),rafRef=useRef<any>(0),toRef=useRef<any>(0);
  const[showReveal,setShowReveal]=useState(false);
  const[showSales,setShowSales]=useState(false);
  const[started,setStarted]=useState(false);
  const[imgsLoaded,setImgsLoaded]=useState<any>(null);

  useEffect(()=>{thanosLoadImages(THANOS_ICONS).then(setImgsLoaded)},[]);
  useEffect(()=>{const el=secRef.current;if(!el)return;const o=new IntersectionObserver(([e])=>{if(e.isIntersecting){setStarted(true);o.disconnect()}},{threshold:.15});o.observe(el);return()=>o.disconnect()},[]);

  useEffect(()=>{
    if(!started||!imgsLoaded||!imgsLoaded.length)return;
    const cv=cvRef.current;if(!cv)return;
    const ctx=cv.getContext("2d");if(!ctx)return;
    const dpr=window.devicePixelRatio||1;
    let alive=true;
    const runCycle=async()=>{
      while(alive){
        setShowReveal(false);setShowSales(false);
        const W=cv.offsetWidth,H=cv.offsetHeight;
        cv.width=W*dpr;cv.height=H*dpr;
        ctx.setTransform(dpr,0,0,dpr,0,0);
        cv.style.opacity="1";ctx.clearRect(0,0,W,H);
        // Text ABOVE
        const cy=H/2;
        ctx.font=`800 ${Math.min(38,W*.045)}px Sora,sans-serif`;
        ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillStyle="rgba(224,221,216,0.75)";
        ctx.fillText("Elas não escalam por você.",W/2,cy-130);
        // Icons CENTERED
        const isMobile=W<500;
        const iconSize=isMobile?56:68,cols=isMobile?2:5,rows=isMobile?5:2,gapX=iconSize*(isMobile?2.4:2.2),gapY=iconSize*(isMobile?1.4:1.8);
        const totalW2=(cols-1)*gapX,ox=(W-totalW2)/2,oy=cy-10;
        ctx.globalAlpha=0.4;
        imgsLoaded.forEach((ic,i)=>{const col=i%cols,row=Math.floor(i/cols);ctx.drawImage(ic.img,ox+col*gapX-iconSize/2,oy+row*gapY-iconSize/2,iconSize,iconSize)});
        ctx.globalAlpha=1;
        await wait(3000);if(!alive)return;
        // Capture — sample every 4px for performance
        const imgData=ctx.getImageData(0,0,W*dpr,H*dpr);const d=imgData.data;const particles=[];
        // Compute icon centers for radial decomposition
        const IC=[];imgsLoaded.forEach((ic,idx)=>{const col=idx%cols,row=Math.floor(idx/cols);IC.push({x:ox+col*gapX,y:oy+row*gapY,idx})});
        const gcx=W/2,gcy=cy;const PHI=1.618033988749895;
        for(let py=0;py<H*dpr;py+=2){for(let px=0;px<W*dpr;px+=3){const i=(py*W*dpr+px)*4;if(d[i+3]>10){
          const x=px/dpr,y=py/dpr;
          let nd=1e9,nc=IC[0];for(const c of IC){const dd=(x-c.x)**2+(y-c.y)**2;if(dd<nd){nd=dd;nc=c}}
          nd=Math.sqrt(nd);
          // Random angle — pure entropy. Slight bias outward from icon center.
          const ang=Math.random()*6.28;
          const spd=0.4+nd*0.015+Math.random()*0.6;
          const vx0=Math.cos(ang)*spd;
          const vy0=Math.sin(ang)*spd;
          // Stagger: icon golden phase + center-out per icon
          const iconDist=Math.sqrt((nc.x-gcx)**2+(nc.y-gcy)**2);
          const goldenPhase=((nc.idx*PHI)%1);
          const delay=Math.max(0,Math.round(goldenPhase*40+Math.random()*25));
          particles.push({x,y,vx:vx0*0.01,vy:vy0*0.01,dvx:vx0,dvy:vy0,
            size:0.3+Math.random()*1.1,r:d[i],g:d[i+1],b:d[i+2],a:d[i+3]/255,
            tr:125+Math.random()*35,tg:85+Math.random()*25,tb:50+Math.random()*20,
            life:1,decay:0.004+nd*0.00004+Math.random()*0.002,
            shrink:0.996+Math.random()*0.002,delay,ramp:0})}}}
        // Decomposition — golden spiral activation, radial-tangential trajectories, deterministic
        await new Promise(resolve=>{let t=0;const animate=()=>{if(!alive){resolve();return}ctx.clearRect(0,0,W,H);t++;let ac=0;
          for(let i=0;i<particles.length;i++){const p=particles[i];
            if(t<p.delay){if(p.life>0){ac++;ctx.globalAlpha=p.a;ctx.fillStyle=`rgb(${p.r|0},${p.g|0},${p.b|0})`;ctx.fillRect(p.x,p.y,p.size,p.size)}continue}
            p.ramp=Math.min(1,(t-p.delay)/30);
            p.vx+=p.dvx*0.007*p.ramp;p.vy+=p.dvy*0.007*p.ramp;
            p.vy+=0.03*p.ramp;// gravity
            p.vx*=0.993;p.vy*=0.993;
            p.x+=p.vx;p.y+=p.vy;
            const age=(t-p.delay)/60;const ca=Math.min(1,age*3);
            p.r+=(p.tr-p.r)*0.03*ca;p.g+=(p.tg-p.g)*0.03*ca;p.b+=(p.tb-p.b)*0.03*ca;
            p.size*=p.shrink;p.life-=p.decay;
            if(p.life>0&&p.size>0.08){ac++;ctx.globalAlpha=Math.max(0,p.life*p.a);ctx.fillStyle=`rgb(${p.r|0},${p.g|0},${p.b|0})`;ctx.fillRect(p.x,p.y,p.size,p.size)}}
          ctx.globalAlpha=1;if(ac>0){rafRef.current=requestAnimationFrame(animate)}else{ctx.clearRect(0,0,W,H);cv.style.opacity="0";resolve()}};rafRef.current=requestAnimationFrame(animate)});
        if(!alive)return;await wait(500);setShowReveal(true);await wait(800);setShowSales(true);await wait(8000);if(!alive)return;setShowReveal(false);setShowSales(false);await wait(400)}};
    runCycle();return()=>{alive=false;cancelAnimationFrame(rafRef.current);clearTimeout(toRef.current)};
  },[started,imgsLoaded]);

  return (
    <div ref={secRef} style={{position:"relative"}}>
      <section style={{padding:"0 24px",maxWidth:860,margin:"0 auto",position:"relative",minHeight:"80vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <canvas ref={cvRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",transition:"opacity .8s ease"}}/>
        {showReveal&&(<div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",padding:"0 24px",animation:"sIn 1s ease both"}}>
          <h2 style={{fontSize:"clamp(28px,4.5vw,40px)",fontWeight:800,color:E,letterSpacing:"-.03em",textAlign:"center",marginBottom:showSales?52:0}}>O Kloel escala.</h2>
          {showSales&&<div style={{width:"100%",maxWidth:740}}><ThanosOmniSales/></div>}
        </div>)}
      </section>
      <style>{`@keyframes sIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media(max-width:768px){.gridOmni{grid-template-columns:1fr 1fr!important}}`}</style>
    </div>
  );
}

export default function KloelLanding() {
  const [email, setEmail] = useState("");
  const [faq, setFaq] = useState<any>(null);
  const router = useRouter();
  return (
    <div style={{background:V,color:"#E0DDD8",fontFamily:F,overflowX:"hidden"}}>
      <style>{`@keyframes fm{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}::selection{background:rgba(232,93,48,.3)}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#222226;border-radius:2px}html{scroll-behavior:smooth}input::placeholder{color:#3A3A3F!important}@media(max-width:768px){.grid2{grid-template-columns:1fr!important}.grid3{grid-template-columns:1fr!important}.grid4{grid-template-columns:1fr 1fr!important}}`}</style>
      <header style={{position:"fixed",top:0,left:0,right:0,zIndex:50,background:"rgba(10,10,12,.92)",backdropFilter:"blur(16px)",borderBottom:"1px solid #19191C"}}>
        <div style={{maxWidth:1100,margin:"0 auto",display:"flex",height:52,alignItems:"center",justifyContent:"space-between",padding:"0 24px"}}>
          <span style={{fontSize:15,fontWeight:700,letterSpacing:"-0.02em"}}>Kloel</span>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <Link href="/login" style={{fontSize:12,color:"#6E6E73",textDecoration:"none",padding:"7px 12px"}}>Entrar</Link>
            <Link href="/register" style={{fontSize:12,fontWeight:600,color:V,background:"#E0DDD8",padding:"7px 16px",borderRadius:6,textDecoration:"none"}}>Ativar minha IA</Link>
          </div>
        </div>
      </header>

      <section style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",padding:"0 24px"}}>
        <div style={{maxWidth:820,width:"100%",zIndex:2}}><HeroLoop/></div>
        <p style={{position:"relative",zIndex:2,fontSize:16,color:"#6E6E73",marginTop:44,textAlign:"center",maxWidth:460}}>A IA que responde, negocia e fecha vendas por você.<br/><span style={{color:"#3A3A3F"}}>6 canais. 24/7. R$0/mês.</span></p>
        <div style={{position:"absolute",bottom:"8%",left:0,width:"100%",zIndex:1}}><Heartbeat/></div>
        <div style={{position:"absolute",bottom:28,left:"50%",transform:"translateX(-50%)",animation:"pulse 2.5s ease infinite",color:"#3A3A3F",zIndex:2}}><svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="6 9 12 15 18 9"/></svg></div>
      </section>

      <section style={{padding:"100px 24px",maxWidth:1000,margin:"0 auto"}}>
        <Reveal><p style={{textAlign:"center",fontSize:15,color:"#6E6E73",maxWidth:460,margin:"0 auto 40px"}}>Assista 3 vendas acontecendo ao mesmo tempo. Sem roteiro. Sem intervenção.</p></Reveal>
        <Reveal delay={200}><MultiChannel/></Reveal>
      </section>

      <section style={{padding:"140px 24px",textAlign:"center"}}>
        <Reveal><p style={{fontSize:17,color:"#6E6E73",lineHeight:1.8,maxWidth:420,margin:"0 auto 52px"}}>Isso não é automação.<br/>Não é chatbot. Não é script.<br/>Não é nenhuma ferramenta que você já usou.</p></Reveal>
        <Reveal delay={500}><h2 style={{fontSize:"clamp(32px,5.5vw,60px)",fontWeight:800,color:E,letterSpacing:"-.04em",margin:0}}>Isso é Marketing Artificial.</h2></Reveal>
      </section>

      <div style={{background:"#111113"}}>
        <section style={{padding:"100px 24px",maxWidth:1000,margin:"0 auto"}}>
          <Reveal><h2 style={{fontSize:24,fontWeight:700,marginBottom:48,textAlign:"center"}}>3 passos. 10 minutos. A IA assume.</h2></Reveal>
          <div className="grid3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
            {[{n:"01",h:"Conecte",d:"Cadastre produto. Conecte WhatsApp via QR Code. Configure preço e regras.",t:"A IA aprende com o produto. Quanto mais detalhes, melhor vende."},{n:"02",h:"Configure",d:"Escolha canais. Defina limites de desconto, tom, horarios, follow-up.",t:"Controle total. A IA nunca ultrapassa suas regras."},{n:"03",h:"A IA opera",d:"Responde, qualifica, negocia, fecha, faz follow-up, recupera carrinho. 24/7.",t:"Dashboard tempo real. Assuma qualquer conversa quando quiser."}].map((s,i)=>(
              <Reveal key={s.n} delay={i*120}><div style={{background:V,border:"1px solid #222226",borderRadius:6,padding:22,height:"100%"}}><div style={{fontFamily:M,fontSize:26,fontWeight:800,color:`${E}20`,marginBottom:8}}>{s.n}</div><h3 style={{fontSize:17,fontWeight:700,marginBottom:8}}>{s.h}</h3><p style={{fontSize:13,color:"#6E6E73",lineHeight:1.6,marginBottom:12}}>{s.d}</p><div style={{borderTop:"1px solid #222226",paddingTop:10}}><p style={{fontSize:11,color:"#3A3A3F",lineHeight:1.5,fontStyle:"italic"}}>{s.t}</p></div></div></Reveal>
            ))}
          </div>
        </section>
      </div>

      <div>
        <section style={{padding:"100px 24px",maxWidth:1100,margin:"0 auto"}}>
          <Reveal><h2 style={{fontSize:24,fontWeight:700,marginBottom:10,textAlign:"center"}}>Tudo num lugar só.</h2><p style={{fontSize:13,color:"#6E6E73",textAlign:"center",maxWidth:400,margin:"0 auto 48px"}}>Sem 15 assinaturas. Sem integrações quebradas.</p></Reveal>
          <div className="grid4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
            {[{c:"VENDA",items:["Checkout inteligente","Pix, cartão, boleto","Assinaturas","Order bump / upsell","Recuperação de carrinho","Split de comissões"]},{c:"IA EM 6 CANAIS",items:["WhatsApp","Instagram DM","Facebook Messenger","Email marketing","SMS","TikTok"]},{c:"CONSTRUA",items:["Site builder com IA","Landing pages","Funis de venda","Domínio + hospedagem","SSL automático","Canva integrado"]},{c:"GERENCIE",items:["Dashboard tempo real","CRM + pipeline","Afiliados","Área de membros","Relatórios + UTM","Meta/Google/TikTok Ads"]}].map((g,gi)=>(
              <Reveal key={g.c} delay={gi*80}><div style={{background:"#111113",border:"1px solid #222226",borderRadius:6,padding:18,height:"100%"}}><div style={{fontFamily:M,fontSize:9,color:E,letterSpacing:".1em",marginBottom:12}}>{g.c}</div>{g.items.map(it=><div key={it} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:"1px solid #19191C"}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth={2}><polyline points="20 6 9 17 4 12"/></svg><span style={{fontSize:12}}>{it}</span></div>)}</div></Reveal>
            ))}
          </div>
        </section>
      </div>

      <div>
        <section style={{padding:"100px 24px",maxWidth:860,margin:"0 auto"}}>
          <Reveal><h2 style={{fontSize:24,fontWeight:700,marginBottom:48,textAlign:"center"}}>Quanto você gasta hoje?</h2></Reveal>
          <div className="grid2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,alignItems:"start"}}>
            <Reveal><div style={{background:"#111113",borderRadius:6,padding:20}}><div style={{fontFamily:M,fontSize:9,color:"#6E6E73",letterSpacing:".1em",marginBottom:12}}>FERRAMENTAS SEPARADAS</div>{[["Automação email","R$189"],["Chatbot","R$75"],["Funis","R$500"],["Hospedagem","R$45"],["CRM","R$300"],["Chat","R$90"],["SMS","R$120"],["Afiliados","R$200"]].map(([t,p])=><div key={t} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #19191C"}}><span style={{fontSize:11,color:"#E0DDD8"}}>{t}</span><span style={{fontSize:10,color:"#6E6E73",fontFamily:M}}>{p}</span></div>)}<div style={{display:"flex",justifyContent:"space-between",padding:"10px 0 0",marginTop:6}}><span style={{fontSize:12,fontWeight:600,color:"#E0DDD8"}}>Total</span><span style={{fontSize:16,fontWeight:800,color:"#EF4444",fontFamily:M}}>R$1.519+/mês</span></div></div></Reveal>
            <Reveal delay={200}><div style={{background:"#111113",border:`2px solid ${E}`,borderRadius:6,padding:22,position:"relative"}}><div style={{position:"absolute",top:-1,left:"50%",transform:"translateX(-50%)",background:E,padding:"2px 12px",borderRadius:"0 0 4px 4px",fontSize:9,fontWeight:700,color:V,fontFamily:M,letterSpacing:".08em"}}>KLOEL</div><div style={{textAlign:"center",padding:"24px 0 16px"}}><div style={{fontSize:48,fontWeight:800,fontFamily:M,letterSpacing:"-.04em"}}>R$ 0</div><div style={{fontSize:14,color:"#6E6E73",marginTop:4}}>por mês</div><div style={{fontSize:12,color:E,fontWeight:600,marginTop:10}}>Taxa apenas sobre vendas.</div><div style={{fontSize:11,color:"#3A3A3F",marginTop:2}}>Sem venda, sem custo.</div></div></div></Reveal>
          </div>
        </section>
      </div>

      <ThanosSection />

      <div>
        <section style={{padding:"80px 24px",maxWidth:1000,margin:"0 auto"}}>
          <div className="grid3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
            {[{n:"Carolina M.",r:"Infoprodutora",t:"A IA respondeu 800 mensagens em 5 dias e fechou 23 vendas. Não toquei no celular.",m:"23 vendas / 5 dias",c:E},{n:"Ricardo T.",r:"Mentor",t:"Economizei R$1.400/mes. As vendas subiram porque a IA nunca esquece o follow-up.",m:"R$1.400/mes economizados",c:"#7F66FF"},{n:"Fernanda L.",r:"E-commerce",t:"Monitorei 3 dias. No terceiro entendi: a IA responde melhor do que eu. Mais rapido, mais consistente.",m:"Conversao +40%",c:"#00A884"}].map((p,i)=>(
              <Reveal key={p.n} delay={i*100}><div style={{background:"#111113",border:"1px solid #222226",borderRadius:6,padding:20,height:"100%",display:"flex",flexDirection:"column"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><div style={{width:32,height:32,borderRadius:"50%",background:p.c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,color:"#fff"}}>{p.n.split(" ").map(w=>w[0]).join("")}</div><div><div style={{fontSize:12,fontWeight:600}}>{p.n}</div><div style={{fontSize:10,color:"#3A3A3F"}}>{p.r}</div></div></div><p style={{fontSize:12,color:"#6E6E73",lineHeight:1.6,flex:1,margin:0}}>"{p.t}"</p><div style={{marginTop:12,paddingTop:8,borderTop:"1px solid #222226",display:"flex",alignItems:"center",gap:4}}><div style={{width:4,height:4,borderRadius:2,background:"#10B981"}}/><span style={{fontSize:10,fontWeight:600,color:"#10B981",fontFamily:M}}>{p.m}</span></div></div></Reveal>
            ))}
          </div>
        </section>
      </div>

      <div id="ativar">
        <section style={{padding:"0 24px",textAlign:"center",position:"relative",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          <div style={{position:"relative",zIndex:1,maxWidth:700}}>
            {/* The manifesto — alone, breathing */}
            <Reveal>
              <h2 style={{fontSize:"clamp(30px,5vw,54px)",fontWeight:800,lineHeight:1.2,letterSpacing:"-.03em",margin:0}}>
                O Marketing morreu <span style={{color:E}}>Digital</span>
              </h2>
              <h2 style={{fontSize:"clamp(30px,5vw,54px)",fontWeight:800,lineHeight:1.2,letterSpacing:"-.03em",margin:"4px 0 0"}}>
                e ressuscitou <span style={{color:E}}>Artificial.</span>
              </h2>
            </Reveal>

            {/* Space */}
            <Reveal delay={400}>
              <p style={{fontSize:15,color:"#6E6E73",lineHeight:1.7,maxWidth:440,margin:"48px auto 0"}}>
                Você pensa a estratégia.<br/>A inteligência artificial executa tudo.
              </p>
            </Reveal>

            {/* CTA — separated, clean */}
            <Reveal delay={600}>
              <div style={{marginTop:48,display:"flex",gap:10,justifyContent:"center",maxWidth:440,margin:"48px auto 0",flexWrap:"wrap"}}>
                <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Seu melhor e-mail" style={{flex:1,minWidth:220,background:"#111113",border:"1px solid #222226",borderRadius:6,padding:"16px 20px",color:"#E0DDD8",fontSize:15,fontFamily:F,outline:"none"}}/>
                <button onClick={() => router.push(`/register${email ? `?email=${encodeURIComponent(email)}` : ''}`)} style={{background:E,color:V,border:"none",borderRadius:6,padding:"16px 32px",fontSize:15,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",fontFamily:F}}>Ativar minha IA</button>
              </div>
              <p style={{fontSize:11,color:"#3A3A3F",marginTop:14}}>R$0/mês. Taxa só quando vender.</p>
            </Reveal>

            {/* Live pulse — subtle, final touch */}
            <Reveal delay={800}>
              <div style={{marginTop:56}}><LivePulse/></div>
            </Reveal>
          </div>
        </section>
      </div>

      {/* Heartbeat — separador entre CTA e FAQ */}
      <div style={{padding:"20px 0",opacity:0.35}}>
        <Heartbeat/>
      </div>

      <div>
        <section style={{padding:"80px 24px",maxWidth:640,margin:"0 auto"}}>
          <Reveal><h2 style={{fontSize:22,fontWeight:700,marginBottom:36,textAlign:"center"}}>Perguntas frequentes</h2></Reveal>
          {[{q:"A IA realmente vende sozinha?",a:"Sim. Analisa contexto, negocia dentro das suas regras, e fecha. Você pode intervir quando quiser."},{q:"Quanto custa?",a:"R$0/mês. Taxa apenas sobre vendas realizadas."},{q:"Preciso programar?",a:"Não. Cadastre produto, conecte WhatsApp, configure regras."},{q:"Como a IA sabe o que responder?",a:"Aprende com o cadastro do produto — preço, benefícios, objeções, limites."},{q:"Posso responder manualmente?",a:"Sim. A IA para quando você entra e volta quando você sai."},{q:"É seguro?",a:"Criptografia ponta a ponta, servidores isolados, LGPD."}].map((f,i)=>(
            <Reveal key={i} delay={30*i}><div style={{borderBottom:"1px solid #19191C"}}><button onClick={()=>setFaq(faq===i?null:i)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"15px 0",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}><span style={{fontSize:14,fontWeight:500,color:"#E0DDD8"}}>{f.q}</span><span style={{color:"#3A3A3F",fontSize:16,transform:faq===i?"rotate(45deg)":"none",transition:"transform .15s",flexShrink:0,marginLeft:12}}>+</span></button>{faq===i&&<div style={{padding:"0 0 14px",animation:"fadeIn .3s ease both"}}><p style={{fontSize:13,color:"#6E6E73",lineHeight:1.7}}>{f.a}</p></div>}</div></Reveal>
          ))}
        </section>
      </div>

      <footer style={{padding:"36px 24px"}}>
        <div style={{maxWidth:1100,margin:"0 auto",textAlign:"center"}}>
          <span style={{fontSize:14,fontWeight:700}}>Kloel</span>
          <div style={{marginTop:14,display:"flex",justifyContent:"center",gap:20}}>
            <Link href="/terms" style={{fontSize:11,color:"#3A3A3F",textDecoration:"none"}}>Termos</Link>
            <Link href="/privacy" style={{fontSize:11,color:"#3A3A3F",textDecoration:"none"}}>Privacidade</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
