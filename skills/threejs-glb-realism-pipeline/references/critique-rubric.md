# Realism Critique Rubric

Score each category 1–10 by looking at the screenshots (and reference photo if given). Be strict: 10 means indistinguishable from a photo at that view. Most first passes score 3–5.

| Category | What to look for |
|---|---|
| Lighting | Light direction plausible; soft bounce light; contact shadows where objects touch; no unexplained flat areas |
| Materials | Every surface reads as a real material; plausible albedo; roughness differs between materials; metals reflect environment |
| Imperfection | Wear, grime, stains, roughness variation; no perfectly uniform large surfaces |
| Geometry | Edges catch highlights (bevels); correct scale and proportions; no zero-thickness surfaces; no visible faceting on curves |
| Composition | Camera at believable height and FOV; clutter and variation; nothing obviously repeated |
| Rendering | Tone mapping and exposure natural; no aliasing, shadow acne, light leaks, z-fighting or texture stretching |

Overall = mean of the six, one decimal.

## Log format (append to realism/critique-log.md)

```markdown
## Iteration N — YYYY-MM-DD
Shots: realism/shots/iter-N/
Changes since last: <what was changed>

| Lighting | Materials | Imperfection | Geometry | Composition | Rendering | Overall |
|---|---|---|---|---|---|---|
| x | x | x | x | x | x | x.x |

Biggest giveaways (what makes it look fake, most visible first):
1. <specific observation with view name, e.g. "eye: racking uprights uniformly flat orange, no wear">
2. ...

Fixes for next iteration (max 3, each mapped to a knob):
1. <problem> → <config key / viewer param / Blender change with value>
2. ...

Assets used: <texture/HDRI names and sources>
```

## Rules
- Name the view each observation comes from.
- Describe what is visible, not what the code intends.
- Pick fixes by impact per effort. Lighting and materials usually come first.
- If the score didn't improve after a fix, say so and consider reverting.
