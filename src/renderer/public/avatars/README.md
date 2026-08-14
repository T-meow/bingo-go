# Bingo Go avatar assets

The eight legacy portrait ids (`emi`, `kenji`, `sora`, `mika`, `taro`,
`jin`, `kai`, and `rio`) remain stable for existing Team blueprints and task
snapshots.

`identicon-01` through `identicon-12` are deterministic 256x256 PNGs generated
by `scripts/generate-identicons.mjs`. The generator uses fixed `bingo:<id>:v1`
seeds, fixed color palettes, and a mirrored 5x5 cell grid; it does not use a
network service. Regenerate both copies and verify their hashes with:

```text
node scripts/generate-identicons.mjs src/renderer/public/avatars ../bingo/assets/avatars
node scripts/verify-avatar-assets.mjs
```

All files in this directory are dedicated to the public domain under CC0 1.0.
