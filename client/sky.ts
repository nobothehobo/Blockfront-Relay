import * as THREE from "three";
import { mapTheme } from "../shared/game.js";

// Original deterministic cloud texture, generated once. Two texture samples per pixel,
// no raymarching, downloaded sky assets, postprocessing or additional scene lights.
function cloudTexture() {
  const size = 128,
    pixels = new Uint8Array(size * size * 4);
  const hash = (x: number, y: number, period: number) => {
    x = ((x % period) + period) % period;
    y = ((y % period) + period) % period;
    let n = Math.imul(x + y * 317 + 71, 1597334677);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (n >>> 0) / 4294967296;
  };
  const noise = (x: number, y: number, period: number) => {
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const a = x - ix,
      b = y - iy;
    const sx = a * a * (3 - 2 * a),
      sy = b * b * (3 - 2 * b);
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(hash(ix, iy, period), hash(ix + 1, iy, period), sx),
      THREE.MathUtils.lerp(
        hash(ix, iy + 1, period),
        hash(ix + 1, iy + 1, period),
        sx,
      ),
      sy,
    );
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let value = 0,
        weight = 0.57;
      for (const period of [8, 16, 32, 64]) {
        value +=
          noise((x / size) * period, (y / size) * period, period) * weight;
        weight *= 0.5;
      }
      const i = (x + size * y) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = Math.min(255, value * 255);
      pixels[i + 3] = 255;
    }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
export class Sky {
  material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      clouds: { value: cloudTexture() },
      time: { value: 0 },
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      sunColor: { value: new THREE.Color() },
      sunDirection: { value: new THREE.Vector3(-0.48, 0.64, -0.6).normalize() },
      cloudCoverage: { value: 0.5 },
    },
    vertexShader: `varying vec3 skyDirection;
      void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform sampler2D clouds; uniform float time; uniform float cloudCoverage;
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDirection;
      varying vec3 skyDirection;
      void main(){
        vec3 d=normalize(skyDirection);
        float elevation=max(0.0,d.y);
        vec3 color=mix(horizon,top,smoothstep(0.0,.82,elevation));
        float sunlight=max(0.0,dot(d,sunDirection));
        color+=sunColor*(pow(sunlight,36.0)*.18+pow(sunlight,320.0)*.32);
        vec2 uv=d.xz/(.32+elevation)*.24+vec2(time*.0018,time*.0007);
        float n=texture2D(clouds,uv).r*.76+texture2D(clouds,uv*1.93-vec2(time*.0012)).r*.24;
        float body=smoothstep(cloudCoverage,cloudCoverage+.14,n);
        body*=smoothstep(.03,.20,elevation);
        vec3 cloud=mix(horizon*.84,vec3(1.0,.97,.90),smoothstep(cloudCoverage+.02,cloudCoverage+.19,n));
        color=mix(color,cloud,body*.93);
        float disc=smoothstep(.99935,.99965,sunlight)*(1.0-body*.80);
        color=mix(color,sunColor*2.0,disc);
        // Hazy distant scenery lives outside the playable world, never obscures nearby voxels.
        float angle=atan(d.z,d.x);
        float ridge=.025+.013*sin(angle*7.0)+.009*sin(angle*17.0+1.4);
        float mountains=(1.0-smoothstep(ridge-.005,ridge+.005,d.y))*smoothstep(-.08,.005,d.y);
        color=mix(color,horizon*.80,mountains*.32);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), this.material);
  constructor() {
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
  }
  theme(seed: number) {
    const theme = mapTheme(seed),
      u = this.material.uniforms;
    u.top.value.setHex(
      theme.kind === 0 ? 0x719fc4 : theme.kind === 2 ? 0x6aa5d1 : 0x498fc7,
    );
    u.horizon.value.setHex(
      theme.kind === 0 ? 0xf0c39c : theme.kind === 2 ? 0xe2ecf1 : 0xc9dce4,
    );
    u.sunColor.value.setHex(theme.kind === 0 ? 0xffd69b : 0xffedd1);
    u.cloudCoverage.value = theme.kind === 2 ? 0.49 : 0.56;
  }
  update(camera: THREE.Camera, seconds: number) {
    this.mesh.position.copy(camera.position);
    this.material.uniforms.time.value = seconds;
  }
}
