const startButton = document.getElementById("startButton");
const sosButton = document.getElementById("sosButton");
const stateEl = document.getElementById("state");
const statusEl = document.getElementById("status");

const phoneData = {
  lat: null,
  lng: null,
  speedKmph: 0,
  accuracy: 0,
  alpha: 0,
  beta: 0,
  gamma: 0,
  motion: 0,
  sos: false,
  sosAt: 0,
  timestamp: 0
};

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function updateScreen() {
  setText("lat", phoneData.lat === null ? "--" : phoneData.lat.toFixed(6));
  setText("lng", phoneData.lng === null ? "--" : phoneData.lng.toFixed(6));
  setText("speed", phoneData.speedKmph.toFixed(1));
  setText("accuracy", phoneData.accuracy.toFixed(0));
  setText("alpha", phoneData.alpha.toFixed(1));
  setText("beta", phoneData.beta.toFixed(1));
  setText("gamma", phoneData.gamma.toFixed(1));
  setText("motion", phoneData.motion.toFixed(2));
}

async function requestMotionPermission() {
  if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    const result = await DeviceOrientationEvent.requestPermission();
    if (result !== "granted") {
      throw new Error("Gyro permission denied");
    }
  }

  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    const result = await DeviceMotionEvent.requestPermission();
    if (result !== "granted") {
      throw new Error("Motion permission denied");
    }
  }
}

function startGps() {
  if (!navigator.geolocation) {
    throw new Error("GPS not supported");
  }

  navigator.geolocation.watchPosition(
    (position) => {
      phoneData.lat = position.coords.latitude;
      phoneData.lng = position.coords.longitude;
      phoneData.accuracy = position.coords.accuracy || 0;
      phoneData.speedKmph = position.coords.speed ? position.coords.speed * 3.6 : 0;
      phoneData.timestamp = Date.now();
      updateScreen();
    },
    () => {
      stateEl.textContent = "GPS denied";
      statusEl.textContent = "ERROR";
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    }
  );
}

function startGyro() {
  window.addEventListener("deviceorientation", (event) => {
    phoneData.alpha = event.alpha || 0;
    phoneData.beta = event.beta || 0;
    phoneData.gamma = event.gamma || 0;
    phoneData.timestamp = Date.now();
    updateScreen();
  });

  window.addEventListener("devicemotion", (event) => {
    const acc = event.accelerationIncludingGravity || event.acceleration || {};
    const x = acc.x || 0;
    const y = acc.y || 0;
    const z = acc.z || 0;
    phoneData.motion = Math.sqrt(x * x + y * y + z * z);
    phoneData.timestamp = Date.now();
    updateScreen();
  });
}

async function sendPhoneData() {
  try {
    await fetch("/phone-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(phoneData)
    });
    stateEl.textContent = "Sending live";
  } catch (error) {
    stateEl.textContent = "Server error";
  }
}

async function sendSosAlert() {
  phoneData.sos = true;
  phoneData.sosAt = Date.now();
  statusEl.textContent = "SOS";
  stateEl.textContent = "SOS sent";
  await sendPhoneData();
}

startButton.addEventListener("click", async () => {
  try {
    startButton.disabled = true;
    await requestMotionPermission();
    startGps();
    startGyro();
    statusEl.textContent = "LIVE";
    stateEl.textContent = "Sending live";
    setInterval(sendPhoneData, 1000);
  } catch (error) {
    startButton.disabled = false;
    statusEl.textContent = "ERROR";
    stateEl.textContent = error.message;
  }
});

sosButton.addEventListener("click", () => {
  sendSosAlert();
});
