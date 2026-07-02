import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5001;
const XOR_KEY = "DX_SECRET_KEY_2026_@#$";

// Standalone Core DB Path for Port 5001 Web Admin
const DB_PATH = path.join(__dirname, "data.json");

const LOCAL_SCRIPT = path.join(__dirname, "protected_script.lua");
const PARENT_SCRIPT = path.join(__dirname, "..", "protected_script.lua");
const SCRIPT_PATH = fs.existsSync(LOCAL_SCRIPT) ? LOCAL_SCRIPT : PARENT_SCRIPT;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Web Admin UI Static Files
app.use(express.static(path.join(__dirname, "public")));

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

// Read database
function readDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    return { nextId: 1, devices: [] };
  }
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8").trim();
    if (!raw) return { nextId: 1, devices: [] };
    return JSON.parse(raw);
  } catch (err) {
    console.error("[CORE-SERVER] Failed to read database:", err.message);
    return { nextId: 1, devices: [] };
  }
}

// Write database atomically
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
  if (!device) return false;
  const status = String(device.status || "").toLowerCase();
  if (status !== "approved" && status !== "active") return false;
  if (!device.expires_at) return true; // Permanent
  return new Date(device.expires_at).getTime() > Date.now();
}

// ====================================================================
// WEB ADMIN API ENDPOINTS (PORT 5001)
// ====================================================================

// GET / - Serve Web Admin Page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// GET /api/admin/devices - Get device list & stats
app.get("/api/admin/devices", (req, res) => {
  const db = readDatabase();
  const devices = db.devices || [];

  const stats = {
    total: devices.length,
    approved: devices.filter(d => d.status === "approved" && isDeviceActive(d)).length,
    pending: devices.filter(d => d.status === "pending").length,
    blocked: devices.filter(d => d.status === "blocked").length
  };

  return res.json({ status: "success", stats: stats, devices: devices });
});

// POST /api/admin/devices/approve - Approve device with days duration
app.post("/api/admin/devices/approve", (req, res) => {
  const { game_id, days, note } = req.body;
  if (!game_id) return res.json({ status: "error", message: "Missing game_id" });

  const db = readDatabase();
  const devices = db.devices || [];
  const device = devices.find(d => String(d.game_id).trim() === String(game_id).trim());

  if (!device) return res.json({ status: "error", message: "UID not found" });

  const numDays = Number(days) || 30;
  let expiresAt = null;
  if (numDays < 9999) {
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + numDays);
    expiresAt = expDate.toISOString();
  }

  device.status = "approved";
  device.expires_at = expiresAt;
  if (note) device.note = note;
  device.updated_at = new Date().toISOString();

  writeDatabase(db);
  console.log(`[CORE-SERVER ADMIN] APPROVED UID: "${game_id}" for ${numDays} days`);
  return res.json({ status: "success", message: "Duyệt VIP thành công!", device: device });
});

// POST /api/admin/devices/block - Block device
app.post("/api/admin/devices/block", (req, res) => {
  const { game_id } = req.body;
  if (!game_id) return res.json({ status: "error", message: "Missing game_id" });

  const db = readDatabase();
  const devices = db.devices || [];
  const device = devices.find(d => String(d.game_id).trim() === String(game_id).trim());

  if (!device) return res.json({ status: "error", message: "UID not found" });

  device.status = "blocked";
  device.updated_at = new Date().toISOString();

  writeDatabase(db);
  console.log(`[CORE-SERVER ADMIN] BLOCKED UID: "${game_id}"`);
  return res.json({ status: "success", message: "Khóa UID thành công!", device: device });
});

// POST /api/admin/devices/delete - Delete device
app.post("/api/admin/devices/delete", (req, res) => {
  const { game_id } = req.body;
  if (!game_id) return res.json({ status: "error", message: "Missing game_id" });

  const db = readDatabase();
  db.devices = (db.devices || []).filter(d => String(d.game_id).trim() !== String(game_id).trim());

  writeDatabase(db);
  console.log(`[CORE-SERVER ADMIN] DELETED UID: "${game_id}"`);
  return res.json({ status: "success", message: "Xóa UID thành công!" });
});

// POST /api/admin/devices/add - Add device manually
app.post("/api/admin/devices/add", (req, res) => {
  const { game_id, label, days } = req.body;
  if (!game_id) return res.json({ status: "error", message: "Missing game_id" });

  const db = readDatabase();
  const devices = db.devices || [];
  const targetId = String(game_id).trim();

  let device = devices.find(d => String(d.game_id).trim() === targetId);

  const numDays = Number(days) || 30;
  let expiresAt = null;
  if (numDays < 9999) {
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + numDays);
    expiresAt = expDate.toISOString();
  }

  const nowIso = new Date().toISOString();

  if (device) {
    device.status = "approved";
    device.expires_at = expiresAt;
    if (label) device.label = label;
    device.updated_at = nowIso;
  } else {
    const nextId = db.nextId || (devices.length > 0 ? Math.max(...devices.map(d => d.id || 0)) + 1 : 1);
    device = {
      id: nextId,
      game_id: targetId,
      label: label || `Device ${targetId}`,
      status: "approved",
      expires_at: expiresAt,
      note: "Thêm thủ công từ Web Admin 5001",
      first_seen_at: nowIso,
      updated_at: nowIso
    };
    devices.push(device);
    db.nextId = nextId + 1;
  }

  db.devices = devices;
  writeDatabase(db);
  console.log(`[CORE-SERVER ADMIN] ADDED & APPROVED UID: "${targetId}"`);
  return res.json({ status: "success", message: "Thêm mới và duyệt VIP thành công!", device: device });
});

// ====================================================================
// PUBG MOBILE CLIENT API ENDPOINTS (POST /api/check)
// ====================================================================
app.post("/api/check", (req, res) => {
  const uid = String(req.body.uid || req.body.gameId || "").trim();
  const method = String(req.body.method || "check").trim();
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] Request /api/check - UID: "${uid}", Method: "${method}"`);

  if (!uid) {
    return res.json({
      status: "error",
      active: false,
      message: "Missing Game UID",
      payload: null
    });
  }

  const device = findOrCreateDevice(uid);
  const active = isDeviceActive(device);

  if (!active) {
    const reason = !device ? "UID chưa được đăng ký" : (device.status === "blocked" ? "UID bị khóa" : "UID chờ Admin duyệt");
    console.log(`[${timestamp}] DENIED UID: "${uid}" - Reason: ${reason}`);
    return res.json({
      status: "error",
      active: false,
      expire_time: device?.expires_at || null,
      message: `${reason} / ${device?.status || "pending"}`,
      payload: null
    });
  }

  if (!fs.existsSync(SCRIPT_PATH)) {
    console.error(`[${timestamp}] ERROR: Protected script not found at ${SCRIPT_PATH}`);
    return res.json({
      status: "error",
      active: false,
      message: "Payload file missing on server",
      payload: null
    });
  }

  try {
    const rawScript = fs.readFileSync(SCRIPT_PATH, "utf8");
    const encryptedPayload = encryptXOR(rawScript);

    console.log(`[${timestamp}] APPROVED & DELIVERED PAYLOAD UID: "${uid}" (${encryptedPayload.length / 2} bytes)`);

    return res.json({
      status: "success",
      active: true,
      expire_time: device.expires_at || null,
      message: "VIP Approved & Protected Payload Delivered",
      payload: encryptedPayload
    });
  } catch (err) {
    console.error(`[${timestamp}] ERROR reading script payload:`, err.message);
    return res.json({
      status: "error",
      active: false,
      message: "Internal Server Error",
      payload: null
    });
  }
});

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

// Start Standalone Core Web Admin Server
app.listen(PORT, () => {
  console.log("=================================================");
  console.log(`  STANDALONE CORE WEB ADMIN SERVER ON PORT ${PORT}`);
  console.log(`  Web Admin URL  : http://localhost:${PORT}`);
  console.log(`  Database File  : ${DB_PATH}`);
  console.log(`  Script Payload : ${SCRIPT_PATH}`);
  console.log("=================================================");
});
