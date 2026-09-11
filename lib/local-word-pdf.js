import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const runFile = promisify(execFile);
// Serialize native Office automation: concurrent Word instances can block
// each other on their shared profile. All files stay on this computer.
let pendingConversion = Promise.resolve();
export function convertWordToPdf(docxBytes) {
  const next = pendingConversion.then(() => convert(docxBytes));
  pendingConversion = next.catch(() => {});
  return next;
}

async function convert(docxBytes) {
  const tempRoot = join(tmpdir(), "rover-resume-pdf");
  await mkdir(tempRoot, { recursive: true });
  const directory = await mkdtemp(join(tempRoot, "export-"));
  const input = join(directory, "resume.docx");
  const output = join(directory, "resume.pdf");
  try {
    await writeFile(input, docxBytes);
    if (process.platform === "win32") {
      const script = `$ErrorActionPreference = 'Stop'
$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.AutomationSecurity = 3
  $document = $word.Documents.Open($env:ROVER_TEMPLATE_INPUT, $false, $true)
  $document.ExportAsFixedFormat($env:ROVER_TEMPLATE_OUTPUT, 17)
} finally {
  if ($null -ne $document) { $document.Close(0) }
  if ($null -ne $word) { $word.Quit() }
}`;
      await runFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
        windowsHide: true, timeout: 90000, maxBuffer: 1024 * 1024,
        env: { ...process.env, ROVER_TEMPLATE_INPUT: input, ROVER_TEMPLATE_OUTPUT: output },
      });
    } else {
      await runFile("soffice", ["--headless", "--convert-to", "pdf", "--outdir", directory, input], { timeout: 90000, maxBuffer: 1024 * 1024 });
    }
    const bytes = await readFile(output);
    if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Invalid local PDF output.");
    return bytes;
  } catch (error) {
    throw new Error("Word/PDF format matching requires the local Word renderer (or LibreOffice on Linux/macOS). Please retry the PDF download.", { cause: error });
  } finally {
    const cleanupPath = resolve(directory);
    if (dirname(cleanupPath) === resolve(tempRoot) && basename(cleanupPath).startsWith("export-")) {
      await rm(cleanupPath, { recursive: true, force: true }).catch(() => {});
    }
  }
}
