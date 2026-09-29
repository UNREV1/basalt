// Letting phones and tablets on the same network reach Basalt's sync server.
//
// Basalt listens on every network address, but Windows Firewall blocks other
// devices from connecting unless Basalt is allowed (the prompt Windows shows the
// first time only covers "private" networks, and home Wi-Fi is often "public").
// allowThroughFirewall() adds an inbound rule for Basalt; Windows asks for
// permission once. Everything that syncs is end-to-end encrypted either way.

const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const RULE = "Basalt (devices on your network)";

/** Whether an inbound firewall rule for Basalt is in place (Windows; reading needs no permission). */
function firewallStatus() {
  if (process.platform !== "win32") return Promise.resolve({ needed: false, allowed: true });
  return new Promise((resolve) => {
    execFile("netsh", ["advfirewall", "firewall", "show", "rule", `name=${RULE}`], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
      resolve({ needed: true, allowed: !err && String(stdout).includes(RULE) });
    });
  });
}

/**
 * The script that gives this copy of the app one inbound rule that allows it.
 * First it clears the app's other inbound rules: dismissing Windows' own prompt
 * leaves block rules behind, and a block rule wins over an allow rule.
 */
function ruleScript(exe = process.execPath) {
  return [
    "@echo off",
    `netsh advfirewall firewall delete rule name=all dir=in program="${exe}" >nul 2>&1`,
    `netsh advfirewall firewall delete rule name="${RULE}" >nul 2>&1`,
    `netsh advfirewall firewall add rule name="${RULE}" dir=in action=allow program="${exe}" enable=yes profile=any`,
    "exit /b %errorlevel%",
    "",
  ].join("\r\n");
}

/** Allow other devices to connect to Basalt (Windows asks for permission). */
function allowThroughFirewall() {
  if (process.platform !== "win32") return Promise.resolve({ ok: true, message: "Nothing to allow on this system." });
  // The commands go in a script (no quoting through several shells), run with Windows' permission prompt.
  const file = path.join(os.tmpdir(), `basalt-firewall-${process.pid}.cmd`);
  try {
    fs.writeFileSync(file, ruleScript());
  } catch {
    return Promise.resolve({ ok: false, message: "Couldn't prepare the firewall change." });
  }
  const ps = `try { $p = Start-Process -FilePath '${file.replace(/'/g, "''")}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode } catch { exit 1223 }`;
  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  return new Promise((resolve) => {
    const done = (result) => {
      fs.rm(file, { force: true }, () => {});
      resolve(result);
    };
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], { windowsHide: true });
    child.on("error", () => done({ ok: false, message: "Couldn't start PowerShell to change the firewall." }));
    child.on("close", async (code) => {
      if (code === 1223) return done({ ok: false, message: "Windows didn't get permission, so nothing changed." });
      const { allowed } = await firewallStatus();
      done(
        allowed
          ? { ok: true, message: "Phones and tablets on your network can connect to Basalt now." }
          : { ok: false, message: `Windows Firewall didn't take the change (code ${code}).` },
      );
    });
  });
}

module.exports = { firewallStatus, allowThroughFirewall, ruleScript, RULE };
