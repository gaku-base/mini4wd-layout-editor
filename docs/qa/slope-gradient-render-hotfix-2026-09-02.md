# Slope gradient render hotfix (2026-09-02)

## Symptom
After PR #99, the slope disappeared in both the left parts palette preview and the placed course canvas.

## Cause
`assets/parts/slope-gradient.svg` embedded `slope.png` using nested `<image href="slope.png">` references. The browser could load the outer SVG as an image, but drawing that SVG through the editor Canvas path did not reliably render the nested raster image, leaving the slope transparent.

## Fix
Make `slope-gradient.svg` fully self-contained:
- no nested `<image>`
- no external `href`
- 54 x 36 viewBox retained
- three-lane guide lines retained
- low end is darker, high end is lighter
- no text, arrow, or icon

## Regression guard
`slope-gradient-visual.test.js` now rejects `<image>` and `href` in the gradient asset.
