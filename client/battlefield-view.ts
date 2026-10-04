import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { W, D, Player } from "../shared/game.js";
import { Sector, SupplyStation } from "../shared/battlefield.js";
type Part = [number, number, number, number, number, number, number];
function model(parts: Part[]) {
  const geometries = parts.map(([w, h, d, x, y, z, color]) => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.translate(x, y, z);
    const c = new THREE.Color(color),
      colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry;
  });
  const geometry = mergeGeometries(geometries)!;
  geometries.forEach((g) => g.dispose());
  return new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
}
const teamColor = (team: number) =>
  team === 0 ? 0x57ded0 : team === 1 ? 0xff9d59 : 0xc8dbdf;
export class BattlefieldView {
  group = new THREE.Group();
  stations = [0, 1].map((team) => {
    const color = teamColor(team);
    const mesh = model([
      [2.4, 0.25, 1.6, 0, 0.13, 0, 0x273b46],
      [2, 1.1, 1.4, 0, 0.8, 0, color],
      [2.2, 0.15, 1.55, 0, 1.43, 0, 0x718586],
      [0.14, 1.15, 1.5, -0.65, 0.8, 0, 0x304a53],
      [0.14, 1.15, 1.5, 0.65, 0.8, 0, 0x304a53],
      [0.7, 0.15, 0.03, 0, 0.85, 0.72, 0xffedb1],
      [0.15, 0.7, 0.03, 0, 0.85, 0.72, 0xffedb1],
      [0.6, 0.13, 0.6, 0, 1.57, 0, 0xffedb1],
    ]);
    this.group.add(mesh);
    return mesh;
  });
  sectors = ["A", "B", "C"].map((name, index) => {
    const group = new THREE.Group();
    const parts: Part[] = [
      [1.5, 0.2, 1.5, 0, 0.1, 0, 0x384d54],
      [0.4, 3, 0.4, 0, 1.7, 0, 0x71858a],
      [1.5, 0.4, 0.5, 0, 3.2, 0, 0x273b46],
    ];
    const letters = [
      ["010", "101", "111", "101", "101"],
      ["110", "101", "110", "101", "110"],
      ["111", "100", "100", "100", "111"],
    ];
    letters[index].forEach((row, y) =>
      [...row].forEach((v, x) => {
        if (v === "1")
          parts.push([
            0.22,
            0.22,
            0.08,
            (x - 1) * 0.25,
            4.1 - y * 0.25,
            -0.3,
            0xffedb1,
          ]);
      }),
    );
    group.add(model(parts));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(5.65, 6, 32),
      new THREE.MeshBasicMaterial({
        color: 0xc8dbdf,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.12, 0.56),
      new THREE.MeshBasicMaterial({ color: 0xc8dbdf }),
    );
    bar.position.y = 3.48;
    group.add(bar);
    this.group.add(group);
    return { group, ring, bar, name };
  });
  update(
    state: {
      mode: string;
      supplyStations?: SupplyStation[];
      controlPoints?: Sector[];
    },
    local: Player,
    time: number,
  ) {
    this.group.visible = true;
    this.stations.forEach((mesh, i) => {
      const station = state.supplyStations?.[i];
      mesh.visible = !!station;
      if (station)
        mesh.position.set(station.pos.x, station.pos.y, station.pos.z);
    });
    this.sectors.forEach((view, i) => {
      const point = state.controlPoints?.[i];
      view.group.visible = state.mode === "frontline" && !!point;
      if (!point) return;
      view.group.position.set(point.pos.x, point.pos.y, point.pos.z);
      view.ring.material.color.setHex(
        point.contested ? 0xffdf88 : teamColor(point.owner),
      );
      view.ring.material.opacity = point.contested
        ? 0.5 + Math.sin(time * 5) * 0.2
        : 0.65;
      view.bar.material.color.setHex(
        teamColor(point.capturing >= 0 ? point.capturing : point.owner),
      );
      view.bar.scale.x =
        point.progress > 0 ? Math.max(0.04, point.progress) : 1;
    });
  }
}
// One water draw call: cheap animated highlights and stylized sky reflection,
// with no reflection render targets, postprocessing or per-frame allocations.
export class WaterSurface {
  material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 },
      tint: { value: new THREE.Color(0x318aa2) },
      detail: { value: 1 },
      daylight: { value: 1 },
      skyTint: { value: new THREE.Color(0xc9dce4) },
    },
    vertexShader: `varying vec3 worldPoint; void main(){ vec4 p=modelMatrix*vec4(position,1.0); worldPoint=p.xyz; gl_Position=projectionMatrix*viewMatrix*p; }`,
    fragmentShader: `uniform float time; uniform float detail; uniform float daylight; uniform vec3 tint; uniform vec3 skyTint; varying vec3 worldPoint;
      void main(){ vec3 view=normalize(cameraPosition-worldPoint); float fresnel=pow(1.0-abs(view.y),3.0);
        float wave=sin(worldPoint.x*.75+worldPoint.z*.35+time*.65)*sin(worldPoint.z*1.2-time*.5);
        float glint=pow(max(0.0,wave),18.0)*detail;
        vec3 reflection=mix(vec3(.69,.82,.88),vec3(.35,.61,.76),clamp(abs(view.y)*2.0,0.0,1.0));
        reflection=mix(skyTint*.8,reflection,daylight);
        vec3 color=mix(tint*(.25+.55*daylight),reflection,fresnel*.68)+glint*vec3(.18,.25,.24)*(.25+.75*daylight);
        gl_FragColor=vec4(color,.78+fresnel*.18);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  mesh = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.5, 28), this.material);
  constructor() {
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(W / 2, 6.8, D / 2);
  }
  theme(color: number) {
    this.material.uniforms.tint.value.setHex(color);
  }
  atmosphere(day: number, sky: THREE.Color) {
    this.material.uniforms.daylight.value = day;
    this.material.uniforms.skyTint.value.copy(sky);
  }
  update(time: number, detail: boolean) {
    this.material.uniforms.time.value = time;
    this.material.uniforms.detail.value = detail ? 1 : 0;
  }
}
