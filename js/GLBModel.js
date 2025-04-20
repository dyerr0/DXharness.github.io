/**
 * GLBModel
 * @autor: funnyzak
 * @email: silenceace@gmail.com
 *
 * Soporta uno o varios modelos superpuestos, manteniendo la escala y posición relativa.
 *
 * Usage:
 *   const config = {
 *     containerId: 'container',
 *     loadingScreenId: 'loading-screen',
 *     // Puede ser un string único o un array de rutas:
 *     modelPath: 'assets/carro.glb',
 *     modelPaths: ['assets/carro.glb', 'assets/llantas.glb'],
 *     autoRotate: true,
 *     rotationSpeed: 0.002,
 *     cameraPosition: { x: 0, y: 0, z: 3 },
 *     modelRotation: { x: 0, y: 0, z: 0 },
 *     lightIntensity: 0.8,
 *     ambientLightIntensity: 0.7,
 *     controls: {
 *       enableDamping: true,
 *       dampingFactor: 0.05,
 *       screenSpacePanning: false,
 *       minDistance: 1,
 *       maxDistance: 10,
 *       maxPolarAngle: Math.PI / 2,
 *     },
 *     enabledShadow: false,
 *     shadowAngle: { x: 0, y: 1, z: 0 },
 *   };
 *   GLBModel.init(config);
 */
class GLBModel {
  static init(config) {
    this.debug = config.debug || false;
    this.container = document.getElementById(config.containerId);
    this.autoRotate = config.autoRotate;
    this.rotationSpeed = config.rotationSpeed;
    this.cameraPosition = config.cameraPosition;
    this.modelRotation = config.modelRotation || { x: 0, y: 0, z: 0 };
    this.lightIntensity = config.lightIntensity;
    this.ambientLightIntensity = config.ambientLightIntensity;
    this.enableControls = config.enableControls !== undefined ? config.enableControls : true;
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
    // Acepta uno o varios modelos
    this.modelPaths = Array.isArray(config.modelPaths)
      ? config.modelPaths
      : [config.modelPath];
    this.enabledShadow = config.enabledShadow || false;
    this.shadowAngle = config.shadowAngle || { x: 0, y: 1, z: 0 };

    this.initLoadingScreen(config.loadingScreenId);
    this.initScene();

    this.clock = new THREE.Clock();
    this.mixers = [];

    this.loadModels();
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
      this.controls = new THREE.OrbitControls(
        this.camera,
        this.renderer.domElement
      );
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

    window.addEventListener(
      'resize',
      this.onWindowResize.bind(this),
      false
    );
  }

  static loadModels() {
    const loader = new THREE.GLTFLoader();
    const paths = this.modelPaths;
    const total = paths.length;
    let loaded = 0;
    const startTime = Date.now();
    let simulated = 0;

    const updateProgress = () => {
      const pct = Math.round((loaded / total) * 100);
      this.progressElement.style.width = pct + '%';
      this.loadingText.textContent =
        pct >= 100 ? 'Finalizing...' : 'Loading ' + pct + '%';
      if (loaded === total) this.loadingScreen.style.display = 'none';
    };

    // Primero cargo el modelo base
    loader.load(
      paths[0],
      (gltf) => {
        const model = gltf.scene;

        // giro base
        model.rotation.set(
          this.modelRotation.x,
          this.modelRotation.y,
          this.modelRotation.z
        );
        // bbox para escala y offset
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;
        this._globalScale = scale;
        this._globalOffset = center.multiplyScalar(scale);

        model.scale.setScalar(scale);
        model.position.sub(this._globalOffset);

        model.traverse((n) => {
          if (n.isMesh) {
            n.castShadow = this.enabledShadow;
            n.receiveShadow = this.enabledShadow;
          }
        });

        this.scene.add(model);

        if (gltf.animations?.length) {
          const mixer = new THREE.AnimationMixer(model);
          this.mixers.push(mixer);
          gltf.animations.forEach((clip) => {
            const action = mixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat, Infinity).play();
          });
        }

        loaded++;
        updateProgress();

        // luego cargo los demás modelos, aplicando misma escala y offset
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
                g2.animations.forEach((clip) => {
                  const act = mix2.clipAction(clip);
                  act.setLoop(THREE.LoopRepeat, Infinity).play();
                });
              }

              loaded++;
              updateProgress();
            },
            undefined,
            (err) => console.error('Error loading', paths[i], err)
          );
        }
      },
      undefined,
      (err) => console.error('Error loading', paths[0], err)
    );
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
    if (this.autoRotate) {
      // rota todo el scene group
      this.scene.rotation.y += this.rotationSpeed;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
