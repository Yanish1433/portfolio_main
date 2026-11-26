// Zero-dependency resolve hook so Node can run our TypeScript sources directly.
//  - maps the "@/" alias to src/
//  - adds ".ts" or "/index.ts" to extensionless relative imports
// Usage: node --no-warnings --import ./scripts/ts-resolve.mjs --test "src/**/*.test.ts"
import { registerHooks } from "node:module";
import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcUrl = new URL("../src/", import.meta.url);

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base;
    if (specifier.startsWith("@/")) {
      base = new URL(specifier.slice(2), srcUrl);
    } else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
      base = new URL(specifier, context.parentURL);
    }
    if (base) {
      const path = fileURLToPath(base);
      for (const candidate of [path, `${path}.ts`, `${path}/index.ts`]) {
        if (isFile(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
