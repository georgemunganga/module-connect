import fs from "node:fs";
import ts from "typescript";

async function readRegistry(path) {
  const source = fs.readFileSync(path, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputText).toString("base64")}`
  );
}
const { canonicalRoutes } = await readRegistry("src/data/modules.ts");
const { settingsRoutes } = await readRegistry("src/data/settings.ts");
const routes = [...canonicalRoutes, ...settingsRoutes];
const unique = [
  ...new Map(routes.map((route) => [route.path, route])).values(),
];
fs.mkdirSync("public", { recursive: true });
fs.writeFileSync(
  "public/manus-routes.json",
  `${JSON.stringify({ routes: unique }, null, 2)}\n`,
);
console.log(`Generated ${unique.length} canonical page routes.`);
