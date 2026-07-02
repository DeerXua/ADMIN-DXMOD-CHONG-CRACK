import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5001;
const XOR_KEY = "DX_SECRET_KEY_2026_@#$";

const LOCAL_SCRIPT = path.join(__dirname, "protected_script.lua");
const PARENT_SCRIPT = path.join(__dirname, "..", "protected_script.lua");
const SCRIPT_PATH = fs.existsSync(LOCAL_SCRIPT) ? LOCAL_SCRIPT : PARENT_SCRIPT;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Candidate DB Paths to find the real ADMIN-DXMOD data.json
const DB_CANDIDATES = [
  process.env.DB_PATH,
  path.join(__dirname, "..", "ADMIN-DXMOD", "data.json"),
  path.join(__dirname, "..", "TOOL-PAK-DX", "ADMIN-DXMOD", "data.json"),
  "/root/ADMIN-DXMOD/data.json",
  "/root/TOOL-PAK-DX/ADMIN-DXMOD/data.json",
  "/root/TOOL-PAK-DX/data.json",
  "/root/data.json",
  "c:\\ExtractedPak\\TOOL PAK DX\\ADMIN-DXMOD\\data.json"
].filter(Boolean);

function readAllDevices() {
  const allDevices = [];
  for (const p of DB_CANDIDATES) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, "utf8").trim();
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.devices && Array.isArray(parsed.devices)) {
            for (const dev of parsed.devices) {
              allDevices.push({ ...dev, _sourcePath: p });
            }
          }
        }
      } catch (err) {}
    }
  }
  return allDevices;
}

function findOrCreateDevice(gameId) {
  const targetId = String(gameId || "").trim();
  if (!targetId) return null;

  const devices = readAllDevices();
  // Prefer an approved device if multiple exist across data.json files
  let approvedDevice = devices.find(d => 
    String(d.game_id || d.gameId || d.uid || "").trim() === targetId &&
    String(d.status || "").toLowerCase() === "approved"
  );
  if (approvedDevice) return approvedDevice;

  let device = devices.find(d => 
    String(d.game_id || d.gameId || d.uid || "").trim() === targetId
  );

  // Auto register if new UID connects
  if (!device) {
    const primaryPath = DB_CANDIDATES.find(p => fs.existsSync(p)) || path.join(__dirname, "..", "ADMIN-DXMOD", "data.json");
    try {
      let db = { devices: [] };
      if (fs.existsSync(primaryPath)) {
        db = JSON.parse(fs.readFileSync(primaryPath, "utf8"));
      }
      const existing = db.devices || [];
      const nextId = db.nextId || (existing.length > 0 ? Math.max(...existing.map(d => d.id || 0)) + 1 : 1);
      const nowIso = new Date().toISOString();
      device = {
        id: nextId,
        game_id: targetId,
        label: `Device ${targetId}`,
        status: "pending",
        expires_at: null,
        note: "Tự động đăng ký từ Game Client",
        first_seen_at: nowIso,
        updated_at: nowIso
      };
      existing.push(device);
      db.nextId = nextId + 1;
      db.devices = existing;
      fs.writeFileSync(primaryPath, JSON.stringify(db, null, 2), "utf8");
      console.log(`[CORE-SERVER] Registered new UID: "${targetId}" into data.json at ${primaryPath} (status: pending)`);
    } catch (err) {
      console.error("[CORE-SERVER] Auto-register error:", err.message);
    }
  }

  return device;
}

function isDeviceActive(device) {
  if (!device) return false;
  const status = String(device.status || "").toLowerCase();
  if (status !== "approved" && status !== "active" && status !== "success") return false;
  const exp = device.expires_at || device.expiresAt || device.expire_time;
  if (!exp) return true; // Permanent VIP
  return new Date(exp).getTime() > Date.now();
}

// ----------------------------------------------------------------
// ENDPOINT: POST /api/check (Main Check & Payload Delivery)
// ----------------------------------------------------------------
app.post("/api/check", (req, res) => {
  const uid = String(req.body.uid || req.body.gameId || "").trim();
  const method = req.body.method || "check";
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] Request /api/check - UID: "${uid}", Method: "${method}"`);

  if (!uid) {
    return res.status(400).json({
      status: "error",
      active: false,
      expire_time: null,
      message: "UID parameter is required",
      payload: null
    });
  }

  const device = findOrCreateDevice(uid);
  const active = isDeviceActive(device);

  if (!active) {
    const reason = !device
      ? "UID chưa được đăng ký / UID not registered"
      : device.status === "blocked"
      ? "UID đã bị chặn / UID blocked"
      : device.status === "pending"
      ? "UID chờ Admin duyệt / UID pending approval"
      : "Giấy phép đã hết hạn / License expired";

    console.log(`[${timestamp}] DENIED UID: "${uid}" - Reason: ${reason}`);
    return res.json({
      status: "error",
      active: false,
      expire_time: device?.expires_at || null,
      message: reason,
      payload: null
    });
  }

  // Active user -> Encrypt and return protected core script
  let payloadHex = null;
  try {
    if (fs.existsSync(SCRIPT_PATH)) {
      const scriptContent = fs.readFileSync(SCRIPT_PATH, "utf8");
      payloadHex = encryptXOR(scriptContent);
    } else {
      console.error(`[CORE-SERVER] Protected script not found at: ${SCRIPT_PATH}`);
    }
  } catch (err) {
    console.error(`[CORE-SERVER] Error reading/encrypting script: ${err.message}`);
  }

  console.log(`[${timestamp}] APPROVED & DELIVERED PAYLOAD UID: "${uid}" (${payloadHex ? payloadHex.length : 0} hex bytes)`);

  return res.json({
    status: "success",
    active: true,
    expire_time: device.expires_at || null,
    message: "Kích hoạt thành công VIP / Activated VIP",
    payload: payloadHex
  });
});

// ----------------------------------------------------------------
// ENDPOINT: GET /api/check (GET Variant for testing)
// ----------------------------------------------------------------
app.get("/api/check", (req, res) => {
  const uid = String(req.query.uid || req.query.gameId || "").trim();
  const device = findOrCreateDevice(uid);
  const active = isDeviceActive(device);
  return res.json({
    status: active ? "success" : "error",
    active: active,
    expire_time: device?.expires_at || null,
    message: active ? "VIP Activated" : "Not Approved"
  });
});

// Start Server
app.listen(PORT, () => {
  console.log("=================================================");
  console.log(`  STANDALONE CORE PAYLOAD SERVER RUNNING ON PORT ${PORT}`);
  console.log(`  Scanning DB Paths : ${DB_CANDIDATES.join(", ")}`);
  console.log(`  Script Payload    : ${SCRIPT_PATH}`);
  console.log("=================================================");
});
