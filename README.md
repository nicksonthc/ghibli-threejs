# ghibli-threejs

Agent skills for building a hand-painted, **Ghibli-style 3D world in three.js / WebGL**:
realistic river water, toon-shaded foliage, painterly skies, a moonlit night, weather,
swimming creatures, cinematic interaction, guided camera tours, and the headless-Blender →
GLB asset pipeline behind them.

Every skill was mined from one real project, a ~6,000-line single-file three.js scene
(r186, WebGLRenderer + EffectComposer) built iteratively with Claude Code. Each one keeps
the **numbers that worked** and the **pitfalls that each cost a full iteration**, so you
don't have to rediscover them.

The skills follow the [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills)
format (`skills/<name>/SKILL.md` + optional `references/` code excerpts). They work in
Claude Code, and any agent that reads SKILL.md files.

## Install

**Claude Code plugin (all skills):**

```text
/plugin marketplace add nicksonthc/ghibli-threejs
/plugin install ghibli-threejs@ghibli-threejs
```

**Or copy individual skills** into your personal or project skills folder:

```bash
git clone https://github.com/nicksonthc/ghibli-threejs
cp -r ghibli-threejs/skills/threejs-webgl-realistic-water ~/.claude/skills/
# or: .claude/skills/ inside your project
```

Then just ask for the effect ("add realistic water with refraction to my river") and the
matching skill loads. Each SKILL.md also has a **paste-ready prompt** with `{{slots}}` you
can use directly.

## Skills

### Water
| Skill | What it gives you |
|---|---|
| [threejs-webgl-realistic-water](skills/threejs-webgl-realistic-water) | Depth-aware refraction, Beer–Lambert absorption, planar reflection, shadowed sun glints, mipmapped ripple normals, caustics, pebble riverbed |
| [threejs-webgl-underwater-effect](skills/threejs-webgl-underwater-effect) | Diving below the surface: Snell's window, total internal reflection, light shafts, bubbles, underwater grade |
| [threejs-boat-buoyancy-steering](skills/threejs-boat-buoyancy-steering) | Gerstner waves shared by GPU and CPU, buoyant boat, smooth drifting lane, click-to-steer with autopilot, chase camera |
| [threejs-webgl-wake-simulation](skills/threejs-webgl-wake-simulation) | Kelvin wake — analytic, then a GPU iWave height-field simulation with foam and bow wave |
| [threejs-webgl-waterfall-effect](skills/threejs-webgl-waterfall-effect) | Waterfall off a real cliff lip into a carved plunge basin: layered sheets, spray, rainbow, mist |

### Look: sky, foliage, materials, post
| Skill | What it gives you |
|---|---|
| [threejs-ghibli-sky-clouds](skills/threejs-ghibli-sky-clouds) | Painterly sky dome, horizon haze, soft sun halo, instanced hand-painted cumulus |
| [threejs-ghibli-toon-shading](skills/threejs-ghibli-toon-shading) | Banded toon light without banded shadows, warm shadow fill, puff normals, backlit SSS, wind with synced shadows |
| [threejs-procedural-vegetation](skills/threejs-procedural-vegetation) | Crafted trees, bamboo, shrubs, meadow grass, wildflowers, reeds, lilies, sakura petals, rice paddies — instanced |
| [threejs-stylized-rock-material](skills/threejs-stylized-rock-material) | River-worn granite: soft facets, moss in vertex alpha, live wet line, grain and bump |
| [threejs-postprocessing-anime-grade](skills/threejs-postprocessing-anime-grade) | GTAO → bloom → grade → OutputPass → SMAA chain and the anime colour grade |

### Time, weather, night
| Skill | What it gives you |
|---|---|
| [threejs-day-cycle-lighting](skills/threejs-day-cycle-lighting) | Sunrise-to-sunset sun sweep driving every sun-aware shader; a sun that follows the lens |
| [threejs-ghibli-night-mode](skills/threejs-ghibli-night-mode) | Cross-faded night: painted moon, stars, Milky Way, shooting stars, moonlit water, cool grade |
| [threejs-night-lights-lanterns](skills/threejs-night-lights-lanterns) | Floating paper lanterns with text, fireflies, oil lamps, swinging boat lantern, cheap point lights |
| [threejs-webgl-rain-effect](skills/threejs-webgl-rain-effect) | Clear / rain / thunderstorm from one wetness value: GPU rain, rings, lightning, thunder, wet materials |

### Creatures & characters
| Skill | What it gives you |
|---|---|
| [threejs-fish-school-boids](skills/threejs-fish-school-boids) | Koi: shader-painted varieties, vertex swimming with matching shadows, calm boids, bioluminescence |
| [threejs-shell-fur-rendering](skills/threejs-shell-fur-rendering) | Instanced shell fur grown on a GLB body, LOD by distance |
| [threejs-skeletonless-character-animation](skills/threejs-skeletonless-character-animation) | Blinks, glances, head turns, a leaf in the wind — all in vertex shaders, no skeleton |

### Interaction, camera, UX
| Skill | What it gives you |
|---|---|
| [threejs-object-interaction](skills/threejs-object-interaction) | Hover ring, click-vs-drag, one-shot cinematic, a book that writes itself and flips real pages |
| [threejs-camera-guided-tour](skills/threejs-camera-guided-tour) | Hands-free camera journey on a time-parametrised Catmull-Rom path, day into night |
| [threejs-hud-objective-markers](skills/threejs-hud-objective-markers) | Game-style off-screen markers, fly-to arcs, minimal icon-dock HUD |
| [threejs-cinematic-loading-screen](skills/threejs-cinematic-loading-screen) | CSS dawn loading gate, captured still that fades into the live scene, shader warm-up |
| [threejs-webaudio-generative-soundtrack](skills/threejs-webaudio-generative-soundtrack) | An original waltz synthesised live with Web Audio, plus river and birdsong ambience |

### World & pipeline
| Skill | What it gives you |
|---|---|
| [threejs-open-world-streaming](skills/threejs-open-world-streaming) | A 600 m river world: water SDF, chunked terrain, tree pools, landmarks, distance culling |
| [threejs-blender-glb-pipeline](skills/threejs-blender-glb-pipeline) | Reference image → scene: asset contract, headless Blender agents, GLB export gotchas, Draco |
| [threejs-webgl-performance-profiling](skills/threejs-webgl-performance-profiling) | Honest GPU timing, pass budgets, compile hitches, culling, LOD |
| [threejs-headless-visual-verification](skills/threejs-headless-visual-verification) | Playwright + GPU capture of WebGL frames, shot lists, and the traps that give stale frames |

## Conventions

- Skill names are `threejs-<area>-<feature>` in kebab-case; the folder name equals the
  `name:` in the frontmatter.
- `{{double braces}}` in prompts are slots for your own scene (entry file, character,
  reference image …).
- `references/` holds trimmed code excerpts from the original scene. They show the
  technique; adapt uniform names and scene coupling to your project.

## Credits & disclaimer

"Ghibli-style" describes an aesthetic. This project is not affiliated with or endorsed by
Studio Ghibli, and it ships no Studio Ghibli assets, characters or music — the soundtrack
skill explicitly composes original music.

MIT licensed. Contributions and new pitfalls welcome.
