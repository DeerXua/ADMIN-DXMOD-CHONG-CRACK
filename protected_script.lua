-- =========================================================================================
-- STANDALONE CORE PAYLOAD (ULTRA-FAST ZERO-LAG VIP ALGORITHMS) - PORT 5001
-- =========================================================================================
print("[CORE-SERVER] Loading VIP Anti-Crack Core Algorithms...")

-- ---------------------------------------------------------
-- 1. SPOOFER ALGORITHMS
-- ---------------------------------------------------------
function _G.DX_Secret_GetHWID()
    return "DX_HWID_" .. tostring(os.time())
end

function _G.DX_Secret_GetDataOS()
    return "DX_DATAOS_SECURE_2026"
end

-- ---------------------------------------------------------
-- 2. WALLHACK MESH DYEING ALGORITHM
-- ---------------------------------------------------------
local WALL_COLOR_PRESETS = {
    [1] = {3.5, 3.5, 3.5, 1.0},
    [2] = {3.5, 0.0, 0.0, 1.0},
    [3] = {3.5, 3.15, 0.0, 1.0},
    [4] = {0.0, 3.5, 0.0, 1.0},
    [5] = {0.0, 3.5, 3.15, 1.0},
    [6] = {0.0, 0.0, 3.5, 1.0},
    [7] = {0.829, 0.229, 3.829, 1.0},
    [8] = {3.5, 0.0, 2.1, 1.0},
    [9] = {0.0, 0.0, 0.0, 1.0},
}

local function AuraColor(r, g, b, a)
    if FLinearColor then return FLinearColor(r, g, b, a) end
    return {R=r, G=g, B=b, A=a, r=r, g=g, b=b, a=a}
end

local function GetWallColorByIndex(idx)
    local p = WALL_COLOR_PRESETS[idx] or WALL_COLOR_PRESETS[3]
    return AuraColor(p[1], p[2], p[3], 1.0)
end

function _G.DX_Secret_ApplyAuraToMeshComponent(mesh, visibleColor, occludedColor)
    if not mesh or not slua or not slua.isValid or not slua.isValid(mesh) then return end
    if mesh.WallhackApplied then return end
    mesh.WallhackApplied = true
    pcall(function()
        if mesh.SetDrawDyeing then mesh:SetDrawDyeing(true) end
        if mesh.SetDrawDyeingMode then mesh:SetDrawDyeingMode(1) end
        if visibleColor and mesh.SetVisibleDyeingColor then mesh:SetVisibleDyeingColor(visibleColor) end
        if occludedColor and mesh.SetOccludedDyeingColor then mesh:SetOccludedDyeingColor(occludedColor) end
        if mesh.SetDyeingColorFadeDistance then mesh:SetDyeingColorFadeDistance(99999.0) end
        if mesh.SetDyeingColorMinMaxDistance then mesh:SetDyeingColorMinMaxDistance(0.0, 99999.0) end
        if mesh.SetDrawHighlight then mesh:SetDrawHighlight(true) end
        if mesh.SetRenderCustomDepth then mesh:SetRenderCustomDepth(true) end
        if mesh.SetCustomDepthStencilValue then mesh:SetCustomDepthStencilValue(255) end
    end)
end

_G.ApplyAuraToMeshComponent = _G.DX_Secret_ApplyAuraToMeshComponent

-- Mark Core Loaded flag
_G.DX_CoreLoaded = true
print("[CORE-SERVER] [✓] VIP Core Algorithms Active & Direct Pointer Bound!")
