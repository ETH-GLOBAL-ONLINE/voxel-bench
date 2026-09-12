-- Voxel Bench: what makes this model an obby and not a row of props.
--
-- The course was put together from recipes, and each piece was given a role.
-- Studio shows the pieces as the models inside this one; this script reads
-- their names and gives each role its behaviour:
--
--   Start_*       every character appears here, facing the course
--   Checkpoint_*  touch it and you come back here instead of the start
--   Kill_*        touch it and you go back to your checkpoint
--   Mover_*       slides from side to side and carries whoever stands on it
--   Finish_*      touch it and you have finished, with your time
--
-- Falling below the course sends you back to your checkpoint too. Path_* and
-- Scenery_* have no behaviour: they are there to be stood on and looked at.
--
-- On Play the course lifts itself twenty studs over whatever it was dropped
-- on, lays a black void under it, and turns the place to night with a light
-- over each piece. Set the model's Night attribute to false to keep the
-- place's own lighting.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local course = script.Parent

local MOVE_DISTANCE = 4 -- studs either side of where a mover was placed
local MOVE_PERIOD = 5 -- seconds for one swing there and back
local RESPAWN_TIME = 1.5 -- an obby is a game of retries

Players.RespawnTime = math.min(Players.RespawnTime, RESPAWN_TIME)

local byRole = {}
for _, child in course:GetChildren() do
	if child:IsA("Model") then
		local role = child.Name:match("^(%a+)_")
		if role then
			byRole[role] = byRole[role] or {}
			table.insert(byRole[role], child)
		end
	end
end

local function partsOf(model)
	local parts = {}
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			table.insert(parts, d)
		end
	end
	return parts
end

-- The course was laid out well above the ground, but Studio drops a model
-- where it is let go, resting on whatever is under it, so that height does
-- not survive the import. Put the drop back: if the ground is nearer than
-- CLEARANCE below the lowest piece of the course itself — scenery stands on
-- the ground by design and does not count — raise the whole model until it
-- is not. Done first, before anything remembers where a piece is.
local CLEARANCE = 20 -- studs of air under the lowest piece
-- The box of the pieces themselves, taken before the void floor joins them.
local boxCF, boxSize
-- The floor under the course, which ends a fall the way a hazard does.
local voidFloor
do
	local lowest, under = math.huge, nil
	for _, role in { "Start", "Path", "Checkpoint", "Kill", "Mover", "Finish" } do
		for _, model in byRole[role] or {} do
			local cf, size = model:GetBoundingBox()
			local bottom = cf.Position.Y - size.Y / 2
			if bottom < lowest then
				lowest, under = bottom, cf.Position
			end
		end
	end
	if under then
		local params = RaycastParams.new()
		params.FilterType = Enum.RaycastFilterType.Exclude
		params.FilterDescendantsInstances = { course }
		-- From a stud above the lowest piece: dropped onto the ground, the
		-- piece rests inside the ground's surface, and a ray that starts
		-- inside a part never sees it.
		local from = Vector3.new(under.X, lowest + 1, under.Z)
		local hit = workspace:Raycast(from, Vector3.new(0, -(CLEARANCE + 2), 0), params)
		if hit then
			local short = CLEARANCE - (lowest - hit.Position.Y)
			if short > 0 then
				course:PivotTo(course:GetPivot() + Vector3.new(0, short, 0))
			end
			boxCF, boxSize = course:GetBoundingBox()
			-- What is under the course reads as a void: a black floor over
			-- the ground, wide enough that the edge is out of sight from the
			-- course. Scenery stands on it. A character that lands on it has
			-- fallen off the course, and it kills on touch like a hazard:
			-- touch is reliable where a height check is not, since the server
			-- sees a falling character a few frames late, which at falling
			-- speed is the whole drop.
			local void = Instance.new("Part")
			void.Name = "Void"
			void.Anchored = true
			void.CanCollide = true
			void.CastShadow = false
			void.Material = Enum.Material.SmoothPlastic
			void.Color = Color3.new(0, 0, 0)
			-- Its top sits a stud over the ground, covering whatever small
			-- things stand there, such as the place's own spawn pad.
			void.Size = Vector3.new(600, 2, 600)
			void.CFrame = CFrame.new(under.X, hit.Position.Y + 0.2, under.Z)
			void.Parent = course
			voidFloor = void
		end
	end
end

-- The course is played at night, in a void: no sun, moon or stars, black
-- fog closing in past the course, and a warm light over every piece you can
-- stand on, so the course is the only thing lit. Set the model's Night
-- attribute to false to keep the place's own lighting.
if course:GetAttribute("Night") ~= false then
	local Lighting = game:GetService("Lighting")
	Lighting.ClockTime = 0
	Lighting.Brightness = 0
	-- Pulls the last of the night sky's blue at the horizon down to black.
	Lighting.ExposureCompensation = -1.5
	Lighting.Ambient = Color3.fromRGB(18, 18, 22)
	Lighting.OutdoorAmbient = Color3.fromRGB(18, 18, 22)
	Lighting.FogColor = Color3.new(0, 0, 0)
	Lighting.FogStart = 70
	Lighting.FogEnd = 240
	for _, effect in Lighting:GetChildren() do
		-- An atmosphere overrides fog, and a sky brings its own stars.
		if effect:IsA("Atmosphere") or effect:IsA("Sky") then
			effect:Destroy()
		end
	end
	local sky = Instance.new("Sky")
	sky.StarCount = 0
	sky.CelestialBodiesShown = false
	sky.Parent = Lighting

	for _, role in { "Start", "Path", "Checkpoint", "Mover", "Finish" } do
		for _, model in byRole[role] or {} do
			local cf, size = model:GetBoundingBox()
			local lamp = Instance.new("Part")
			lamp.Name = "Lamp"
			lamp.Anchored = true
			lamp.CanCollide = false
			lamp.CanQuery = false
			lamp.Transparency = 1
			lamp.Size = Vector3.new(1, 1, 1)
			lamp.CFrame = CFrame.new(cf.Position + Vector3.new(0, size.Y / 2 + 9, 0))
			local light = Instance.new("PointLight")
			light.Color = Color3.fromRGB(255, 214, 160)
			light.Brightness = 3
			light.Range = math.max(24, math.max(size.X, size.Z) + 18)
			light.Shadows = true
			light.Parent = lamp
			-- Under the course, not the piece: a lamp inside a piece would
			-- stretch its bounding box, which the rest of this script reads.
			lamp.Parent = course
		end
	end
end

-- The course runs along the model's X; movers swing along its Z.
local pivot = course:GetPivot()
local forward = pivot.RightVector
local sideways = pivot:VectorToWorldSpace(Vector3.zAxis)

-- Where to stand on a piece: straight down onto it from above its middle.
local function standOn(model)
	local cf, size = model:GetBoundingBox()
	local from = cf.Position + Vector3.new(0, size.Y / 2 + 5, 0)
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Include
	params.FilterDescendantsInstances = { model }
	local hit = workspace:Raycast(from, Vector3.new(0, -(size.Y + 10), 0), params)
	local ground = hit and hit.Position or (cf.Position + Vector3.new(0, size.Y / 2, 0))
	local spot = ground + Vector3.new(0, 3, 0)
	return CFrame.lookAt(spot, spot + forward)
end

local startModel = (byRole.Start and byRole.Start[1]) or (byRole.Path and byRole.Path[1])
local startAt = startModel and standOn(startModel) or standOn(course)

local checkpointOf = {} -- player -> where they come back
local startedAt = {} -- player -> when they left the start
local finished = setmetatable({}, { __mode = "k" }) -- character -> true
local arrived = setmetatable({}, { __mode = "k" }) -- character -> placed on the course

local function toast(player, text)
	local playerGui = player:FindFirstChildOfClass("PlayerGui")
	if not playerGui then
		return
	end
	local gui = Instance.new("ScreenGui")
	gui.Name = "ObbyToast"
	gui.ResetOnSpawn = false
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 0.1)
	label.Position = UDim2.fromScale(0, 0.14)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.GothamBold
	label.TextScaled = true
	label.TextColor3 = Color3.fromRGB(255, 196, 64)
	label.TextStrokeTransparency = 0.3
	label.Text = text
	label.Parent = gui
	gui.Parent = playerGui
	task.delay(2.5, function()
		gui:Destroy()
	end)
end

-- The player a touching part belongs to, if it is a living character.
local function fromHit(hit)
	local character = hit:FindFirstAncestorOfClass("Model")
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not humanoid or humanoid.Health <= 0 then
		return nil
	end
	return Players:GetPlayerFromCharacter(character), humanoid, character
end

for _, model in byRole.Kill or {} do
	for _, part in partsOf(model) do
		part.Touched:Connect(function(hit)
			local _, humanoid = fromHit(hit)
			if humanoid then
				humanoid.Health = 0
			end
		end)
	end
end

if voidFloor then
	voidFloor.Touched:Connect(function(hit)
		local _, humanoid = fromHit(hit)
		if humanoid then
			humanoid.Health = 0
		end
	end)
end

for _, model in byRole.Checkpoint or {} do
	local spot = standOn(model)
	for _, part in partsOf(model) do
		part.Touched:Connect(function(hit)
			local player = fromHit(hit)
			if player and checkpointOf[player] ~= spot then
				checkpointOf[player] = spot
				toast(player, "Checkpoint")
			end
		end)
	end
end

for _, model in byRole.Finish or {} do
	for _, part in partsOf(model) do
		part.Touched:Connect(function(hit)
			local player, _, character = fromHit(hit)
			if player and not finished[character] then
				finished[character] = true
				local took = startedAt[player] and os.clock() - startedAt[player]
				toast(player, took and string.format("Finished in %.1f s", took) or "Finished!")
				-- The next run starts from the start, with a fresh clock.
				checkpointOf[player] = nil
				startedAt[player] = nil
			end
		end)
	end
end

-- Every character appears on the course: at its checkpoint, or the start.
local function place(player, character)
	local root = character:WaitForChild("HumanoidRootPart", 10)
	if not root then
		return
	end
	task.wait() -- let the default spawn finish, then move it
	character:PivotTo(checkpointOf[player] or startAt)
	if not checkpointOf[player] then
		startedAt[player] = os.clock()
	end
	arrived[character] = true
end

local function join(player)
	player.CharacterAdded:Connect(function(character)
		place(player, character)
	end)
	if player.Character then
		task.spawn(place, player, player.Character)
	end
end

Players.PlayerAdded:Connect(join)
for _, player in Players:GetPlayers() do
	join(player)
end
Players.PlayerRemoving:Connect(function(player)
	checkpointOf[player] = nil
	startedAt[player] = nil
end)

-- Movers swing from side to side. Anchored parts moved by hand do not carry
-- what stands on them, so each is also given the velocity it is moving at.
local moving = {}
for i, model in byRole.Mover or {} do
	local entry = { parts = {}, phase = (i - 1) * 1.7 }
	for _, part in partsOf(model) do
		table.insert(entry.parts, { part = part, home = part.CFrame })
	end
	table.insert(moving, entry)
end

if #moving > 0 then
	local w = 2 * math.pi / MOVE_PERIOD
	RunService.Heartbeat:Connect(function()
		local t = os.clock()
		for _, m in moving do
			local a = w * t + m.phase
			local offset = sideways * (math.sin(a) * MOVE_DISTANCE)
			local velocity = sideways * (math.cos(a) * MOVE_DISTANCE * w)
			for _, e in m.parts do
				e.part.CFrame = e.home + offset
				e.part.AssemblyLinearVelocity = velocity
			end
		end
	end)
end

-- Falling below the lowest piece you can stand on, anywhere over the course,
-- counts as falling off it. Only for characters already placed on it, so
-- someone walking past on the ground elsewhere is left alone. The void floor
-- under the course is what usually ends a fall; this is the backstop for a
-- course placed over nothing at all.
local FALL = 5 -- studs below the lowest piece before the fall counts
local lowest = math.huge
for _, role in { "Start", "Path", "Checkpoint", "Mover", "Finish" } do
	for _, model in byRole[role] or {} do
		local cf, size = model:GetBoundingBox()
		lowest = math.min(lowest, cf.Position.Y - size.Y / 2)
	end
end

if not boxCF then
	boxCF, boxSize = course:GetBoundingBox()
end
if lowest < math.huge then
	-- Every frame rather than every so often: a falling character covers
	-- fifteen studs in a fifth of a second, which was enough to reach the
	-- ground before the fall was noticed.
	RunService.Heartbeat:Connect(function()
		for _, player in Players:GetPlayers() do
			local character = player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			local humanoid = character and character:FindFirstChildOfClass("Humanoid")
			if root and humanoid and arrived[character] and humanoid.Health > 0 and root.Position.Y < lowest - FALL then
				local rel = boxCF:PointToObjectSpace(root.Position)
				if math.abs(rel.X) < boxSize.X / 2 + 12 and math.abs(rel.Z) < boxSize.Z / 2 + 12 then
					humanoid.Health = 0
				end
			end
		end
	end)
end
