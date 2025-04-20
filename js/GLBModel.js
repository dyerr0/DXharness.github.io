/**
 * GLBModel
 * @autor: funnyzak
 * @email: silenceace@gmail.com
 *
 * Soporta:
 * - Modelos base (carro, llantas…).
 * - Tecla “1” para alternar luz_off / luz_on.
 * - Animaciones en bucle, escala/offset consistente.
 */
class GLBModel {
  static init(config) {
    // --- Configuración básica ---
    this.debug = !!config.debug;
    this.container = document.getElementById(config.containerId);
    this.autoRotate = !!config.autoRotate;
    this.rotationSpeed = config.rotationSpeed;
    this.cameraPosition = config.cameraPosition;
    this.modelRotation = config.modelRotation || { x: 0, y: 0, z: 0 };
    this.lightIntensity = config.lightIntensity;
    this.ambientLightIntensity = config.ambientLightIntensity;
    this.enableControls = config.enableControls !== false;
    this.controlsConfig = {
      enableDamping: true,
      dampingFactor: 0.05,
      screenSpacePanning: false,
      minDistance: 1,
      maxDistance: 10,
      maxPolarAngle: Math.PI / 2,
      enablePan: true,
      enableZoom: true,
      ...config.controls,
    };

    // Modelos base
    this.modelPaths = Array.isArray(config.modelPaths)
      ? config.modelPaths
      : [config.modelPath];
    // Modelos por tecla
    this.keyModelsConfig = config.keyModels || {};
    this.keyModels = {};

    this.enabledShadow = !!config.enabledShadow;
    this.shadowAngle = config.shadowAngle || { x: 0, y: 1, z: 0 };

    this.initLoadingScreen(config.loadingScreenId);
    this.initScene();

    this.clock = new THREE.Clock();
    this.mixers = [];

    this.loadModels();
    this._setupKeyModels();
    this.animate();
  }

  static initLoadingScreen(id) {
    this.loadingScreen = document.getElementById(id);
    this.progressBar = this.loadingScreen.querySelector('#progress-bar');
    this.progressElement = this.loadingScreen.querySelector('#progress');
    this.loadingText = this.loadingScreen.querySelector('#loading-text');
  }

  static initScene() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(
      this.cameraPosition.x,
      this.cameraPosition.y,
      this.cameraPosition.z
    );

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    if (this.enabledShadow) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.container.appendChild(this.renderer.domElement);

    if (this.enableControls) {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      Object.assign(this.controls, this.controlsConfig);
      this.controls.enablePan = this.controlsConfig.enablePan;
      this.controls.enableZoom = this.controlsConfig.enableZoom;
    }

    const ambient = new THREE.AmbientLight(0xffffff, this.ambientLightIntensity);
    this.scene.add(ambient);

    const dir1 = new THREE.DirectionalLight(0xffffff, this.lightIntensity);
    dir1.position.set(1, 1, 1);
    this.scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0xffffff, this.lightIntensity);
    dir2.position.set(-1, -1, -1);
    this.scene.add(dir2);

    this.mainLight = new THREE.DirectionalLight(0xffffff, this.lightIntensity);
    this.mainLight.position.set(
      this.shadowAngle.x,
      this.shadowAngle.y,
      this.shadowAngle.z
    );
    this.mainLight.castShadow = this.enabledShadow;
    this.scene.add(this.mainLight);

    if (this.enabledShadow) {
      this.mainLight.shadow.mapSize.width = 1024;
      this.mainLight.shadow.mapSize.height = 1024;
      this.mainLight.shadow.camera.near = 1;
      this.mainLight.shadow.camera.far = 10;
      if (this.debug) {
        const helper = new THREE.DirectionalLightHelper(this.mainLight, 5);
        this.scene.add(helper);
      }
      const planeGeo = new THREE.PlaneGeometry(50, 50);
      const planeMat = new THREE.ShadowMaterial({ opacity: 0.3 });
      this.shadowPlane = new THREE.Mesh(planeGeo, planeMat);
      this.shadowPlane.rotation.x = -Math.PI / 2;
      this.shadowPlane.position.y = -1;
      this.shadowPlane.receiveShadow = true;
      this.scene.add(this.shadowPlane);
    }

    window.addEventListener('resize', this.onWindowResize.bind(this), false);
  }

  static loadModels() {
    const loader = new THREE.GLTFLoader();
    const paths = this.modelPaths;
    const total = paths.length;
    let loaded = 0;

    // Cargo primero el primer modelo (base)
    loader.load(
      paths[0],
      (gltf) => {
        const m0 = gltf.scene;
        m0.rotation.set(
          this.modelRotation.x,
          this.modelRotation.y,
          this.modelRotation.z
        );
        const box = new THREE.Box3().setFromObject(m0);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;
        this._globalScale = scale;
        this._globalOffset = center.multiplyScalar(scale);
        m0.scale.setScalar(scale);
        m0.position.sub(this._globalOffset);
        m0.traverse((n) => {
          if (n.isMesh) {
            n.castShadow = this.enabledShadow;
            n.receiveShadow = this.enabledShadow;
          }
        });
        this.scene.add(m0);
        if (gltf.animations?.length) {
          const mix0 = new THREE.AnimationMixer(m0);
          this.mixers.push(mix0);
          gltf.animations.forEach((c) => {
            const a = mix0.clipAction(c);
            a.setLoop(THREE.LoopRepeat, Infinity).play();
          });
        }
        loaded++;
        this._updateProgress(loaded, total);

        // Cargo los siguientes (llantas, etc.)
        for (let i = 1; i < paths.length; i++) {
          loader.load(
            paths[i],
            (g2) => {
              const m2 = g2.scene;
              m2.rotation.set(
                this.modelRotation.x,
                this.modelRotation.y,
                this.modelRotation.z
              );
              m2.scale.setScalar(this._globalScale);
              m2.position.sub(this._globalOffset);
              m2.traverse((n) => {
                if (n.isMesh) {
                  n.castShadow = this.enabledShadow;
                  n.receiveShadow = this.enabledShadow;
                }
              });
              this.scene.add(m2);
              if (g2.animations?.length) {
                const mix2 = new THREE.AnimationMixer(m2);
                this.mixers.push(mix2);
                g2.animations.forEach((c) => {
                  const a2 = mix2.clipAction(c);
                  a2.setLoop(THREE.LoopRepeat, Infinity).play();
                });
              }
              loaded++;
              this._updateProgress(loaded, total);
            },
            undefined,
            (e) => console.error('Error loading', paths[i], e)
          );
        }
      },
      undefined,
      (e) => console.error('Error loading', paths[0], e)
    );
  }

  static _updateProgress(loaded, total) {
    const pct = Math.round((loaded / total) * 100);
    this.progressElement.style.width = pct + '%';
    this.loadingText.textContent =
      pct >= 100 ? 'Finalizing...' : 'Loading ' + pct + '%';
    if (loaded === total) {
      this.loadingScreen.style.display = 'none';
      this._initKeyModels();
    }
  }

  static _setupKeyModels() {
    // Prepara estructura y listeners
    for (const code in this.keyModelsConfig) {
      this.keyModels[code] = {
        paths: this.keyModelsConfig[code],
        mesh: null,
        pressed: false,
      };
    }
    window.addEventListener('keydown', (e) => {
      const km = this.keyModels[e.code];
      if (km && !km.pressed) {
        km.pressed = true;
        this._swapKeyModel(e.code, 'on');
      }
    });
    window.addEventListener('keyup', (e) => {
      const km = this.keyModels[e.code];
      if (km && km.pressed) {
        km.pressed = false;
        this._swapKeyModel(e.code, 'off');
      }
    });
  }

  static _initKeyModels() {
    // Carga inicial en estado “off”
    for (const code in this.keyModels) {
      this._loadKeyModel(code, this.keyModels[code].paths.off);
    }
  }

  static _loadKeyModel(code, path) {
    const loader = new THREE.GLTFLoader();
    loader.load(
      path,
      (gltf) => {
        const prev = this.keyModels[code].mesh;
        if (prev) this.scene.remove(prev);

        const m = gltf.scene;
        m.rotation.set(
          this.modelRotation.x,
          this.modelRotation.y,
          this.modelRotation.z
        );
        m.scale.setScalar(this._globalScale);
        m.position.sub(this._globalOffset);
        m.traverse((n) => {
          if (n.isMesh) {
            n.castShadow = this.enabledShadow;
            n.receiveShadow = this.enabledShadow;
          }
        });
        this.scene.add(m);
        this.keyModels[code].mesh = m;

        if (gltf.animations?.length) {
          const mix = new THREE.AnimationMixer(m);
          this.mixers.push(mix);
          gltf.animations.forEach((c) => {
            const a = mix.clipAction(c);
            a.setLoop(THREE.LoopRepeat, Infinity).play();
          });
        }
      },
      undefined,
      (e) => console.error('Error loading key model', code, e)
    );
  }

  static _swapKeyModel(code, state) {
    this._loadKeyModel(code, this.keyModels[code].paths[state]);
  }

  static onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  static animate() {
    requestAnimationFrame(this.animate.bind(this));

    const delta = this.clock.getDelta();
    this.mixers.forEach((m) => m.update(delta));

    if (this.enableControls) this.controls.update();
    if (this.autoRotate) this.scene.rotation.y += this.rotationSpeed;

    this.renderer.render(this.scene, this.camera);
  }
}
