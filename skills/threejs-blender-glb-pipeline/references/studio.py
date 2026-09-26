# Blender helper library for reference-guided procedural assets (from a working three.js project).
# ADAPT: materials/kinds, preview lighting, entry.json fields. Load by path from a generator (see generator-template.py).
# export() entry 'dimensions' are [x, height(z), depth(y)] in metres.
"""Shared Blender helpers for reference-guided volumetric studies.

Load by path from a generator run with `Blender --background --factory-startup --python`:

    import importlib.util, pathlib
    spec=importlib.util.spec_from_file_location('studio', '/abs/path/to/studio.py')
    studio=importlib.util.module_from_spec(spec); spec.loader.exec_module(studio)

Geometry is accumulated per material in a `Builder` and emitted as one mesh
object per material, so runtime draw calls stay small. `export()` grounds the
model at Z=0, writes `<slug>.glb`, `<slug>.blend` and a transparent Cycles
preview `<slug>.png` into the output directory, copies the reference image
into the references directory, and writes `<slug>.entry.json`. Generators never
write a shared manifest, so several can run in parallel; `merge_manifest()`
folds the entry files in afterwards.

Output locations, in priority order: the `out_dir`/`ref_dir` arguments of
`export()`, then the STUDIO_OUT_DIR / STUDIO_REF_DIR environment variables,
then `./public/models` and `./public/references` under the current directory."""
import bpy, bmesh, math, random, json, shutil, os
from pathlib import Path
from mathutils import Vector, Matrix

UP=Vector((0,0,1)); DOWN=Vector((0,0,-1))
bpy.context.preferences.filepaths.save_version=0

def _dirs(out_dir=None,ref_dir=None):
 out=Path(out_dir or os.environ.get('STUDIO_OUT_DIR') or 'public/models').resolve()
 ref=Path(ref_dir or os.environ.get('STUDIO_REF_DIR') or 'public/references').resolve()
 out.mkdir(parents=True,exist_ok=True); ref.mkdir(parents=True,exist_ok=True); return out,ref

def clear_scene():
 """Call before building: the factory startup file contains a cube, light and camera."""
 bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def look_at(obj,target):
 obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

_grain=random.Random(7)
def _srgb(v): return 12.92*v if v<=.0031308 else 1.055*v**(1/2.4)-.055
def mat(name,color,kind='plain',rough=.8,emission=0,metallic=0,grain_scale=1,flat=False,alpha=1):
 """kind: 'plain', 'stone' (speckle), 'wood' (streaked grain), 'plaster' (soft mottle).
 flat=True keeps hard edges (masonry, timber, tiles); leave False for organic or turned forms.
 Grain pixels are written sRGB-encoded so, after Blender decodes the image, textured and
 plain colours share one linear colour space (the raw values used to render ~3.5x darker)."""
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True; m['flat']=flat
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metallic
 if emission: p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emission
 if alpha<1: p.inputs['Alpha'].default_value=alpha; m.surface_render_method='DITHERED'
 if kind!='plain':
  n=128; im=bpy.data.images.new(name+' grain',width=n,height=n); pix=[]
  for y in range(n):
   for x in range(n):
    if kind=='wood': f=(.72+_grain.random()*.3)*(.82+.18*math.sin(y*.8+math.sin(x*.08)*2))
    elif kind=='plaster': f=.88+_grain.random()*.16+.06*math.sin(x*.21)*math.sin(y*.17)
    else: f=.7+_grain.random()*.36
    pix.extend([_srgb(min(1,c*f)) for c in color]+[1])
  im.pixels=pix; im.pack(); t=m.node_tree.nodes.new('ShaderNodeTexImage'); t.image=im
  m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color']); m['textured']=True; m['grain_scale']=grain_scale
 return m

class Builder:
 """Accumulates geometry per material and emits one mesh object for each."""
 def __init__(s): s.parts={}
 def add(s,m,verts,faces):
  part=s.parts.setdefault(m.name,(m,[],[])); base=len(part[1])
  part[1].extend(Vector(v) for v in verts); part[2].extend(tuple(i+base for i in f) for f in faces)
 def emit(s):
  for name,(m,verts,faces) in s.parts.items():
   me=bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts],[],faces); me.update()
   bm=bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(me); bm.free()
   for p in me.polygons:p.use_smooth=not m.get('flat')
   if m.get('textured'):
    uv=me.uv_layers.new(); k=m['grain_scale']
    for p in me.polygons:
     for idx in p.loop_indices:
      co=me.vertices[me.loops[idx].vertex_index].co; uv.data[idx].uv=((co.x*.3+co.y*.2)*k,(co.z*.7+co.y*.3)*k)
   me.materials.append(m); o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o)

def rnd(rng,z=1): return Vector((rng.uniform(-1,1),rng.uniform(-1,1),rng.uniform(-1,1)*z))

# ---- primitives -------------------------------------------------------------
def box(b,m,center,size,rot_z=0):
 """Axis-aligned box (optionally yawed); unshared verts keep its edges crisp."""
 sx,sy,sz=[s/2 for s in size]; R=Matrix.Rotation(rot_z,3,'Z'); c=Vector(center)
 corners=[c+R@Vector((x*sx,y*sy,z*sz)) for x,y,z in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
 b.add(m,corners,[(0,4,6,2),(1,3,7,5),(0,1,5,4),(2,6,7,3),(0,2,3,1),(4,5,7,6)])

def tube(b,m,pts,radii,sides=8,cap=True):
 """Polyline swept with per-point radius; radii may be a number or a list. Limbs, ropes, poles, rails."""
 pts=[Vector(p) for p in pts]; radii=radii if isinstance(radii,(list,tuple)) else [radii]*len(pts)
 verts=[]; faces=[]; n=(pts[1]-pts[0]).orthogonal().normalized()
 for i,p in enumerate(pts):
  t=(pts[min(i+1,len(pts)-1)]-pts[max(i-1,0)]).normalized(); n=(n-t*n.dot(t)).normalized(); bn=t.cross(n)
  verts.extend(p+(n*math.cos(j*math.tau/sides)+bn*math.sin(j*math.tau/sides))*radii[i] for j in range(sides))
 for i in range(len(pts)-1):
  for j in range(sides):a=i*sides+j; c=i*sides+(j+1)%sides; faces.append((a,c,c+sides,a+sides))
 if cap:
  for k,(ring,flip) in enumerate([(0,True),((len(pts)-1)*sides,False)]):
   verts.append(pts[0] if k==0 else pts[-1]); centre=len(verts)-1
   faces.extend((ring+(j+1)%sides,ring+j,centre) if flip else (ring+j,ring+(j+1)%sides,centre) for j in range(sides))
 b.add(m,verts,faces)

def rod(b,m,a,c,r,sides=8): tube(b,m,[a,c],r,sides)

def lathe(b,m,profile,sides=16,center=(0,0,0),rot_z=0):
 """Revolve an (r,z) profile around Z: pots, lantern bodies, finials, columns, torsos."""
 c=Vector(center); R=Matrix.Rotation(rot_z,3,'Z'); verts=[]; faces=[]
 for r,z in profile: verts.extend(c+R@Vector((r*math.cos(j*math.tau/sides),r*math.sin(j*math.tau/sides),z)) for j in range(sides))
 for i in range(len(profile)-1):
  for j in range(sides):a=i*sides+j; d=i*sides+(j+1)%sides; faces.append((a,d,d+sides,a+sides))
 b.add(m,verts,faces)

_ico={}
def sphere(b,m,center,radius,scale=(1,1,1),detail=2,rng=None,jitter=0):
 """Icosphere; scale squashes it, jitter (with rng) roughens it for foliage, moss, produce."""
 if detail not in _ico:
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail,radius=1); o=bpy.context.object
  _ico[detail]=([Vector(v.co) for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons]); bpy.data.objects.remove(o,do_unlink=True)
 v,f=_ico[detail]; c=Vector(center)
 b.add(m,[c+Vector((p.x*scale[0],p.y*scale[1],p.z*scale[2]))*radius*(1+(rng.uniform(-jitter,jitter) if rng and jitter else 0)) for p in v],f)

def quad(b,m,p0,p1,p2,p3): b.add(m,[p0,p1,p2,p3],[(0,1,2,3)])

def polygon(b,m,pts): b.add(m,pts,[tuple(range(len(pts)))])

def extrude(b,m,outline,z0,z1,center=(0,0,0),rot_z=0):
 """Prism from a closed 2D outline [(x,y),...] between z0 and z1: walls, plinths, roofs in plan."""
 c=Vector(center); R=Matrix.Rotation(rot_z,3,'Z'); n=len(outline)
 verts=[c+R@Vector((x,y,z)) for z in (z0,z1) for x,y in outline]
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 b.add(m,verts,faces)

def text_banner(b,m,text,center,size,rot_z=0,font=None):
 """Real glyphs as a mesh for signs and plaques. Pass a font path for CJK text; silently keeps
 Blender's default font if the path is missing."""
 cu=bpy.data.curves.new('Banner','FONT'); cu.body=text; cu.size=size; cu.align_x='CENTER'; cu.align_y='CENTER'; cu.extrude=size*.02
 if font and Path(font).exists(): cu.font=bpy.data.fonts.load(font)
 o=bpy.data.objects.new('Banner',cu); bpy.context.collection.objects.link(o); o.location=center; o.rotation_euler=(math.pi/2,0,rot_z)
 bpy.context.view_layer.objects.active=o; o.select_set(True); bpy.ops.object.convert(target='MESH'); o.select_set(False)
 me=o.data; b.add(m,[o.matrix_world@v.co for v in me.vertices],[tuple(p.vertices) for p in me.polygons]); bpy.data.objects.remove(o,do_unlink=True)

# ---- export -----------------------------------------------------------------
def export(slug,title,chinese,description,source,method='Reference-guided procedural modeling; unseen geometry interpreted',light=1.0,view=(.95,-1.2,.83),margin=1.586,out_dir=None,ref_dir=None,units='meters (artistic scale)'):
 """Ground at Z=0, export GLB + .blend, render a transparent preview, copy the reference and
 write <slug>.entry.json. `view` is the camera offset in multiples of the model's largest
 dimension (lower Z for buildings whose facade matters more than the roof); `margin` scales
 the orthographic frame (raise it for tall or cubic subjects that clip); `light` scales the
 softboxes (0.5-0.7 for bright foliage or whitewash, 1.0 for stone and timber)."""
 OUT,REF=_dirs(out_dir,ref_dir)
 objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
 corners=[o.matrix_world@v.co for o in objs for v in o.data.vertices]; minz=min(c.z for c in corners)
 for o in objs:o.location.z-=minz
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0]; bpy.context.view_layer.update()
 corners=[o.matrix_world@v.co for o in objs for v in o.data.vertices]
 lo=[min(c[i] for c in corners) for i in range(3)]; hi=[max(c[i] for c in corners) for i in range(3)]; dims=[hi[i]-lo[i] for i in range(3)]
 triangles=sum(len(p.vertices)-2 for o in objs for p in o.data.polygons)
 bpy.ops.export_scene.gltf(filepath=str(OUT/f'{slug}.glb'),export_format='GLB',use_selection=True,export_apply=True)
 size=max(dims); center=Vector(((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2))
 cd=bpy.data.cameras.new('Preview'); cam=bpy.data.objects.new('Preview',cd); bpy.context.collection.objects.link(cam)
 cam.location=center+Vector(view)*size; look_at(cam,center); cd.type='ORTHO'; cd.ortho_scale=size*margin; bpy.context.scene.camera=cam
 for loc,power in [((size,-size,size*1.6),170*size*size*light),((-size,-size/2,size),100*size*size*light)]:
  ld=bpy.data.lights.new('Softbox','AREA'); ld.energy=power; ld.shape='DISK'; ld.size=size; l=bpy.data.objects.new('Softbox',ld); bpy.context.collection.objects.link(l); l.location=center+Vector(loc); look_at(l,center)
 scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.render.resolution_x=800; scene.render.resolution_y=640; scene.render.resolution_percentage=100; scene.render.film_transparent=True; scene.render.filepath=str(OUT/f'{slug}.png')
 if scene.world: scene.world.color=(.3,.3,.3)
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{slug}.blend')); bpy.ops.render.render(write_still=True)
 source=Path(source).resolve(); shutil.copy2(source,REF/f'{slug}.png')
 web=lambda p:'/'+str(p.relative_to(Path.cwd())) if p.is_relative_to(Path.cwd()) else str(p)
 entry=dict(id=slug,title=title,chinese=chinese,description=description,glb=web(OUT/f'{slug}.glb').replace('/public',''),preview=web(OUT/f'{slug}.png').replace('/public',''),blend=web(OUT/f'{slug}.blend').replace('/public',''),reference=web(REF/f'{slug}.png').replace('/public',''),source=str(source.relative_to(Path.cwd())) if source.is_relative_to(Path.cwd()) else str(source),dimensions=[round(dims[0],3),round(dims[2],3),round(dims[1],3)],triangles=triangles,bytes=(OUT/f'{slug}.glb').stat().st_size,method=method,units=units)
 (OUT/f'{slug}.entry.json').write_text(json.dumps(entry,indent=2,ensure_ascii=False)+'\n')
 print(f'EXPORTED {slug}: {dims[0]:.2f} x {dims[1]:.2f} x {dims[2]:.2f} m, {triangles} triangles, {entry["bytes"]/1e6:.2f} MB',flush=True)
 return entry

def merge_manifest(out_dir=None):
 """Fold every <slug>.entry.json into manifest.json, replacing entries with the same id in place."""
 OUT,_=_dirs(out_dir); path=OUT/'manifest.json'; manifest=json.loads(path.read_text()) if path.exists() else []
 for f in sorted(OUT.glob('*.entry.json')):
  entry=json.loads(f.read_text()); ids=[a['id'] for a in manifest]
  if entry['id'] in ids: manifest[ids.index(entry['id'])]=entry
  else: manifest.append(entry)
 path.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n'); return manifest
