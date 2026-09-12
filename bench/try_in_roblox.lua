-- Voxel Bench: the Try in Roblox place.
--
-- The Creator Store's Try in Roblox button opens a place and tells it which
-- asset to show, in the player's launch data:
--
--   {"creatorStoreAssetId": 132551778560812}
--
-- This script reads it, loads that obby, and runs it with the same runtime
-- every obby carries (bench/obby_runtime.lua), in a place made for it: the
-- spawn, hazards, movers, checkpoints, the void and the night lighting.
--
-- Setup, once:
--   1. A place with, in ServerScriptService, this Script (TryInRoblox) and a
--      ModuleScript named ObbyRuntime holding bench/obby_runtime.lua.
--   2. Optionally a DefaultAsset number attribute on this Script: the obby
--      shown when the place is opened directly, and in Studio, which never has
--      launch data.
--   3. Publish it, make it public, and put its place id in each obby's
--      Configure → Try in Roblox → Use custom experience.
--
-- One server shows one obby: the first player's decides it, which is how the
-- button is used — one person trying one asset.

local HttpService = game:GetService("HttpService")
local InsertService = game:GetService("InsertService")
local Players = game:GetService("Players")
local ServerScriptService = game:GetService("ServerScriptService")

local run = require(ServerScriptService:WaitForChild("ObbyRuntime"))

local loading = false

-- The asset the Creator Store asked for, if this player came from its button.
local function assetFrom(player)
	local ok, data = pcall(function()
		return player:GetJoinData().LaunchData
	end)
	if not ok or type(data) ~= "string" or data == "" then
		return nil
	end
	local decoded
	ok, decoded = pcall(HttpService.JSONDecode, HttpService, data)
	if not ok or type(decoded) ~= "table" then
		return nil
	end
	return tonumber(decoded.creatorStoreAssetId)
end

local function load(assetId)
	if loading or not assetId then
		return
	end
	loading = true

	local ok, container = pcall(InsertService.LoadAsset, InsertService, assetId)
	if not ok then
		warn(("Voxel Bench: could not load asset %s: %s"):format(tostring(assetId), tostring(container)))
		loading = false
		return
	end

	local course = container:FindFirstChildWhichIsA("Model")
	if not course then
		warn(("Voxel Bench: asset %s holds no model"):format(tostring(assetId)))
		container:Destroy()
		loading = false
		return
	end

	-- The obby brings its own copy of the runtime. This place runs one
	-- instead, so the copy goes before it is anywhere a script would start.
	for _, d in course:GetDescendants() do
		if d:IsA("Script") and d.Name == "ObbyRuntime" then
			d:Destroy()
		end
	end

	course.Parent = workspace
	container:Destroy()
	run(course)
end

local function arrive(player)
	load(assetFrom(player) or script:GetAttribute("DefaultAsset"))
end

Players.PlayerAdded:Connect(arrive)
for _, player in Players:GetPlayers() do
	task.spawn(arrive, player)
end
