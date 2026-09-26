// Crafted leafy shrub generator (unit space: base at origin, ~2 wide, ~1.3 tall) + a woody-shoot tube helper.
// Leaf cards in 11–16 overlapping clumps; every vertex carries its clump centre (`clusterCenter`) so the puff
// normal in threejs-ghibli-toon-shading shades each clump as one soft volume. Habits: 'mound' (boxwood),
// 'upright' (hydrangea vase), 'arching' (yamabuki canes). Blooms: 'dots' | 'balls' (mopheads). `tip`: new-growth tint.
// Adapt: map the cards' UVs onto your leaf atlas (flowers use its pale centre stripe u = .45–.55 so the green
// gradient doesn't muddy their colour); instance per 16 m cell; SHRUB_SCALE ≈ 1.45 so they rise out of the grass.
//   const { leaves, stems } = shrubGeometry(9, { hue:.235, leaves:820, bloom:.9, bloomColor:new THREE.Color(0xee92b4) })
import * as THREE from 'three'

export const random = seed => () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z)

function buffer(){ return { p:[], n:[], c:[], i:[] } }
function vertex(b,p,n,c){ b.p.push(...p); b.n.push(...n); b.c.push(c.r,c.g,c.b); return b.p.length/3-1 }
function geometry(b){ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(b.c,3)); g.setIndex(b.i); g.computeBoundingSphere(); return g }
function tube(b,points,radius,color,sides=7){
  const start=b.p.length/3
  points.forEach((p,j)=>{ const dir=points[Math.min(j+1,points.length-1)].clone().sub(points[Math.max(0,j-1)]).normalize(); const side=V().crossVectors(dir,V(.12,1,.08)).normalize(), other=V().crossVectors(dir,side).normalize()
    for(let k=0;k<sides;k++){ const a=k/sides*Math.PI*2, normal=side.clone().multiplyScalar(Math.cos(a)).addScaledVector(other,Math.sin(a)); vertex(b,p.clone().addScaledVector(normal,radius[j]),normal,color) }
    if(j) for(let k=0;k<sides;k++){ const a=start+(j-1)*sides+k, d=start+(j-1)*sides+(k+1)%sides; b.i.push(a,d,a+sides,d,d+sides,a+sides) }
  })
}

export function shrubGeometry(seed, { leaves=1100, bloom=0, bloomColor=new THREE.Color(1,.93,.96), bloomColor2=null, bloomKind='dots', hue=.26, habit='mound', leafL=1, tip=null } = {}){
  const r=random(seed), E=habit==='upright' ? V(.74,1.25,.74) : V(1,.8,1), EC=habit==='upright' ? V(0,.8,0) : V(0,.52,0)
  const P=[], N=[], C=[], UV=[], CC=[], I=[]
  const nClump=11+(r()*6|0), clumps=[], canes=[]
  if(habit==='arching') for(let k=0,nc=6+(r()*3|0);k<nc;k++){                       // canes: up steeply, then bowing out and over
    const a=k/nc*Math.PI*2+r()*.5, R=.7+r()*.4, H=.95+r()*.35, d=V(Math.cos(a),0,Math.sin(a)), s0=V((r()-.5)*.1,0,(r()-.5)*.1)
    const at=t=>s0.clone().addScaledVector(d,R*t*(.25+.95*t)).add(V(0,H*(2.1*t-1.35*t*t),0))
    canes.push(at); for(const t of [.42,.62,.8,.96]) clumps.push({ c:at(t), cr:.16+.07*r(), out:at(t).sub(EC).setY(Math.max(.1,at(t).y-.3)).normalize(), tint:(r()-.5) }) }
  else for(let i=0;i<nClump;i++){
    const a=r()*Math.PI*2, el=i===0 ? 1.45 : -.25+r()*1.45
    const dir=V(Math.cos(a)*Math.cos(el),Math.sin(el),Math.sin(a)*Math.cos(el))
    const c=EC.clone().add(dir.clone().multiply(E).multiplyScalar(.5+.22*r())); c.y=Math.max(c.y,.24)
    clumps.push({ c, cr:.34+.14*r(), out:c.clone().sub(EC).divide(E).normalize(), tint:(r()-.5) })
  }
  const col=new THREE.Color(), tmp=V()
  const card=(p,n,t,L,W,color,center,u0=0,u1=1)=>{
    const bt=V().crossVectors(n,t).normalize(), base=p.clone().addScaledVector(t,-L/2), tip=p.clone().addScaledVector(t,L/2).addScaledVector(n,-.18*L)   // the tip droops a little
    const k=P.length/3
    ;[[base,-1,0],[base,1,0],[tip,1,1],[tip,-1,1]].forEach(([q,sx,v])=>{ const w=q.clone().addScaledVector(bt,sx*W/2); P.push(w.x,w.y,w.z); N.push(n.x,n.y,n.z); C.push(color.r,color.g,color.b); UV.push(sx<0?u0:u1,v); CC.push(center.x,center.y,center.z) })
    I.push(k,k+1,k+2,k,k+2,k+3)
  }
  const rv=()=>V(r()*2-1,r()*2-1,r()*2-1)
  for(const cl of clumps){
    const n=Math.round(leaves/clumps.length*(.8+.4*r()))
    for(let j=0;j<n;j++){
      const u=rv().normalize().addScaledVector(cl.out,1.1).normalize()
      const p=cl.c.clone().addScaledVector(u,cl.cr*(.45+.55*Math.sqrt(r())))
      if(p.y<.04) continue
      const nn=u.clone().multiplyScalar(.75).add(V(0,.45,0)).add(rv().multiplyScalar(.35)).normalize()
      const t=V().crossVectors(nn,rv()).normalize(), L=(.17+.09*r())*leafL
      // colour: deeper and cooler inside and underneath, fresh yellow-green on the sunny outer tips (or red new growth)
      const depth=Math.min(1,p.clone().sub(EC).divide(E).length()), sun=Math.max(0,u.y)*depth
      col.setHSL(hue+cl.tint*.035+.02*sun,.5+.12*sun,.16+.1*depth+.1*sun+.03*(r()-.5))
      col.multiplyScalar(.55+.45*Math.min(1,p.y/.5))
      if(tip && sun>.35) col.lerp(tip,Math.min(1,(sun-.35)*1.6)*(.6+.4*r()))
      card(p,nn,t,L,L*.52,col,cl.c)
    }
    // hydrangea: one mophead per outer clump, a ball of floret cards (pale stripe of the atlas), two colours drifting across the shrub
    if(bloomKind==='balls' && bloom>0 && cl.out.y>-.15 && r()<bloom){
      const br=.14+.06*r(), bc=cl.c.clone().addScaledVector(cl.out,cl.cr*.92).add(V(0,.04,0)), mix=r(), up=cl.out.clone().add(V(0,.8,0)).normalize()
      for(let j=0;j<44;j++){ const y=1-2*(j+.5)/44, rr=Math.sqrt(1-y*y), ph=j*2.39996, dir=V(Math.cos(ph)*rr,y,Math.sin(ph)*rr)
        if(dir.dot(up)<-.35) continue
        const p=bc.clone().addScaledVector(dir,br*(.92+.12*r()))
        col.copy(bloomColor); if(bloomColor2) col.lerp(bloomColor2,Math.min(1,Math.max(0,mix+(r()-.5)*.5))); col.multiplyScalar(.85+.3*r()+.12*Math.max(0,dir.y))
        card(p,dir,V().crossVectors(dir,rv()).normalize(),.06+.02*r(),.055,col,bc,.45,.55) } }
    // flowers sample only the pale centre stripe of the leaf atlas, so the green gradient doesn't muddy their colour
    if(bloomKind==='dots' && bloom>0 && cl.out.y>.15) for(let j=0,m=Math.round(bloom*110*cl.out.y);j<m;j++){
      const u=rv().normalize().addScaledVector(cl.out,1.6).normalize()
      const p=cl.c.clone().addScaledVector(u,cl.cr*1.02), nn=u.clone().add(V(0,.6,0)).normalize()
      col.copy(bloomColor).multiplyScalar(.95+.25*r()); card(p,nn,V().crossVectors(nn,rv()).normalize(),.06+.025*r(),.05,col,cl.c,.45,.55)
    }
  }
  const g=new THREE.BufferGeometry()
  g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3))
  g.setAttribute('color',new THREE.Float32BufferAttribute(C,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(UV,2))
  g.setAttribute('clusterCenter',new THREE.Float32BufferAttribute(CC,3)); g.setIndex(I); g.computeBoundingSphere()
  // woody shoots from the root crown out toward the lower clumps
  const b=buffer(), bark=new THREE.Color(.12,.085,.055)
  if(canes.length) canes.forEach(at=>tube(b,[0,.2,.4,.6,.8,.97].map(at),[.018,.015,.012,.009,.007,.005],new THREE.Color(.2,.21,.09),5))   // green-brown canes carry the arching habit
  else clumps.filter(cl=>cl.c.y<.75).slice(0,7).forEach(cl=>{
    const s0=V((r()-.5)*.12,0,(r()-.5)*.12), end=cl.c.clone().multiplyScalar(.85), mid=s0.clone().lerp(end,.5).add(V(0,.06,0))
    tube(b,[s0,mid,end],[.032,.022,.012],bark,5)
  })
  return { leaves:g, stems:geometry(b) }
}
