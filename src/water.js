// 西湖水面：平面镜面反射 + 多层法线扰动 + 菲涅尔 + 太阳高光 + 湖水本色（碧绿微浊）
import * as THREE from 'three';

export class LakeWater extends THREE.Mesh {
  constructor(geometry, { normals, size = 512, sunDir, fog = true } = {}) {
    const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType });
    const textureMatrix = new THREE.Matrix4();
    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        mirrorSampler: { value: null },
        normalSampler: { value: null },
        textureMatrix: { value: new THREE.Matrix4() },
        time: { value: 0 },
        sunDirection: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color(1, 1, 1) },
        waterColor: { value: new THREE.Color(0x2f4a3e) },
        deepColor: { value: new THREE.Color(0x1d3029) },
        skyColor: { value: new THREE.Color(0x9fb4c4) },
        eye: { value: new THREE.Vector3() },
        distortion: { value: 3.5 },
        nightLights: { value: 0 },
      },
    ]);
    const material = new THREE.ShaderMaterial({
      uniforms,
      fog,
      vertexShader: /* glsl */`
        uniform mat4 textureMatrix;
        varying vec4 mirrorCoord;
        varying vec3 worldPos;
        #include <common>
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          worldPos = wp.xyz;
          mirrorCoord = textureMatrix * wp;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D mirrorSampler;
        uniform sampler2D normalSampler;
        uniform float time;
        uniform vec3 sunDirection;
        uniform vec3 sunColor;
        uniform vec3 waterColor;
        uniform vec3 deepColor;
        uniform vec3 skyColor;
        uniform vec3 eye;
        uniform float distortion;
        uniform float nightLights;
        varying vec4 mirrorCoord;
        varying vec3 worldPos;
        #include <common>
        #include <fog_pars_fragment>

        vec3 sampleN(vec2 uv) { return texture2D(normalSampler, uv).xyz * 2.0 - 1.0; }

        void main() {
          vec3 toEye = eye - worldPos;
          float dist = length(toEye);
          vec3 V = toEye / dist;
          vec2 p = worldPos.xz;
          // 四层不同尺度/方向的涟漪：近处细碎、远处平缓
          vec3 n1 = sampleN(p / 3.1 + vec2(time * 0.031, time * 0.017));
          vec3 n2 = sampleN(p / 7.3 - vec2(time * 0.012, -time * 0.026));
          vec3 n3 = sampleN(p / 19.0 + vec2(-time * 0.009, time * 0.011));
          vec3 n4 = sampleN(p / 61.0 + vec2(time * 0.004, time * 0.006));
          float nearW = clamp(1.0 - dist / 260.0, 0.0, 1.0);
          float midW = clamp(1.0 - dist / 1400.0, 0.0, 1.0);
          vec3 n = n1 * (0.55 * nearW) + n2 * (0.45 * nearW + 0.15) + n3 * (0.35 * midW + 0.1) + n4 * 0.35;
          vec3 N = normalize(vec3(n.x, 6.0 + dist * 0.004, n.y));

          // 反射
          vec2 dis = N.xz * distortion * (0.02 + 18.0 / (dist + 30.0));
          vec2 muv = mirrorCoord.xy / mirrorCoord.w + dis * 0.05;
          vec3 refl = texture2D(mirrorSampler, muv).rgb;

          // 菲涅尔（水 F0 ≈ 0.02）
          float cosT = clamp(dot(V, N), 0.0, 1.0);
          float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
          F = clamp(F * 1.05, 0.0, 1.0);

          // 湖水本色：近岸偏翠绿，视线越平越显深沉
          vec3 body = mix(waterColor, deepColor, clamp(dist / 900.0, 0.0, 1.0));
          float sunUp = clamp(sunDirection.y * 3.0 + 0.2, 0.0, 1.0);
          body *= (0.35 + 0.65 * sunUp) * (0.6 + 0.4 * max(dot(N, sunDirection), 0.0));
          body += skyColor * 0.04;

          // 太阳高光（粼粼波光）
          vec3 H = normalize(sunDirection + V);
          float spec = pow(max(dot(N, H), 0.0), 900.0) * 18.0 + pow(max(dot(N, H), 0.0), 120.0) * 0.6;
          spec *= sunUp;

          vec3 col = mix(body, refl, F * 0.92 + 0.06);
          col += sunColor * spec;
          // 夜间灯光倒影的跳动亮点
          col += nightLights * refl * 0.25 * smoothstep(0.6, 1.0, n1.x * 0.5 + 0.5);

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    super(geometry, material);
    this.isLakeWater = true;
    material.uniforms.mirrorSampler.value = rt.texture;
    material.uniforms.normalSampler.value = normals;
    material.uniforms.textureMatrix.value = textureMatrix;
    if (sunDir) material.uniforms.sunDirection.value = sunDir;

    const mirrorPlane = new THREE.Plane();
    const normal = new THREE.Vector3();
    const mirrorWorldPosition = new THREE.Vector3();
    const cameraWorldPosition = new THREE.Vector3();
    const rotationMatrix = new THREE.Matrix4();
    const lookAtPosition = new THREE.Vector3(0, 0, -1);
    const clipPlane = new THREE.Vector4();
    const view = new THREE.Vector3();
    const target = new THREE.Vector3();
    const q = new THREE.Vector4();
    const mirrorCamera = new THREE.PerspectiveCamera();
    mirrorCamera.layers.set(0);
    this.mirrorCamera = mirrorCamera;
    this.renderTarget = rt;
    this.enabled = true;
    this.frameSkip = 0;
    let frame = 0;

    this.onBeforeRender = (renderer, scene, camera) => {
      if (!this.enabled) return;
      if (camera === mirrorCamera) return;
      frame++;
      if (this.frameSkip && frame % (this.frameSkip + 1) !== 0) return;
      mirrorWorldPosition.setFromMatrixPosition(this.matrixWorld);
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
      rotationMatrix.extractRotation(this.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rotationMatrix);
      view.subVectors(mirrorWorldPosition, cameraWorldPosition);
      if (view.dot(normal) > 0) return;
      view.reflect(normal).negate().add(mirrorWorldPosition);
      rotationMatrix.extractRotation(camera.matrixWorld);
      lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition);
      target.subVectors(mirrorWorldPosition, lookAtPosition).reflect(normal).negate().add(mirrorWorldPosition);
      mirrorCamera.position.copy(view);
      mirrorCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
      mirrorCamera.lookAt(target);
      mirrorCamera.far = camera.far;
      mirrorCamera.near = Math.max(camera.near, 0.5);
      mirrorCamera.updateMatrixWorld();
      mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);
      textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      textureMatrix.multiply(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse);
      mirrorPlane.setFromNormalAndCoplanarPoint(normal, mirrorWorldPosition).applyMatrix4(mirrorCamera.matrixWorldInverse);
      clipPlane.set(mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant);
      const pm = mirrorCamera.projectionMatrix;
      q.x = (Math.sign(clipPlane.x) + pm.elements[8]) / pm.elements[0];
      q.y = (Math.sign(clipPlane.y) + pm.elements[9]) / pm.elements[5];
      q.z = -1.0;
      q.w = (1.0 + pm.elements[10]) / pm.elements[14];
      clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
      pm.elements[2] = clipPlane.x; pm.elements[6] = clipPlane.y; pm.elements[10] = clipPlane.z + 1.0; pm.elements[14] = clipPlane.w;
      material.uniforms.eye.value.setFromMatrixPosition(camera.matrixWorld);

      const currentRT = renderer.getRenderTarget();
      const xr = renderer.xr.enabled;
      const shadowAuto = renderer.shadowMap.autoUpdate;
      this.visible = false;
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(rt);
      renderer.state.buffers.depth.setMask(true);
      if (renderer.autoClear === false) renderer.clear();
      renderer.render(scene, mirrorCamera);
      this.visible = true;
      renderer.xr.enabled = xr;
      renderer.shadowMap.autoUpdate = shadowAuto;
      renderer.setRenderTarget(currentRT);
      const vp = camera.viewport;
      if (vp !== undefined) renderer.state.viewport(vp);
    };
  }
}
