import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../src/main.jsx", import.meta.url),
  "utf8",
);
const design = fs.readFileSync(
  new URL("../docs/roadmap/BASIC-SEARCH-PILOT-DESIGN.md", import.meta.url),
  "utf8",
);

for (const locale of ["en", "es", "ro"]) {
  assert.match(source, new RegExp(`\\b${locale}\\s*:\\s*\\{`));
}

for (const required of [
  "Basic Search preview",
  "Vista previa de búsqueda básica",
  "Previzualizare Basic Search",
  "No simulated matches are shown.",
  "External discovery provider not activated",
  "Actual results require TinEye commercial activation",
  "Search variants",
  "Variantes de búsqueda",
  "Variante de căutare",
  "Submit a page for review",
  "Trimite pagina pentru verificare",
  "reportedUrlHelp",
  "Pagină publică pentru verificare",
  'data.pilotMode === "free" && imageAssetCount > 0',
]) {
  assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));
}

for (const required of [
  "Do not unlock the current `/api/scans` route in the free pilot.",
  "no external image search, billing or notice delivery",
  "No result is labelled “verified”",
]) {
  assert.match(design, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));
}

console.log("Basic Search preview guard: passed");
