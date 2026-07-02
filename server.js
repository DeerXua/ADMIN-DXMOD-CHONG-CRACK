import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5001;
const XOR_KEY = "DX_SECRET_KEY_2026_@#$";

// Paths
const LOCAL_SCRIPT = path.join(__dirname, "protected_script.lua");
const PARENT_SCRIPT = path.join(__dirname, "..", "protected_script.lua");
const SCRIPT_PATH = fs.existsSync(LOCAL_SCRIPT) ? LOCAL_SCRIPT : PARENT_SCRIPT;
const DB_PATH = path.join(__dirname, "..", "ADMIN-DXMOD", "data.json");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// XOR Encryption Helper
function encryptXOR(plaintext) {
  const data = Buffer.from(plaintext, "utf8");
  const key = Buffer.from(XOR_KEY, "utf8");
  const result = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result.toString("hex");
}

// Read ADMIN-DXMOD database in read-only mode
function readDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    return { devices: [] };
  }
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8").trim();
    if (!raw) return { devices: [] };
    return JSON.parse(raw);
  } catch (err) {
    console.error("[CORE-SERVER] Failed to read database:", err.message);
    return { devices: [] };
  }
}

function writeDatabase(db) {
  try {
    const tempPath = `${DB_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(tempPath, DB_PATH);
  } catch (err) {
    console.error("[CORE-SERVER] Failed to write database:", err.message);
  }
}

function findOrCreateDevice(gameId) {
  const targetId = String(gameId || "").trim();
  if (!targetId) return null;

  const db = readDatabase();
  const devices = db.devices || [];
  let device = devices.find(d => String(d.game_id || "").trim() === targetId);

  // Auto register if new UID connects
  if (!device) {
    const nextId = db.nextId || (devices.length > 0 ? Math.max(...devices.map(d => d.id || 0)) + 1 : 1);
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
    devices.push(device);
    db.nextId = nextId + 1;
    db.devices = devices;
    writeDatabase(db);
    console.log(`[CORE-SERVER] Registered new UID: "${targetId}" into data.json (status: pending)`);
  }

  return device;
}

function isDeviceActive(device) {
  if (!device || device.status !== "approved") return false;
  if (!device.expires_at) return true;
  return new Date(device.expires_at).getTime() > Date.now();
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
  const device = findDevice(uid);
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
  console.log(`  Read-only DB Path : ${DB_PATH}`);
  console.log(`  Script Payload    : ${SCRIPT_PATH}`);
  console.log("=================================================");
});
