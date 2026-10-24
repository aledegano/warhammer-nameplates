// opentype.js's "main" is a UMD build without named exports under Node; import its ES module build directly.
declare module "opentype.js/dist/opentype.mjs" {
  export * from "opentype.js";
}
