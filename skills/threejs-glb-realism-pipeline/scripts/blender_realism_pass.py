"""
Blender headless realism pass: scale -> bevel -> PBR textures -> lightmap bake -> GLB export.

Usage:
  blender -b --factory-startup --python blender_realism_pass.py -- \
      --input model.glb|model.blend --output realism/build/scene.glb --config realism/config.json

Tested against the Blender 4.x Python API. Every stage is controlled by the config file
(see references/config.example.json) so stages can be enabled one at a time.

Lightmap export: glTF has no lightmap slot, so the baked image is wired into the
"glTF Material Output" Occlusion socket using the "Lightmap" UV set. The exporter then
writes it as occlusionTexture on TEXCOORD_1, and the viewer promotes it to a real lightMap.
"""
import bpy
import bmesh
import fnmatch
import json
import math
import os
import sys
import time


# ----------------------------------------------------------------------------- args
def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = {"input": None, "output": None, "config": None}
    i = 0
    while i < len(argv):
        key = argv[i].lstrip("-")
        if key in args and i + 1 < len(argv):
            args[key] = argv[i + 1]
            i += 2
        else:
            i += 1
    if not args["input"] or not args["output"]:
        print("ERROR: --input and --output are required")
        sys.exit(1)
    return args


DEFAULTS = {
    "scale": 1.0,
    "bevel": {"enabled": True, "width": 0.01, "segments": 2, "angle_deg": 30, "max_faces": 50000},
    "textures": {"enabled": False, "uv_box_size_m": 2.0, "map": {}},
    "lights": "keep",
    "bake": {"enabled": False, "samples": 64, "default_resolution": 512, "large_resolution": 1024,
             "large_area_m2": 50, "margin": 8, "skip": ["*glass*", "*light*", "*emiss*"]},
}


def load_config(path):
    cfg = json.loads(json.dumps(DEFAULTS))
    if path and os.path.exists(path):
        with open(path) as f:
            user = json.load(f)
        for k, v in user.items():
            if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                cfg[k].update(v)
            else:
                cfg[k] = v
    return cfg


def log(msg):
    print(f"[realism] {msg}", flush=True)


def match_any(name, patterns):
    name = (name or "").lower()
    for group in patterns:
        for p in group.split("|"):
            if fnmatch.fnmatch(name, p.strip().lower()):
                return group
    return None


def mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and o.visible_get()]


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


# ----------------------------------------------------------------------------- import
def load_input(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".blend":
        bpy.ops.wm.open_mainfile(filepath=os.path.abspath(path))
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        if ext in (".glb", ".gltf"):
            bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
        elif ext == ".fbx":
            bpy.ops.import_scene.fbx(filepath=os.path.abspath(path))
        elif ext == ".obj":
            bpy.ops.wm.obj_import(filepath=os.path.abspath(path))
        else:
            log(f"Unsupported input type {ext}")
            sys.exit(1)
    log(f"Loaded {path}: {len(mesh_objects())} mesh objects")


# ----------------------------------------------------------------------------- scale
def apply_scale(factor):
    if abs(factor - 1.0) < 1e-6:
        return
    roots = [o for o in bpy.context.scene.objects if o.parent is None]
    for o in roots:
        o.scale = [s * factor for s in o.scale]
        o.location = [c * factor for c in o.location]
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    log(f"Scaled scene by {factor}")


def make_single_user():
    # Shared mesh data blocks block modifier application and per-object bakes.
    for o in mesh_objects():
        if o.data.users > 1:
            o.data = o.data.copy()


# ----------------------------------------------------------------------------- bevel
def apply_bevel(cfg):
    b = cfg["bevel"]
    if not b.get("enabled"):
        return
    count = 0
    for o in mesh_objects():
        faces = len(o.data.polygons)
        if faces == 0 or faces > b["max_faces"]:
            continue
        # Bevel width must stay smaller than the object's thinnest dimension.
        dims = sorted(d for d in o.dimensions if d > 1e-5)
        if not dims:
            continue
        width = min(b["width"], dims[0] * 0.2)
        select_only(o)
        mod = o.modifiers.new("RealismBevel", "BEVEL")
        mod.width = width
        mod.segments = int(b["segments"])
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(b["angle_deg"])
        mod.harden_normals = True
        mod.use_clamp_overlap = True
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
            count += 1
        except RuntimeError as e:
            log(f"  bevel skipped on {o.name}: {e}")
            o.modifiers.remove(mod)
            continue
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(b["angle_deg"]))
        except Exception:
            try:
                bpy.ops.object.shade_smooth_by_angle(angle=math.radians(b["angle_deg"]))
            except Exception:
                pass
    log(f"Bevelled {count} objects")


# ----------------------------------------------------------------------------- textures
TEX_KEYS = {
    "color": ["_color", "_albedo", "_basecolor", "_base_color", "_diff", "_diffuse"],
    "roughness": ["_roughness", "_rough"],
    "normal": ["_normalgl", "_normal_gl", "_nor_gl", "_normal"],
    "metal": ["_metalness", "_metallic", "_metal"],
}


def find_texture_set(folder):
    found = {}
    if not os.path.isdir(folder):
        return found
    files = sorted(os.listdir(folder))
    for kind, keys in TEX_KEYS.items():
        for key in keys:
            hit = next((f for f in files if key in f.lower() and f.lower().endswith((".png", ".jpg", ".jpeg"))), None)
            if hit and not (kind == "normal" and "_dx" in hit.lower()):
                found[kind] = os.path.join(folder, hit)
                break
    return found


def ensure_uv(obj, box_size):
    if obj.data.uv_layers:
        return
    obj.data.uv_layers.new(name="UVMap")
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=box_size, scale_to_bounds=False, correct_aspect=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    log(f"  box-projected UVs on {obj.name}")


def apply_texture_set(mat, tex):
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        return False

    def img_node(path, non_color, y):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(path, check_existing=True)
        if non_color:
            n.image.colorspace_settings.name = "Non-Color"
        n.location = (bsdf.location.x - 500, bsdf.location.y + y)
        return n

    if "color" in tex:
        n = img_node(tex["color"], False, 300)
        nt.links.new(n.outputs["Color"], bsdf.inputs["Base Color"])
    if "roughness" in tex:
        n = img_node(tex["roughness"], True, 0)
        nt.links.new(n.outputs["Color"], bsdf.inputs["Roughness"])
    if "metal" in tex:
        n = img_node(tex["metal"], True, -300)
        nt.links.new(n.outputs["Color"], bsdf.inputs["Metallic"])
    if "normal" in tex:
        n = img_node(tex["normal"], True, -600)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.location = (bsdf.location.x - 200, bsdf.location.y - 600)
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return True


def apply_textures(cfg, base_dir):
    t = cfg["textures"]
    if not t.get("enabled") or not t.get("map"):
        return
    patterns = list(t["map"].keys())
    done = set()
    for o in mesh_objects():
        for slot in o.material_slots:
            mat = slot.material
            if not mat or not mat.use_nodes:
                continue
            group = match_any(mat.name, patterns) or match_any(o.name, patterns)
            if not group:
                continue
            ensure_uv(o, t["uv_box_size_m"])
            if mat.name in done:
                continue
            folder = t["map"][group]
            folder = folder if os.path.isabs(folder) else os.path.join(base_dir, folder)
            tex = find_texture_set(folder)
            if not tex:
                log(f"  no textures found in {folder} for {mat.name}")
                continue
            if apply_texture_set(mat, tex):
                done.add(mat.name)
                log(f"  {mat.name} <- {os.path.basename(folder)} ({', '.join(tex)})")
    log(f"Textured {len(done)} materials")


# ----------------------------------------------------------------------------- lights
def setup_lights(mode):
    has_light = any(o.type == "LIGHT" for o in bpy.context.scene.objects)
    has_emission = False
    for m in bpy.data.materials:
        if m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED" and "Emission Strength" in n.inputs and n.inputs["Emission Strength"].default_value > 0:
                    has_emission = True
    if mode == "keep" and (has_light or has_emission):
        log("Using scene lights for bake")
        return
    if mode == "keep":
        log("No lights in scene; adding sun + sky so the bake isn't black (set lights to 'auto' to silence)")
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = next((n for n in nt.nodes if n.type == "BACKGROUND"), None)
    if bg:
        try:
            sky = nt.nodes.new("ShaderNodeTexSky")
            sky.sky_type = "NISHITA"
            nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
            bg.inputs["Strength"].default_value = 0.3
        except Exception:
            bg.inputs["Color"].default_value = (0.6, 0.7, 0.85, 1)
    sun_data = bpy.data.lights.new("RealismSun", "SUN")
    sun_data.energy = 3.0
    sun_data.angle = math.radians(2)
    sun = bpy.data.objects.new("RealismSun", sun_data)
    sun.rotation_euler = (math.radians(40), 0, math.radians(35))
    bpy.context.scene.collection.objects.link(sun)
    log("Added sun + sky for baking")


# ----------------------------------------------------------------------------- bake
def surface_area(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    area = sum(f.calc_area() for f in bm.faces)
    bm.free()
    return area


def get_gltf_output_group():
    name = "glTF Material Output"
    ng = bpy.data.node_groups.get(name)
    if ng:
        return ng
    ng = bpy.data.node_groups.new(name, "ShaderNodeTree")
    ng.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    ng.interface.new_socket(name="Thickness", in_out="INPUT", socket_type="NodeSocketFloat")
    ng.nodes.new("NodeGroupInput")
    return ng


def bake_lightmaps(cfg, out_dir):
    b = cfg["bake"]
    if not b.get("enabled"):
        return
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = int(b["samples"])
    try:
        scene.cycles.device = "GPU"
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for dev_type in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
            try:
                prefs.compute_device_type = dev_type
                prefs.get_devices()
                if any(d.type == dev_type for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = True
                    log(f"Baking on GPU ({dev_type})")
                    break
            except Exception:
                continue
        else:
            scene.cycles.device = "CPU"
            log("Baking on CPU")
    except Exception:
        scene.cycles.device = "CPU"

    lm_dir = os.path.join(out_dir, "lightmaps")
    os.makedirs(lm_dir, exist_ok=True)
    ng = get_gltf_output_group()

    targets = []
    for o in mesh_objects():
        if match_any(o.name, b["skip"]) or not o.material_slots:
            continue
        if any(s.material and match_any(s.material.name, b["skip"]) for s in o.material_slots):
            continue
        targets.append(o)
    log(f"Baking {len(targets)} objects")
    t0 = time.time()

    for i, o in enumerate(targets):
        area = surface_area(o)
        res = int(b["large_resolution"] if area >= b["large_area_m2"] else b["default_resolution"])

        # Unique materials per object, otherwise objects sharing a material overwrite each other's lightmap.
        for slot in o.material_slots:
            if slot.material and slot.material.users > 1:
                slot.material = slot.material.copy()

        # Lightmap UV set: non-overlapping, packed.
        uvs = o.data.uv_layers
        if not uvs:
            uvs.new(name="UVMap")
        lm = uvs.get("Lightmap") or uvs.new(name="Lightmap")
        uvs[0].active_render = True
        uvs.active = lm
        select_only(o)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02, area_weight=0.0)
        bpy.ops.uv.pack_islands(margin=0.01)
        bpy.ops.object.mode_set(mode="OBJECT")

        img_name = f"LM_{o.name}"
        img = bpy.data.images.get(img_name) or bpy.data.images.new(img_name, res, res, alpha=False, float_buffer=False)
        img.colorspace_settings.name = "Non-Color"

        bake_nodes = []
        for slot in o.material_slots:
            mat = slot.material
            if not mat:
                continue
            mat.use_nodes = True
            nt = mat.node_tree
            for n in nt.nodes:
                n.select = False
            node = nt.nodes.new("ShaderNodeTexImage")
            node.image = img
            node.name = "RealismLightmap"
            node.select = True
            nt.nodes.active = node
            bake_nodes.append((mat, node))

        try:
            bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"},
                                margin=int(b["margin"]), use_clear=True, target="IMAGE_TEXTURES")
        except RuntimeError as e:
            log(f"  bake failed on {o.name}: {e}")
            for mat, node in bake_nodes:
                mat.node_tree.nodes.remove(node)
            continue

        path = os.path.join(lm_dir, f"{bpy.path.clean_name(o.name)}.png")
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()

        # Wire into glTF Material Output > Occlusion via the Lightmap UV set.
        for mat, node in bake_nodes:
            nt = mat.node_tree
            uvnode = nt.nodes.new("ShaderNodeUVMap")
            uvnode.uv_map = "Lightmap"
            nt.links.new(uvnode.outputs["UV"], node.inputs["Vector"])
            sep = nt.nodes.new("ShaderNodeSeparateColor")
            nt.links.new(node.outputs["Color"], sep.inputs["Color"])
            grp = next((n for n in nt.nodes if n.type == "GROUP" and n.node_tree == ng), None)
            if not grp:
                grp = nt.nodes.new("ShaderNodeGroup")
                grp.node_tree = ng
            nt.links.new(sep.outputs[0], grp.inputs["Occlusion"])

        uvs.active = uvs[0]
        uvs[0].active_render = True
        log(f"  [{i + 1}/{len(targets)}] {o.name} {res}px ({area:.1f} m2) {time.time() - t0:.0f}s elapsed")

    with open(os.path.join(out_dir, "lightmaps.json"), "w") as f:
        json.dump({"mode": "occlusion-slot", "channel": "r", "objects": [o.name for o in targets]}, f, indent=2)
    log(f"Bake done in {time.time() - t0:.0f}s")


# ----------------------------------------------------------------------------- export
def export(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    kwargs = dict(filepath=os.path.abspath(path), export_format="GLB", export_apply=True,
                  export_texcoords=True, export_normals=True, export_yup=True,
                  export_lights=True, export_image_format="AUTO")
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError:
        kwargs.pop("export_lights", None)
        bpy.ops.export_scene.gltf(**kwargs)
    log(f"Exported {path}")


def main():
    args = parse_args()
    cfg = load_config(args["config"])
    base_dir = os.path.dirname(os.path.abspath(args["config"])) if args["config"] else os.getcwd()
    out_dir = os.path.dirname(os.path.abspath(args["output"]))

    load_input(args["input"])
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    make_single_user()
    apply_scale(float(cfg.get("scale", 1.0)))
    apply_bevel(cfg)
    apply_textures(cfg, base_dir)
    if cfg["bake"].get("enabled"):
        setup_lights(cfg.get("lights", "keep"))
        bake_lightmaps(cfg, out_dir)
    export(args["output"])
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "scene_realism.blend"))
    log("Saved scene_realism.blend for inspection")


if __name__ == "__main__":
    main()
