import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputDirectory = path.join(repositoryRoot, "dist");
const source = path.join(repositoryRoot, "index.html");
const output = path.join(outputDirectory, "index.html");

const entries = await readdir(outputDirectory, { withFileTypes: true });
if (
  entries.length !== 1 ||
  entries[0].name !== "index.html" ||
  !entries[0].isFile()
) {
  throw new Error("dist must contain exactly one regular file: index.html");
}

const outputMetadata = await lstat(output);
if (outputMetadata.isSymbolicLink()) {
  throw new Error("dist/index.html must not be a symbolic link");
}

const [sourceContents, outputContents] = await Promise.all([
  readFile(source),
  readFile(output),
]);
if (outputContents.length === 0) {
  throw new Error("dist/index.html must not be empty");
}

const digest = (contents) =>
  createHash("sha256").update(contents).digest("hex");
const sourceDigest = digest(sourceContents);
const outputDigest = digest(outputContents);
if (sourceDigest !== outputDigest) {
  throw new Error("dist/index.html does not exactly match index.html");
}

console.log(`Validated one publishable asset (sha256: ${outputDigest}).`);
