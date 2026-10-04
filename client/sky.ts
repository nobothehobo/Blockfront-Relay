import * as THREE from "three";
import { mapTheme } from "../shared/game.js";

// Original deterministic cloud texture, generated once. Three cloud samples per pixel,
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
  dayTop = new THREE.Color();
  dayHorizon = new THREE.Color();
  nightTop = new THREE.Color(0x101a36);
  nightHorizon = new THREE.Color(0x303e5b);
  dusk = new THREE.Color(0xd9906a);
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
      night: { value: 0 },
    },
    vertexShader: `varying vec3 skyDirection;
      void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform sampler2D clouds; uniform float time; uniform float cloudCoverage;
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDirection;
      uniform float night; varying vec3 skyDirection;
      void main(){
        vec3 d=normalize(skyDirection);
        float elevation=max(0.0,d.y);
        vec3 color=mix(horizon,top,smoothstep(0.0,.82,elevation));
        float sunlight=max(0.0,dot(d,sunDirection));
        color+=sunColor*(pow(sunlight,18.0)*.10+pow(sunlight,180.0)*.25)*(1.0-night);
        vec2 uv=d.xz/(.32+elevation)*.24+vec2(time*.0018,time*.0007);
        float n=texture2D(clouds,uv).r*.76+texture2D(clouds,uv*1.93-vec2(time*.0012)).r*.24;
        float body=smoothstep(cloudCoverage,cloudCoverage+.14,n);
        body*=smoothstep(.03,.20,elevation);
        float shade=texture2D(clouds,uv+sunDirection.xz*.025).r;
        float rim=smoothstep(.0,.10,n-shade)*.16*pow(sunlight,4.0);
        vec3 cloud=mix(horizon*.64,mix(vec3(1.0,.97,.90),vec3(.10,.14,.24),night),smoothstep(cloudCoverage+.03,cloudCoverage+.20,n));
        cloud+=sunColor*rim;
        color=mix(color,cloud,body*.90);
        float disc=smoothstep(.99935,.99965,sunlight)*(1.0-body*.80)*(1.0-night);
        color=mix(color,sunColor*2.0,disc);
        if (night > .001) {
        float moon=max(0.0,dot(d,-sunDirection));
        float moonDisc=smoothstep(.9993,.9996,moon)*night*(1.0-body*.9);
        color=mix(color,vec3(.55,.67,.85),moonDisc);
        vec3 starCell=floor(d*260.0);
        float starHash=fract(sin(dot(starCell,vec3(12.9898,78.233,37.719)))*43758.5453);
        float star=step(.992,starHash)*pow(max(0.0,1.0-length(fract(d*260.0)-.5)*2.0),8.0);
        color+=vec3(.62,.75,.92)*star*night*smoothstep(.06,.25,elevation)*(1.0-body);
        }
        // Hazy distant scenery lives outside the playable world, never obscures nearby voxels.
        float angle=atan(d.z,d.x);
        float ridge=.025+.013*sin(angle*7.0)+.009*sin(angle*17.0+1.4);
        float mountains=(1.0-smoothstep(ridge-.005,ridge+.005,d.y))*smoothstep(-.08,.005,d.y);
        color=mix(color,horizon*.64,mountains*.5);
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
  theme(seed: number, outbreak = false) {
    const theme = mapTheme(seed),
      u = this.material.uniforms;
    u.top.value.setHex(
      theme.kind === 0 ? 0x719fc4 : theme.kind === 2 ? 0x6aa5d1 : 0x498fc7,
    );
    u.horizon.value.setHex(
      theme.kind === 0 ? 0xf0c39c : theme.kind === 2 ? 0xc5dae8 : 0xc9dce4,
    );
    u.sunColor.value.setHex(theme.kind === 0 ? 0xffd69b : 0xffedd1);
    u.cloudCoverage.value = theme.kind === 2 ? 0.49 : 0.56;
    if (outbreak) {
      u.top.value.setHex(0x34485f);
      u.horizon.value.setHex(0x9baa9b);
      u.sunColor.value.setHex(0xe9d1a2);
      u.cloudCoverage.value = 0.49;
    }
    this.dayTop.copy(u.top.value);
    this.dayHorizon.copy(u.horizon.value);
    this.nightTop.setHex(theme.kind === 3 ? 0x090f2a : 0x101a36);
    this.nightHorizon.setHex(theme.kind === 3 ? 0x202944 : 0x303e5b);
  }
  atmosphere(
    day: number,
    twilight: number,
    sun: { x: number; y: number; z: number },
  ) {
    const u = this.material.uniforms;
    u.top.value.copy(this.nightTop).lerp(this.dayTop, day);
    u.horizon.value.copy(this.nightHorizon).lerp(this.dayHorizon, day);
    u.horizon.value.lerp(this.dusk, twilight * 0.34);
    u.sunDirection.value.set(sun.x, sun.y, sun.z).normalize();
    u.night.value = 1 - day;
  }
  update(camera: THREE.Camera, seconds: number) {
    this.mesh.position.copy(camera.position);
    this.material.uniforms.time.value = seconds;
  }
}
