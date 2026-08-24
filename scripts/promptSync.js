// Imports
import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import os from "node:os";
import {spawnSync} from "node:child_process";
import {fetchPrompt, createPromptVersion} from "../src/promptFetcher.js";

// ESM path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Maps Langfuse prompt name to its local file
const PROMPT_FILES = {
    GuiDo: path.join(__dirname, "..", "promptGuiDo.md"),
    Guindex: path.join(__dirname, "..", "promptGuindex.md"),
};

// Downloads prompt and write to local file
const pull = async (name) => {
    const promptFile = PROMPT_FILES[name];

    // Read current local content before overwriting
    let localContent = null;
    try {
        localContent = readFileSync(promptFile, "utf-8");
    } catch {
        // File doesn't exist yet — skip diff
    }

    const {prompt, version} = await fetchPrompt(name);

    // Show diff between local and production
    if (localContent !== null) {
        const tmpOld = path.join(os.tmpdir(), "promptOld.md");
        const tmpNew = path.join(os.tmpdir(), "promptNew.md");
        writeFileSync(tmpOld, localContent);
        writeFileSync(tmpNew, prompt);
        const result = spawnSync("diff", ["-u", tmpOld, tmpNew], {
            stdio: "inherit",
        });
        if (result.status === 0) console.log("(no changes)");
    }

    writeFileSync(promptFile, prompt);
    console.log(`Pulled version ${version} to ${path.basename(promptFile)}`);
};

// Push: upload the local file to Langfuse as a new version (not production)
const push = async (name) => {
    const promptFile = PROMPT_FILES[name];
    const content = readFileSync(promptFile, "utf-8");
    const version = await createPromptVersion(name, content);
    console.log(`Pushed ${path.basename(promptFile)} as version ${version} (not production)`);
};

// Run for every prompt based on command-line argument
const command = process.argv[2];
if (command === "pull" || command === "push") {
    for (const name of Object.keys(PROMPT_FILES)) {
        if (command === "pull") await pull(name);
        else await push(name);
    }
} else {
    console.error("Usage: node scripts/promptSync.js pull|push");
}