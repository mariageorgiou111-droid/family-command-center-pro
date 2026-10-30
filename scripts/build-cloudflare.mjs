import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const source = path.join(repositoryRoot, "index.html");
const outputDirectory = path.join(repositoryRoot, "dist");
const output = path.join(outputDirectory, "index.html");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(source, output, { force: false, errorOnExist: true });

console.log("Built dist/index.html from index.html.");
