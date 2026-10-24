# TypeScript + manifold-3d geometry core shared by CLI and web app

Nameplate geometry is built in TypeScript with manifold-3d (WASM) for solid modelling and opentype.js for glyph outlines, so the same core runs in Node for the CLI today and in the browser for a future live-preview web app.

## Considered Options

- **OpenSCAD**: fastest path to a first STL, but openscad-wasm is too slow for interactive preview and awkward to drive from a UI.
- **Python (build123d / CadQuery)**: stronger CAD kernel, but no practical browser runtime; the web app would need a server or a rewrite.
