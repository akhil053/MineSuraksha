const app = document.getElementById("app");
const espIpInput = document.getElementById("espIp");
const saveIpButton = document.getElementById("saveIp");
const connection = document.getElementById("connection");
const statusEl = document.getElementById("status");
const alertEl = document.getElementById("alert");
const phoneUrl = document.getElementById("phoneUrl");
const phoneStatus = document.getElementById("phoneStatus");
const mapLink = document.getElementById("mapLink");
const sosAlert = document.getElementById("sosAlert");
const sosText = document.getElementById("sosText");
const clearSos = document.getElementById("clearSos");
const sosModal = document.getElementById("sosModal");
const sosLastLocation = document.getElementById("sosLastLocation");
const sosMapLink = document.getElementById("sosMapLink");
const closeSosModal = document.getElementById("closeSosModal");
const startPoint = document.getElementById("startPoint");
const currentPoint = document.getElementById("currentPoint");
const routeDistance = document.getElementById("routeDistance");
const routeCount = document.getElementById("routeCount");
const routeList = document.getElementById("routeList");
const movementSteps = document.getElementById("movementSteps");
const depthRoute = document.getElementById("depthRoute");
const depthRouteFill = document.getElementById("depthRouteFill");
const depthPerson = document.getElementById("depthPerson");
const depthChip = document.getElementById("depthChip");
const depthLabels = document.getElementById("depthLabels");
const directionRoute = document.getElementById("directionRoute");
const movingScale = document.getElementById("movingScale");
const profileDistance = document.getElementById("profileDistance");
const profileDepth = document.getElementById("profileDepth");
const profilePosition = document.getElementById("profilePosition");
const depthSvg = document.getElementById("depthSvg");
const profileViewport = document.getElementById("profileViewport");
const profileZoomIn = document.getElementById("profileZoomIn");
const profileZoomOut = document.getElementById("profileZoomOut");
const profileReset = document.getElementById("profileReset");
const profileCalibrate = document.getElementById("profileCalibrate");

let espIp = localStorage.getItem("helmetEspIp") || "";
let liveMap = null;
let liveMarker = null;
let startMarker = null;
let sosMarker = null;
let routeLine = null;
let routePoints = [];
let virtualOrigin = null;
let virtualPosition = { north: 0, east: 0 };
let virtualRoutePoints = [];
let depthProfilePoints = [{ distance: 0, depth: 0 }];
let latestPhoneSnapshot = null;
let acceptedPhoneLocation = null;
let lastAcceptedPhoneAt = 0;
let calibration = {
  beta: 0,
  gamma: 0,
  motion: 9.81,
  active: false
};
let isAnimatingMarker = false;
let pendingMarkerTarget = null;
let lastVirtualStepAt = 0;
let motionStreak = 0;
let profileTransform = { scale: 1, x: 0, y: 0 };

const MAX_ROUTE_POINTS = 120;
const MIN_ROUTE_MOVE_METERS = 0.2;
const VIRTUAL_STEP_GAP = 1200;
const GRAVITY_MOTION = 9.81;
const WALK_MOTION_THRESHOLD = 1.25;
const REQUIRED_MOTION_STREAK = 1;
const PHONE_UPDATE_INTERVAL = 1000;
const MIN_GPS_ACCEPT_METERS = 0.2;
const DEPTH_MAX_METERS = 100;
const DEPTH_LEFT = 142;
const DEPTH_RIGHT = 825;
const DEPTH_SURFACE_Y = 142;
const DEPTH_BOTTOM_Y = 318;
const PROFILE_MIN_ZOOM = 1;
const PROFILE_MAX_ZOOM = 4;

espIpInput.value = espIp;
phoneUrl.textContent = `${location.origin}/phone.html`;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyProfileTransform() {
  profileViewport.setAttribute(
    "transform",
    `translate(${profileTransform.x.toFixed(1)} ${profileTransform.y.toFixed(1)}) scale(${profileTransform.scale.toFixed(3)})`
  );
}

function zoomProfile(factor, centerX = 450, centerY = 180) {
  const oldScale = profileTransform.scale;
  const newScale = clamp(oldScale * factor, PROFILE_MIN_ZOOM, PROFILE_MAX_ZOOM);

  if (newScale === oldScale) {
    return;
  }

  const worldX = (centerX - profileTransform.x) / oldScale;
  const worldY = (centerY - profileTransform.y) / oldScale;

  profileTransform.scale = newScale;
  profileTransform.x = centerX - worldX * newScale;
  profileTransform.y = centerY - worldY * newScale;
  applyProfileTransform();
}

function resetProfileView() {
  profileTransform = { scale: 1, x: 0, y: 0 };
  applyProfileTransform();
}

function resetTrackingProfile() {
  resetProfileView();
  virtualPosition = { north: 0, east: 0 };
  virtualRoutePoints = [{ north: 0, east: 0 }];
  depthProfilePoints = [{ distance: 0, depth: 0 }];
  lastVirtualStepAt = 0;
  motionStreak = 0;

  if (latestPhoneSnapshot && latestPhoneSnapshot.lat !== null && latestPhoneSnapshot.lng !== null) {
    const lat = Number(latestPhoneSnapshot.lat);
    const lng = Number(latestPhoneSnapshot.lng);
    acceptedPhoneLocation = [lat, lng];
    lastAcceptedPhoneAt = Date.now();
    routePoints = [[lat, lng]];

    if (routeLine) {
      routeLine.setLatLngs(routePoints);
    }

    if (startMarker) {
      startMarker.setLatLng([lat, lng]);
    }

    if (liveMarker) {
      liveMarker.setLatLng([lat, lng]);
    }

    startPoint.textContent = formatPoint(lat, lng);
    currentPoint.textContent = formatPoint(lat, lng);
    routeDistance.textContent = "0 m";
    routeCount.textContent = "1";
    routeList.innerHTML = `<li><span>Now</span><strong>${formatPoint(lat, lng)}</strong></li>`;
  }

  profileDistance.textContent = "0 m";
  profileDepth.textContent = "0 m";
  profilePosition.textContent = "N 0 m, E 0 m";
  depthChip.textContent = "Depth 0 m | N 0 m, E 0 m";
  movementSteps.innerHTML = "<li><span>Start</span><strong>No movement yet</strong></li>";
  updateDepthProfile();
}

function calibrateTracking() {
  if (latestPhoneSnapshot) {
    calibration = {
      beta: Number(latestPhoneSnapshot.beta || 0),
      gamma: Number(latestPhoneSnapshot.gamma || 0),
      motion: Number(latestPhoneSnapshot.motion || GRAVITY_MOTION),
      active: true
    };
  }

  resetTrackingProfile();
  depthChip.textContent = "Calibration set | Depth 0 m | N 0 m, E 0 m";
  profilePosition.textContent = "Calibration set at current phone state";
}

function svgPointFromEvent(event) {
  const rect = depthSvg.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 900,
    y: ((event.clientY - rect.top) / rect.height) * 360
  };
}

const personIcon = L.divIcon({
  className: "person-marker",
  html: "<div class='person-dot'></div>",
  iconSize: [44, 44],
  iconAnchor: [22, 22]
});

const startIcon = L.divIcon({
  className: "start-marker",
  html: "<div class='start-dot'>S</div>",
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

const sosIcon = L.divIcon({
  className: "sos-marker",
  html: "<div class='sos-dot'>SOS</div>",
  iconSize: [58, 58],
  iconAnchor: [29, 29]
});

function setFill(id, percent, color) {
  const el = document.getElementById(id);
  el.style.width = Math.min(percent, 100) + "%";
  el.style.background = color;
}

function getColor(value, warning, danger) {
  if (value >= danger) return "#ef4444";
  if (value >= warning) return "#facc15";
  return "#22c55e";
}

function setMode(mode, message) {
  app.className = `app ${mode}`;
  statusEl.textContent = mode.toUpperCase();
  alertEl.textContent = message;
}

function formatPoint(lat, lng) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function distanceMeters(a, b) {
  const earthRadius = 6371000;
  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function latLngToOffsetMeters(origin, point) {
  const metersPerLat = 111320;
  const metersPerLng = 111320 * Math.cos(origin[0] * Math.PI / 180);

  return {
    north: (point[0] - origin[0]) * metersPerLat,
    east: (point[1] - origin[1]) * metersPerLng
  };
}

function getRelativePoints() {
  if (virtualRoutePoints.length) {
    return virtualRoutePoints;
  }

  if (!routePoints.length) {
    return [];
  }

  const origin = routePoints[0];
  return routePoints.map((point) => latLngToOffsetMeters(origin, point));
}

function getDirectionScale(relativePoints) {
  const maxDistance = relativePoints.reduce((max, point) => {
    return Math.max(max, Math.abs(point.east));
  }, 1);

  return 46 / maxDistance;
}

function formatSignedDirection(value, positiveLabel, negativeLabel) {
  if (Math.abs(value) < 0.5) {
    return `${positiveLabel} 0 m`;
  }

  return value >= 0
    ? `${positiveLabel} ${Math.abs(value).toFixed(1)} m`
    : `${negativeLabel} ${Math.abs(value).toFixed(1)} m`;
}

function describeSegment(from, to) {
  const dNorth = to.north - from.north;
  const dEast = to.east - from.east;
  const primaryIsEast = Math.abs(dEast) >= Math.abs(dNorth);
  const distance = Math.sqrt(dNorth * dNorth + dEast * dEast);
  const direction = primaryIsEast
    ? (dEast >= 0 ? "East" : "West")
    : (dNorth >= 0 ? "North" : "South");

  return `${direction} ${distance.toFixed(1)} m`;
}

function updateDepthProfile() {
  if (!depthProfilePoints.length) {
    return;
  }

  const relativePoints = getRelativePoints();
  const maxDistance = Math.max(
    20,
    depthProfilePoints.reduce((max, point) => Math.max(max, point.distance), 0)
  );
  const directionScale = getDirectionScale(relativePoints);

  const points = depthProfilePoints.map((point) => {
    const x = DEPTH_LEFT + (point.distance / maxDistance) * (DEPTH_RIGHT - DEPTH_LEFT);
    const clampedDepth = Math.max(0, Math.min(DEPTH_MAX_METERS, point.depth));
    const y = DEPTH_SURFACE_Y + (clampedDepth / DEPTH_MAX_METERS) * (DEPTH_BOTTOM_Y - DEPTH_SURFACE_Y);
    return { x, y, depth: clampedDepth, distance: point.distance };
  });

  const directionPoints = points.map((point, index) => {
    const relative = relativePoints[index] || relativePoints[relativePoints.length - 1] || { east: 0 };
    return {
      x: point.x,
      y: point.y - relative.east * directionScale
    };
  });

  const pointString = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const directionString = directionPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const latest = points[points.length - 1];
  const latestRelative = relativePoints[relativePoints.length - 1] || { north: 0, east: 0 };
  const currentVisualPoint = directionPoints[directionPoints.length - 1] || latest;

  depthRoute.setAttribute("points", pointString);
  directionRoute.setAttribute("points", directionString);
  depthPerson.setAttribute("cx", latest.x);
  depthPerson.setAttribute("cy", currentVisualPoint.y);
  movingScale.setAttribute("transform", `translate(${(currentVisualPoint.x - 142).toFixed(1)} ${(currentVisualPoint.y - 104).toFixed(1)})`);

  const positionText = `${formatSignedDirection(latestRelative.north, "N", "S")}, ${formatSignedDirection(latestRelative.east, "E", "W")}`;
  depthChip.textContent = `Depth -${latest.depth.toFixed(1)} m | ${positionText}`;
  profileDistance.textContent = `${latest.distance.toFixed(1)} m`;
  profileDepth.textContent = `-${latest.depth.toFixed(1)} m`;
  profilePosition.textContent = positionText;

  const fillPath = `M ${DEPTH_LEFT},${DEPTH_SURFACE_Y} L ${pointString.replaceAll(" ", " L ")} L ${latest.x.toFixed(1)},${DEPTH_SURFACE_Y} Z`;
  depthRouteFill.setAttribute("d", fillPath);

  const labelPoints = directionPoints
    .map((point, index) => ({ ...point, distance: points[index]?.distance || 0 }))
    .filter((_, index) => index === 0 || index === directionPoints.length - 1 || index % 8 === 0)
    .slice(-5);

  depthLabels.innerHTML = labelPoints
    .map((point, index) => {
      const label = index === labelPoints.length - 1 ? "Current" : `${point.distance.toFixed(0)}m`;
      return `<g><line x1="${point.x.toFixed(1)}" y1="${point.y.toFixed(1)}" x2="${point.x.toFixed(1)}" y2="${(point.y - 28).toFixed(1)}" class="depth-callout"></line><circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4" class="depth-dot"></circle><text x="${(point.x + 7).toFixed(1)}" y="${(point.y - 31).toFixed(1)}" class="depth-small-label">${label}</text></g>`;
    })
    .join("");

  const recentSegments = [];
  for (let i = Math.max(1, relativePoints.length - 6); i < relativePoints.length; i++) {
    recentSegments.push(describeSegment(relativePoints[i - 1], relativePoints[i]));
  }

  movementSteps.innerHTML = recentSegments.length
    ? recentSegments.reverse().map((step, index) => `<li><span>${index === 0 ? "Latest" : `Step -${index}`}</span><strong>${step}</strong></li>`).join("")
    : "<li><span>Start</span><strong>No movement yet</strong></li>";
}

function addDepthPoint(stepMeters, data) {
  const latest = depthProfilePoints[depthProfilePoints.length - 1] || { distance: 0, depth: 0 };
  const beta = Number(data.beta || 0) - (calibration.active ? calibration.beta : 0);
  const tiltDepth = Math.max(-0.8, Math.min(0.8, beta / 45));
  const depthDelta = stepMeters * tiltDepth;
  const nextDepth = Math.max(0, Math.min(DEPTH_MAX_METERS, latest.depth + depthDelta));
  const nextDistance = latest.distance + stepMeters;

  depthProfilePoints.push({ distance: nextDistance, depth: nextDepth });

  if (depthProfilePoints.length > MAX_ROUTE_POINTS) {
    depthProfilePoints.shift();
  }

  updateDepthProfile();
}

function updateVirtualMovement(data) {
  const now = Date.now();

  if (now - lastVirtualStepAt < VIRTUAL_STEP_GAP) {
    return;
  }

  const motion = Number(data.motion || 0);
  const beta = Number(data.beta || 0) - (calibration.active ? calibration.beta : 0);
  const gamma = Number(data.gamma || 0) - (calibration.active ? calibration.gamma : 0);
  const baselineMotion = calibration.active ? calibration.motion : GRAVITY_MOTION;
  const motionDelta = Math.abs(motion - baselineMotion);

  if (motionDelta < WALK_MOTION_THRESHOLD) {
    motionStreak = 0;
    return;
  }

  motionStreak += 1;

  if (motionStreak < REQUIRED_MOTION_STREAK) {
    return;
  }

  const stepMeters = Math.min(Math.max(motionDelta * 0.28, 0.25), 1.3);
  const useEastWest = Math.abs(gamma) > Math.abs(beta);

  if (useEastWest) {
    virtualPosition.east += gamma >= 0 ? stepMeters : -stepMeters;
  } else {
    virtualPosition.north += beta >= 0 ? stepMeters : -stepMeters;
  }

  virtualRoutePoints.push({ ...virtualPosition });
  addDepthPoint(stepMeters, data);

  if (virtualRoutePoints.length > MAX_ROUTE_POINTS) {
    virtualRoutePoints.shift();
  }

  lastVirtualStepAt = now;
  motionStreak = 0;
  updateDepthProfile();
}

function totalRouteDistance() {
  let total = 0;

  for (let i = 1; i < routePoints.length; i++) {
    total += distanceMeters(routePoints[i - 1], routePoints[i]);
  }

  return total;
}

function updateRoutePanel() {
  if (!routePoints.length) {
    return;
  }

  const first = routePoints[0];
  const latest = routePoints[routePoints.length - 1];
  const total = totalRouteDistance();
  const recent = routePoints.slice(-6).reverse();

  startPoint.textContent = formatPoint(first[0], first[1]);
  currentPoint.textContent = formatPoint(latest[0], latest[1]);
  routeDistance.textContent = total >= 1000 ? `${(total / 1000).toFixed(2)} km` : `${total.toFixed(0)} m`;
  routeCount.textContent = routePoints.length;

  routeList.innerHTML = recent
    .map((point, index) => `<li><span>${index === 0 ? "Now" : `Point -${index}`}</span><strong>${formatPoint(point[0], point[1])}</strong></li>`)
    .join("");

  updateDepthProfile();
}

function setHelmetValues(data) {
  document.getElementById("gas").textContent = data.gasPpm;
  document.getElementById("temp").textContent = Number(data.temperatureC).toFixed(1);
  document.getElementById("heart").textContent = data.heartRate;
  document.getElementById("lock").textContent = data.helmetLocked ? "ON" : "OFF";

  setFill("gasFill", data.gasPpm / 450 * 100, getColor(data.gasPpm, 220, 300));
  setFill("tempFill", data.temperatureC / 60 * 100, getColor(data.temperatureC, 38, 42));
  setFill("heartFill", data.heartRate / 150 * 100, getColor(data.heartRate, 105, 120));
  setFill("lockFill", data.helmetLocked ? 100 : 15, data.helmetLocked ? "#22c55e" : "#ef4444");
}

function addRoutePoint(lat, lng) {
  const latest = routePoints[routePoints.length - 1];

  if (latest && distanceMeters(latest, [lat, lng]) < MIN_ROUTE_MOVE_METERS) {
    currentPoint.textContent = formatPoint(lat, lng);
    updateDepthProfile();
    return;
  }

  routePoints.push([lat, lng]);

  if (routePoints.length > MAX_ROUTE_POINTS) {
    routePoints.shift();
  }

  if (routeLine) {
    routeLine.setLatLngs(routePoints);
  }

  updateRoutePanel();
}

function animateMarkerTo(lat, lng) {
  if (!liveMarker || !window.L) {
    return;
  }

  if (isAnimatingMarker) {
    pendingMarkerTarget = [lat, lng];
    return;
  }

  isAnimatingMarker = true;

  const start = liveMarker.getLatLng();
  const end = L.latLng(lat, lng);
  const duration = 1200;
  const startTime = performance.now();

  function frame(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    const currentLat = start.lat + (end.lat - start.lat) * eased;
    const currentLng = start.lng + (end.lng - start.lng) * eased;

    liveMarker.setLatLng([currentLat, currentLng]);

    if (progress < 1) {
      requestAnimationFrame(frame);
      return;
    }

    liveMarker.setLatLng(end);
    isAnimatingMarker = false;

    if (pendingMarkerTarget) {
      const nextTarget = pendingMarkerTarget;
      pendingMarkerTarget = null;
      animateMarkerTo(nextTarget[0], nextTarget[1]);
    }
  }

  requestAnimationFrame(frame);
}

function updateLiveMap(lat, lng) {
  if (!window.L) {
    return;
  }

  if (!liveMap) {
    liveMap = L.map("mapFrame", {
      zoomControl: true
    }).setView([lat, lng], 17);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "OpenStreetMap"
    }).addTo(liveMap);

    startMarker = L.marker([lat, lng], { icon: startIcon }).addTo(liveMap);
    liveMarker = L.marker([lat, lng], { icon: personIcon }).addTo(liveMap);

    routePoints = [[lat, lng]];
    virtualOrigin = [lat, lng];
    virtualRoutePoints = [{ north: 0, east: 0 }];
    depthProfilePoints = [{ distance: 0, depth: 0 }];
    routeLine = L.polyline(routePoints, {
      color: "#38bdf8",
      weight: 5,
      opacity: 0.78
    }).addTo(liveMap);

    updateRoutePanel();
    updateDepthProfile();
    return;
  }

  addRoutePoint(lat, lng);
  addDepthPoint(Math.max(distanceMeters(routePoints[routePoints.length - 2] || [lat, lng], [lat, lng]), 0.2), { beta: 8, motion: 10.8 });
  animateMarkerTo(lat, lng);
  liveMap.panTo([lat, lng], {
    animate: true,
    duration: 0.7
  });
}

function showSosAlert(data) {
  if (!data.sos) {
    return;
  }

  sosAlert.classList.add("active");
  sosModal.classList.add("active");
  sosText.textContent = data.lat !== null && data.lng !== null
    ? `Emergency at ${Number(data.lat).toFixed(6)}, ${Number(data.lng).toFixed(6)}`
    : "Emergency triggered. GPS location waiting.";

  if (liveMap && data.lat !== null && data.lng !== null) {
    const lat = Number(data.lat);
    const lng = Number(data.lng);
    const locationText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    sosLastLocation.textContent = locationText;
    sosMapLink.href = `https://www.google.com/maps?q=${lat},${lng}`;

    if (!sosMarker) {
      sosMarker = L.marker([lat, lng], { icon: sosIcon }).addTo(liveMap);
    } else {
      sosMarker.setLatLng([lat, lng]);
    }

    liveMap.panTo([lat, lng], {
      animate: true,
      duration: 0.5
    });
  } else {
    sosLastLocation.textContent = "GPS location not available yet";
  }
}

function setPhoneValues(data) {
  latestPhoneSnapshot = data;

  document.getElementById("lat").textContent = data.lat === null ? "--" : Number(data.lat).toFixed(6);
  document.getElementById("lng").textContent = data.lng === null ? "--" : Number(data.lng).toFixed(6);
  document.getElementById("speed").textContent = Number(data.speedKmph || 0).toFixed(1);
  document.getElementById("accuracy").textContent = Number(data.accuracy || 0).toFixed(0);
  document.getElementById("alpha").textContent = Number(data.alpha || 0).toFixed(1);
  document.getElementById("beta").textContent = Number(data.beta || 0).toFixed(1);
  document.getElementById("gamma").textContent = Number(data.gamma || 0).toFixed(1);
  document.getElementById("motion").textContent = Number(data.motion || 0).toFixed(2);

  phoneStatus.textContent = data.online ? "Phone sender live" : "Waiting for phone...";

  if (data.lat !== null && data.lng !== null) {
    const lat = Number(data.lat);
    const lng = Number(data.lng);
    const now = Date.now();
    const incomingLocation = [lat, lng];
    const movedEnough = !acceptedPhoneLocation || distanceMeters(acceptedPhoneLocation, incomingLocation) >= MIN_GPS_ACCEPT_METERS;
    const timeReady = now - lastAcceptedPhoneAt >= PHONE_UPDATE_INTERVAL;

    mapLink.href = `https://www.google.com/maps?q=${lat},${lng}`;
    mapLink.classList.add("active");

    if (timeReady) {
      acceptedPhoneLocation = incomingLocation;
      lastAcceptedPhoneAt = now;
      if (movedEnough) {
        updateLiveMap(lat, lng);
      }
      updateVirtualMovement(data);
    } else if (!liveMap) {
      acceptedPhoneLocation = incomingLocation;
      lastAcceptedPhoneAt = now;
      updateLiveMap(lat, lng);
    }
  } else {
    updateVirtualMovement(data);
    profilePosition.textContent = `Waiting for GPS | motion ${Number(data.motion || 0).toFixed(2)} m/s2`;
  }

  showSosAlert(data);
}

async function loadHelmetData() {
  if (!espIp) {
    connection.textContent = "IP required";
    setMode("warning", "Enter the receiver ESP32 IP address.");
    return;
  }

  try {
    const response = await fetch(`http://${espIp}/data`);
    const data = await response.json();
    setHelmetValues(data);

    connection.textContent = data.online ? "Helmet connected" : "No recent data";

    if (!data.online) {
      setMode("warning", "No recent helmet data. Check power and range.");
    } else if (data.gasPpm > 300 || data.temperatureC > 42 || data.heartRate > 120 || !data.helmetLocked || data.fallDetected) {
      setMode("danger", "Emergency detected. Check the worker immediately.");
    } else if (data.gasPpm > 220 || data.temperatureC > 38 || data.heartRate > 105) {
      setMode("warning", "Readings are close to the limit. Continue monitoring.");
    } else {
      setMode("safe", "All readings are inside safe range.");
    }
  } catch (error) {
    connection.textContent = "ESP not reachable";
    setMode("danger", "Receiver ESP32 is not reachable. Check the IP and Wi-Fi.");
  }
}

async function loadPhoneData() {
  try {
    const response = await fetch("/phone-data");
    const data = await response.json();
    setPhoneValues(data);
  } catch (error) {
    phoneStatus.textContent = "Phone server not reachable";
  }
}

saveIpButton.addEventListener("click", () => {
  espIp = espIpInput.value.trim().replace("http://", "").replace("https://", "").replace("/", "");
  localStorage.setItem("helmetEspIp", espIp);
  loadHelmetData();
});

clearSos.addEventListener("click", () => {
  sosAlert.classList.remove("active");
  sosModal.classList.remove("active");
  if (sosMarker && liveMap) {
    liveMap.removeLayer(sosMarker);
    sosMarker = null;
  }
});

closeSosModal.addEventListener("click", () => {
  sosModal.classList.remove("active");
});

profileZoomIn.addEventListener("click", () => {
  zoomProfile(1.25);
});

profileZoomOut.addEventListener("click", () => {
  zoomProfile(0.8);
});

profileReset.addEventListener("click", () => {
  resetTrackingProfile();
});

profileCalibrate.addEventListener("click", () => {
  calibrateTracking();
});

depthSvg.addEventListener("wheel", (event) => {
  event.preventDefault();
  const point = svgPointFromEvent(event);
  zoomProfile(event.deltaY < 0 ? 1.12 : 0.9, point.x, point.y);
}, { passive: false });

loadHelmetData();
loadPhoneData();

setInterval(loadHelmetData, 1500);
setInterval(loadPhoneData, PHONE_UPDATE_INTERVAL);
