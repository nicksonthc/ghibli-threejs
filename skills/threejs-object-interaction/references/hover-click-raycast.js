// Hover + click on one object, with an additive pulsing ring.
// Adapt: `targetMeshes` (the object's meshes), `uTime` (shared time uniform), `onClick`, `cine` (your camera-owner flag),
// `aoHidden` (objects your AO pass should skip). Call stepRing(dt) every frame.
import * as THREE from 'three'

export function setupHover({ renderer, camera, scene, targetMeshes, uTime, onClick, isBusy = () => false, aoHidden = [] }){
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), dom = renderer.domElement
  const state = { hover:false, used:false }
  let down = null

  dom.addEventListener('pointermove', e => {
    if (isBusy()) return
    const rc = dom.getBoundingClientRect()                       // the CANVAS rect, not the window
    ndc.set((e.clientX - rc.left)/rc.width*2 - 1, -((e.clientY - rc.top)/rc.height)*2 + 1)
    ray.setFromCamera(ndc, camera); ray.layers.enableAll()
    state.hover = ray.intersectObjects(targetMeshes, false).length > 0
    document.body.classList.toggle('hoverObj', state.hover)      // CSS: body.hoverObj canvas { cursor:pointer }
  })
  dom.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY] })
  dom.addEventListener('pointerup', e => {
    const click = down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6; down = null   // < 6 px: a click, else an orbit drag
    if (click && state.hover && !isBusy()){ state.used = true; onClick() }
  })

  const ring = new THREE.Mesh(new THREE.RingGeometry(.2, .3, 96).rotateX(-Math.PI/2), new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false,
    uniforms:{ uTime, uOn:{ value:0 } },
    vertexShader:`varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`uniform float uTime, uOn; varying vec2 vP;
      void main(){ float r = length(vP);
        float band  = exp(-pow((r-.235)*40., 2.)) + .35*exp(-pow((r-.25)*14., 2.));
        float sweep = .65 + .35*sin(atan(vP.y, vP.x)*3. - uTime*2.5);
        float pulse = .8 + .2*sin(uTime*4.);
        gl_FragColor = vec4(vec3(1., .86, .52)*band*sweep*pulse*uOn*2.2, 1.); }`,
  }))
  ring.renderOrder = 8; scene.add(ring); aoHidden.push(ring)     // keep it out of GTAO or it prints as a hard sheet

  const box = new THREE.Box3(), c = new THREE.Vector3()
  function stepRing(dt){
    box.makeEmpty(); targetMeshes.forEach(m => box.expandByObject(m)); box.getCenter(c)
    ring.position.set(c.x, c.y + .015, c.z)
    const idle = state.used ? 0 : .28 + .12*Math.sin(uTime.value*1.6)       // a breathing hint until the first use
    const want = isBusy() ? 0 : state.hover ? 1 : idle
    const u = ring.material.uniforms.uOn; u.value = THREE.MathUtils.lerp(u.value, want, Math.min(1, dt*8))
    ring.visible = u.value > .01
  }
  return { state, ring, stepRing }
}

// Promise tween: `await tweenP(2.4, k => …)` keeps a cinematic readable as a sequence.
export const tweenP = (dur, fn, ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2) => new Promise(res => {
  const t0 = performance.now()
  const step = () => { const k = Math.min(1, (performance.now() - t0)/(dur*1000)); fn(ease(k)); k < 1 ? requestAnimationFrame(step) : res() }
  step()
})

// Testing hover in browser automation: synthetic clicks don't fire pointermove. Dispatch at CSS coordinates.
export function simulateClick(canvas, cssX, cssY){
  const o = { clientX:cssX, clientY:cssY, bubbles:true, pointerId:1, pointerType:'mouse' }
  canvas.dispatchEvent(new PointerEvent('pointermove', o))
  canvas.dispatchEvent(new PointerEvent('pointerdown', o))      // OrbitControls may throw on setPointerCapture: harmless
  canvas.dispatchEvent(new PointerEvent('pointerup', o))
}
