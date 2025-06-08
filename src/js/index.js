import * as THREE from "three";
import {
  ForgeRenderer,
  PointerControls,
  SplatMesh,
  VRButton,
} from "@forge-gfx/forge";
import GUI from "lil-gui";
import { getAssetFileURL } from "/dist/comfyui-3d-gs-renderer-web/js/get-asset-url.js";

// cloud bounds
const BOUNDS = {
  MIN_X: -8,
  MAX_X: 8,
  MIN_Y: -0.33,
  MAX_Y: 0.33,
  MIN_Z: -8,
  MAX_Z: 10,
};

// cloud appearance parameters
const params = {
  windSpeed: -0.3,

  particleCount: 20000,
  opacity: 0.5,
  fluffiness: 0.5,
  turbulence: 0.5,
  cloudDensity: 0.7,

  color1: new THREE.Color(1.0, 1.0, 1.0),
  color2: new THREE.Color(0.87, 0.87, 0.87),

  octaves: 4,
  frequency: 0.3,
  amplitude: 0.5,
  lacunarity: 2.0,
  persistence: 0.5,
  phase: 0.1,
};

const presets = {
  "Partially Cloudy": {
    particleCount: 10000,

    color1: new THREE.Color(1.0, 1.0, 1.0),
    color2: new THREE.Color(0.87, 0.87, 0.87),

    opacity: 0.3,
    windSpeed: -0.5,
    fluffiness: 0.5,
    turbulence: 0.5,
    cloudDensity: 0.5,
  },
  Cloudy: {
    particleCount: 20000,

    color1: new THREE.Color(1.0, 1.0, 1.0),
    color2: new THREE.Color(0.87, 0.87, 0.87),

    opacity: 0.5,
    windSpeed: -0.3,
    fluffiness: 0.5,
    turbulence: 0.5,
    cloudDensity: 0.7,
  },
  Storm: {
    particleCount: 30000,

    color1: new THREE.Color(0.66, 0.66, 0.66),
    color2: new THREE.Color(0.44, 0.44, 0.44),

    opacity: 0.7,
    windSpeed: -0.7,
    fluffiness: 1.0,
    turbulence: 0.8,
    cloudDensity: 1.0,
  },
};

// fBM noise implementation
function noise(x, y, z, t, noiseParams) {
  let value = 0;
  let amp = noiseParams.amplitude;
  let freq = noiseParams.frequency;

  for (let i = 0; i < noiseParams.octaves; i++) {
    const to = t * noiseParams.phase * (i + 1);

    // 3D grid of sines
    value +=
      amp *
      Math.sin(x * freq + to) *
      Math.sin(y * freq + to) *
      Math.sin(z * freq + to);

    freq *= noiseParams.lacunarity;
    amp *= noiseParams.persistence;
  }

  return value;
}

function wrap(val, min, max) {
  const range = max - min;
  return ((((val - min) % range) + range) % range) + min;
}

// create splats from current params
function createClouds(splats, particleCount) {
  const topColor = new THREE.Color().copy(params.color1);
  const bottomColor = new THREE.Color().copy(params.color2);

  const center = new THREE.Vector3();
  const scales = new THREE.Vector3(0.12, 0.08, 0.12);
  const quaternion = new THREE.Quaternion();
  const color = new THREE.Color();

  const now = performance.now() * 0.001 * 0.2;

  for (let i = 0; i < particleCount; i++) {
    // Generate consistent randomness per particle
    // (prevents flickering during recreation)
    // based on common rand() one-liner
    // see https://web.archive.org/web/20080211204527/http://lumina.sourceforge.net/Tutorials/Noise.html
    const seed = i * 0.12345;
    const random = new THREE.Vector4(
      (Math.sin(seed * 12.9898) * 43758.5453) % 1,
      (Math.sin(seed * 78.233) * 43758.5453) % 1,
      (Math.sin(seed * 37.719) * 43758.5453) % 1,
      (Math.sin(seed * 93.989) * 43758.5453) % 1,
    )
    .multiplyScalar(0.5)
    .addScalar(0.5);

    // Set base positions within bounds
    let x = THREE.MathUtils.lerp(BOUNDS.MIN_X, BOUNDS.MAX_X, random.x);
    let y = THREE.MathUtils.lerp(BOUNDS.MIN_Y, BOUNDS.MAX_Y, random.y);
    let z = THREE.MathUtils.lerp(BOUNDS.MIN_Z, BOUNDS.MAX_Z, random.z);

    // apply vertical variation (fluffiness)
    const fluffiness =
      Math.sin(random.w * Math.PI * 2) * params.fluffiness * 0.5;
    y += fluffiness;

    // apply horizontal variation (turbulence)
    const turbulence =
      Math.sin(random.w * Math.PI * 8) * params.turbulence * 0.3;
    x += turbulence;

    // Add fBM noise
    const n = noise(x, y, z, now, params) * params.fluffiness * 0.1;
    y += n;

    // Color gradient based on normalized height
    const t = THREE.MathUtils.clamp(
      (y - BOUNDS.MIN_Y) / (BOUNDS.MAX_Y - BOUNDS.MIN_Y),
      0,
      1,
    );
    color.copy(bottomColor).lerp(topColor, t);

    x = wrap(x, BOUNDS.MIN_X, BOUNDS.MAX_X);
    y = wrap(y, BOUNDS.MIN_Y, BOUNDS.MAX_Y);
    z = wrap(z, BOUNDS.MIN_Z, BOUNDS.MAX_Z);

    const opacity = Math.max(
      0.1,
      params.opacity * (0.8 + 0.4 * Math.abs(fluffiness)),
    );

    center.set(x, y, z);
    splats.pushSplat(center, scales, quaternion, opacity, color);
  }
}

// animate splats within bounds
function createCloudAnimation(params, BOUNDS) {
  return ({ mesh, time, deltaTime }) => {
    mesh.packedSplats.forEachSplat(
      (index, center, scales, quaternion, opacity, color) => {
        const seed = index * 0.12345;
        const randomZ = (Math.sin(seed * 37.719) * 43758.5453) % 1;
        const zZero = THREE.MathUtils.lerp(
          BOUNDS.MIN_Z,
          BOUNDS.MAX_Z,
          Math.abs(randomZ),
        );

        const displacement = params.windSpeed * time;
        const range = BOUNDS.MAX_Z - BOUNDS.MIN_Z;

        let newZ = zZero + displacement;
        newZ =
          ((((newZ - BOUNDS.MIN_Z) % range) + range) % range) + BOUNDS.MIN_Z;

        center.set(center.x, center.y, newZ);
        mesh.packedSplats.setSplat(
          index,
          center,
          scales,
          quaternion,
          opacity,
          color,
        );
      },
    );
    mesh.packedSplats.needsUpdate = true;
    mesh.needsUpdate = true;
  };
}

// creates splat mesh from cloud params
function createCloudMesh(params, BOUNDS) {
  const actualParticleCount = Math.floor(
    params.particleCount * params.cloudDensity,
  );

  return new SplatMesh({
    maxSplats: actualParticleCount,
    constructSplats: (splats) => {
      createClouds(splats, actualParticleCount);
    },
    onFrame: createCloudAnimation(params, BOUNDS),
  });
}

export class CloudRenderer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );

    this.scene.background = new THREE.Color(0x08a2d3);

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.forge = new ForgeRenderer({ renderer: this.renderer });
    this.scene.add(this.forge);

    this.setupResizeHandler();
    this.setupControls();
    this.setupSky();
    this.setupClouds();
    this.setupGUI();
    this.startAnimation();
  }

  setupResizeHandler() {
    const handleResize = () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    };

    window.addEventListener("resize", handleResize);
  }

  async setupSky() {
    const skyGeometry = new THREE.SphereGeometry(10, 60, 40);
    const skyMaterial = new THREE.MeshBasicMaterial({
      map: new THREE.TextureLoader().load(await getAssetFileURL("sky.jpeg")),
      side: THREE.BackSide,
      depthWrite: false,
    });
    const skySphere = new THREE.Mesh(skyGeometry, skyMaterial);
    skySphere.scale.set(-1, 1, 1);
    skySphere.renderDepth = 1000.0;
    this.scene.add(skySphere);
    this.camera.position.set(0, 0, 0);
    skySphere.position.copy(this.camera.position);
  }

  setupControls() {
    this.controls = new PointerControls({ canvas: this.renderer.domElement });
  }

  setupClouds() {
    this.clouds = createCloudMesh(params, BOUNDS);
    this.clouds.position.set(0, -0.5, -2);
    this.scene.add(this.clouds);
  }

  recreateClouds() {
    if (this.clouds) {
      this.scene.remove(this.clouds);
      this.clouds.dispose();
    }

    this.clouds = createCloudMesh(params, BOUNDS);
    this.clouds.position.set(0, -0.5, -2);
    this.scene.add(this.clouds);
  }

  setupGUI() {
    const gui = new GUI({ title: "Clouds" });
    gui.add(params, "windSpeed", -1, 1, 0.1).name("Wind Speed");
    gui
      .add(params, "opacity", 0.05, 1, 0.01)
      .name("Thickness")
      .onChange(() => this.recreateClouds());
    gui
      .add(params, "fluffiness", 0, 2, 0.01)
      .name("Fluffiness")
      .onChange(() => this.recreateClouds());
    gui
      .add(params, "turbulence", 0, 1, 0.01)
      .name("Turbulence")
      .onChange(() => this.recreateClouds());
    gui
      .add(params, "cloudDensity", 0.1, 1, 0.01)
      .name("Cloud Density")
      .onChange(() => this.recreateClouds());

    // advanced noise params
    const advancedFolder = gui.addFolder("Advanced");
    advancedFolder
      .add(params, "octaves", 1, 8, 1)
      .name("Noise Octaves")
      .onChange(() => this.recreateClouds());
    advancedFolder
      .add(params, "frequency", 0.1, 1, 0.01)
      .name("Noise Frequency")
      .onChange(() => this.recreateClouds());

    const presetsFolder = gui.addFolder("Weather");
    for (const [name, preset] of Object.entries(presets)) {
      presetsFolder.add(
        {
          [name]: () => {
            Object.assign(params, preset);
            this.recreateClouds();
            for (const controller of gui.controllersRecursive()) {
              controller.updateDisplay();
            }
          },
        },
        name,
      );
    }
  }

  startAnimation() {
    let lastTime = 0;
    const animate = (time) => {
      const deltaTime = (time - lastTime) * 0.001;
      lastTime = time;

      this.controls.update(deltaTime, this.camera);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }

  dispose() {
    // Clean up resources
    if (this.clouds) {
      this.scene.remove(this.clouds);
      this.clouds.dispose();
    }
    this.renderer.dispose();
    // Remove the canvas from the container
    this.container.removeChild(this.renderer.domElement);
  }
}
