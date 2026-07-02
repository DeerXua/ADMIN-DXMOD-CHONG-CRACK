let allDevices = [];
let selectedDeviceGameId = null;

document.addEventListener("DOMContentLoaded", () => {
  fetchDevices();

  document.getElementById("refreshBtn").addEventListener("click", fetchDevices);
  document.getElementById("searchInput").addEventListener("input", renderTable);
  document.getElementById("statusFilter").addEventListener("change", renderTable);

  // Approve modal events
  document.querySelectorAll(".modal-close, #cancelApproveBtn").forEach(el => {
    el.addEventListener("click", () => closeModal("approveModal"));
  });
  document.getElementById("confirmApproveBtn").addEventListener("click", handleConfirmApprove);

  // Add modal events
  document.getElementById("addDeviceBtn").addEventListener("click", () => openModal("addModal"));
  document.querySelectorAll(".modal-close, #cancelAddBtn").forEach(el => {
    el.addEventListener("click", () => closeModal("addModal"));
  });
  document.getElementById("confirmAddBtn").addEventListener("click", handleConfirmAdd);
});

async function fetchDevices() {
  try {
    const res = await fetch("/api/admin/devices");
    const data = await res.json();
    if (data.status === "success") {
      allDevices = data.devices || [];
      updateStats(data.stats || {});
      renderTable();
    }
  } catch (err) {
    console.error("Lỗi tải danh sách UID:", err);
  }
}

function updateStats(stats) {
  document.getElementById("statTotal").innerText = stats.total || 0;
  document.getElementById("statApproved").innerText = stats.approved || 0;
  document.getElementById("statPending").innerText = stats.pending || 0;
  document.getElementById("statBlocked").innerText = stats.blocked || 0;
}

function renderTable() {
  const searchVal = document.getElementById("searchInput").value.toLowerCase().trim();
  const filterVal = document.getElementById("statusFilter").value;
  const tbody = document.getElementById("deviceTableBody");

  const filtered = allDevices.filter(d => {
    const matchesSearch = String(d.game_id || "").toLowerCase().includes(searchVal) ||
                          String(d.label || "").toLowerCase().includes(searchVal) ||
                          String(d.note || "").toLowerCase().includes(searchVal);
    const matchesStatus = (filterVal === "all") || (d.status === filterVal);
    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 30px; color: #94a3b8;">Không tìm thấy UID nào tương ứng.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(d => {
    const statusClass = d.status === "approved" ? "badge-approved" : (d.status === "pending" ? "badge-pending" : "badge-blocked");
    const statusText = d.status === "approved" ? "VIP ACTIVE" : (d.status === "pending" ? "CHỜ DUYỆT" : "ĐÃ KHÓA");
    
    let expireStr = "Không giới hạn";
    if (d.expires_at) {
      expireStr = new Date(d.expires_at).toLocaleString("vi-VN");
    }
    let firstSeenStr = d.first_seen_at ? new Date(d.first_seen_at).toLocaleString("vi-VN") : "-";

    return `
      <tr>
        <td>#${d.id}</td>
        <td class="uid-cell">${d.game_id}</td>
        <td>${d.label || d.note || "Khách Hàng"}</td>
        <td><span class="badge ${statusClass}">${statusText}</span></td>
        <td>${expireStr}</td>
        <td>${firstSeenStr}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-success" onclick="openApproveModal('${d.game_id}')">✅ Duyệt VIP</button>
            ${d.status !== "blocked" ? `<button class="btn btn-danger" onclick="blockDevice('${d.game_id}')">🚫 Khóa</button>` : `<button class="btn btn-secondary" onclick="unblockDevice('${d.game_id}')">🔓 Bỏ Khóa</button>`}
            <button class="btn btn-secondary" onclick="deleteDevice('${d.game_id}')">🗑️ Xóa</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function openApproveModal(gameId) {
  selectedDeviceGameId = gameId;
  document.getElementById("modalApproveUid").innerText = gameId;
  openModal("approveModal");
}

async function handleConfirmApprove() {
  if (!selectedDeviceGameId) return;
  const days = document.getElementById("durationSelect").value;
  const note = document.getElementById("modalApproveNote").value;

  try {
    const res = await fetch("/api/admin/devices/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: selectedDeviceGameId, days: Number(days), note: note })
    });
    const data = await res.json();
    if (data.status === "success") {
      closeModal("approveModal");
      fetchDevices();
    } else {
      alert("Lỗi duyệt UID: " + data.message);
    }
  } catch (err) {
    alert("Không thể kết nối Server!");
  }
}

async function blockDevice(gameId) {
  if (!confirm(`Bạn có chắc chắn muốn KHÓA UID ${gameId} không?`)) return;
  try {
    const res = await fetch("/api/admin/devices/block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: gameId })
    });
    const data = await res.json();
    if (data.status === "success") fetchDevices();
  } catch (err) {
    alert("Lỗi kết nối Server!");
  }
}

async function unblockDevice(gameId) {
  openApproveModal(gameId);
}

async function deleteDevice(gameId) {
  if (!confirm(`Bạn có chắc muốn XÓA hẳn UID ${gameId} khỏi danh sách?`)) return;
  try {
    const res = await fetch("/api/admin/devices/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: gameId })
    });
    const data = await res.json();
    if (data.status === "success") fetchDevices();
  } catch (err) {
    alert("Lỗi kết nối Server!");
  }
}

async function handleConfirmAdd() {
  const gameId = document.getElementById("addGameId").value.trim();
  const label = document.getElementById("addLabel").value.trim();
  const days = document.getElementById("addDuration").value;

  if (!gameId) {
    alert("Vui lòng nhập Game UID!");
    return;
  }

  try {
    const res = await fetch("/api/admin/devices/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: gameId, label: label, days: Number(days) })
    });
    const data = await res.json();
    if (data.status === "success") {
      closeModal("addModal");
      document.getElementById("addGameId").value = "";
      document.getElementById("addLabel").value = "";
      fetchDevices();
    } else {
      alert("Lỗi thêm UID: " + data.message);
    }
  } catch (err) {
    alert("Không thể kết nối Server!");
  }
}

function openModal(id) {
  document.getElementById(id).classList.add("show");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("show");
}
