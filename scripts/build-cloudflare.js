#!/usr/bin/env node
import { execSync } from "child_process";

try {
  // Check if cargo is available
  execSync("cargo --version", { stdio: "pipe" });
  console.log("✓ Cargo found, running full build...");
  execSync("npm run build", { stdio: "inherit" });
} catch (error) {
  console.log(
    "⚠ Cargo not found, running web-only build for Cloudflare...",
  );
  execSync("npm run build:web", { stdio: "inherit" });
}
