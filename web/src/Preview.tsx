import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { BaseProfile, NameplateMesh } from "../../src/nameplate";

const PLATE_COLOUR = 0xdecdaa;
const BASE_COLOUR = 0x464a50;
const BASE_SEGMENTS = 160;

interface Props {
  mesh: NameplateMesh | undefined;
  base: BaseProfile;
}

/** The nameplate on a stand-in base, seen from the plate's side (+x) and slightly above. Base axis is +z. */
export function Preview({ mesh, base }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const scene = useRef<{ plate: THREE.Mesh; base: THREE.Mesh; frame: (diameter: number) => void }>(undefined);

  useEffect(() => {
    const element = container.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    element.appendChild(renderer.domElement);

    const world = new THREE.Scene();
    world.background = new THREE.Color(0xf2f0eb);
    world.add(new THREE.HemisphereLight(0xffffff, 0x80786c, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(40, 25, 60);
    world.add(sun);

    const camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const plate = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: PLATE_COLOUR, flatShading: true, roughness: 0.6 }),
    );
    const baseMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: BASE_COLOUR, roughness: 0.8 }),
    );
    world.add(plate, baseMesh);

    // Points the camera at the plate's side from a distance that fits the base, stepping back in narrow views.
    const frame = (diameter: number) => {
      const distance = diameter * Math.max(1, 1.3 / camera.aspect);
      camera.position.set(distance * 1.9, 0, distance * 0.9);
      controls.target.set(0, 0, 1.5);
      controls.update();
    };

    const resize = () => {
      const { clientWidth, clientHeight } = element;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(world, camera);
    });
    scene.current = { plate, base: baseMesh, frame };

    return () => {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      plate.geometry.dispose();
      baseMesh.geometry.dispose();
      element.removeChild(renderer.domElement);
      scene.current = undefined;
    };
  }, []);

  useEffect(() => {
    const plate = scene.current?.plate;
    if (!plate) return;
    plate.visible = !!mesh;
    if (!mesh) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
    plate.geometry.dispose();
    plate.geometry = geometry;
  }, [mesh]);

  useEffect(() => {
    const current = scene.current;
    // An impossible profile is refused by the core; keep showing the last drawable base.
    if (!current || !(base.bottomDiameter > 0 && base.topDiameter > 0 && base.height > 0)) return;
    // CylinderGeometry stands on y; turn it to stand on z with its bottom face at z = 0.
    const geometry = new THREE.CylinderGeometry(base.topDiameter / 2, base.bottomDiameter / 2, base.height, BASE_SEGMENTS)
      .rotateX(Math.PI / 2)
      .translate(0, 0, base.height / 2);
    current.base.geometry.dispose();
    current.base.geometry = geometry;
  }, [base.bottomDiameter, base.topDiameter, base.height]);

  const diameter = base.bottomDiameter;
  useEffect(() => scene.current?.frame(diameter), [diameter]);

  return <div className="viewport" ref={container} />;
}
